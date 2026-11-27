/**
 * Trainer Course Service — бизнес-логика курсов тренера.
 * Чистая логика без Next.js и CDN; app отвечает за сессию, CDN и revalidate.
 */

import { requireTrainerCourseRowsPort, type TrainerCourseRowsPort } from "./trainerCourseRowsPort";
import { createWebLogger } from "@gafus/logger";
import type { ActionResult } from "@gafus/types";
import { handlePrismaError } from "@gafus/core/errors";
import { invalidateCourseContentCache } from "../training/trainingDayContent";
import { publishCourseContentChange } from "../training/trainingContentRevision";
import type { CreateTrainerCourseInput, UpdateTrainerCourseInput } from "./schemas";
import type { CourseVersionActor } from "./courseVersionService";

const logger = createWebLogger("trainer-course");

/** Результат успешного удаления курса (logoImg для удаления из CDN в app) */
export interface DeleteCourseResult extends ActionResult {
  logoImg?: string;
}

/** DTO курса для формы редактирования (черновик с связями) */
export interface CourseDraftDto {
  id: string;
  name: string;
  guideContent: string | null;
  shortDesc: string;
  description: string;
  duration: string;
  videoUrl: string | null;
  logoImg: string;
  isPrivate: boolean;
  isPaid: boolean;
  showInProfile: boolean;
  isPersonalized: boolean;
  equipment: string;
  trainingLevel: string;
  dayLinks: { id: string; dayId: string; order: number; day: { id: string; title: string } }[];
  access: { userId: string; user: { id: string; username: string } }[];
}

/**
 * Платные курсы могут создавать только ADMIN или тренер с username gafus.
 */
export function canCreatePaidCourse(_userId: string, role: string, username: string): boolean {
  const name = (username ?? "").toLowerCase();
  return role === "ADMIN" || name === "gafus";
}

/**
 * Создание курса. Принимает id (UUID от app) и logoImg (готовый CDN URL или "").
 * Создаёт Course, DayOnCourse и CourseAccess в одной транзакции.
 */
export async function createCourse(
  input: CreateTrainerCourseInput,
  authorId: string,
  rowsPort?: TrainerCourseRowsPort,
): Promise<ActionResult & { id?: string }> {
  try {
    const isPrivate = !input.isPublic;
    const type = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const dayLinksCreate = (input.trainingDays ?? []).map((dayId, index) => ({
      day: { connect: { id: String(dayId) } },
      order: index + 1,
    }));

    await requireTrainerCourseRowsPort(rowsPort).createRow(input, authorId, type, isPrivate, dayLinksCreate);

    logger.info("Курс создан", { courseId: input.id, authorId });
    return { success: true, id: input.id };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Курс");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error ? serviceError.message : "Ошибка при создании курса";
        return { success: false, error: msg };
      }
    }
    logger.error("Ошибка при создании курса", error as Error, {
      authorId,
      courseId: input.id,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Ошибка при создании курса",
    };
  }
}

/**
 * Обновление курса. Сохраняет существующие DayOnCourse (не сбрасывает прогресс).
 * Назначения разрешены только для приватных курсов.
 */

export type CourseFullFormResult = ActionResult & {
  status?: "stale" | "not_found" | "invalid" | "unknown";
  version?: number;
};

export async function updateCourse(
  input: UpdateTrainerCourseInput,
  actor: CourseVersionActor,
  rowsPort?: TrainerCourseRowsPort,
): Promise<CourseFullFormResult> {
  if (
    !actor ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(actor.id) ||
    !["TRAINER", "ADMIN"].includes(actor.role) ||
    !Number.isInteger(input?.expectedVersion) ||
    input.expectedVersion < 1 ||
    input.expectedVersion > 2147483647
  ) {
    return { success: false, status: "invalid", error: "Требуется актуальная версия курса" };
  }
  let nextVersion: number | undefined;
  try {
    const isPrivate = !input.isPublic;

    nextVersion = await requireTrainerCourseRowsPort(rowsPort).updateRows(input, actor, isPrivate);

    invalidateCourseContentCache(input.id);
    await publishCourseContentChange();
    logger.info("Курс обновлён", { courseId: input.id });
    return { success: true, version: nextVersion };
  } catch (error) {
    if (requireTrainerCourseRowsPort(rowsPort).isVersionMismatch(error)) {
      // No child writes were performed because the conditional UPDATE
      // is the FIRST statement in the transactional mutation.
      try {
        const existing = await requireTrainerCourseRowsPort(rowsPort).readVisibleAfterStale(input.id, actor);
        return existing.length === 1
          ? { success: false, status: "stale", error: "Версия курса устарела" }
          : { success: false, status: "not_found", error: "Курс не найден" };
      } catch {
        return {
          success: false,
          status: "unknown",
          error: "Результат обновления курса неизвестен",
        };
      }
    }
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Курс");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error ? serviceError.message : "Ошибка при обновлении курса";
        return { success: false, status: "unknown", error: msg };
      }
    }
    logger.error("Ошибка при обновлении курса", error as Error, {
      courseId: input.id,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Ошибка при обновлении курса",
    };
  }
}

/**
 * Удаление курса. Удаляет зависимые записи в порядке: CourseAccess,
 * FavoriteCourse, CourseReview, UserCourse, DayOnCourse, Course.
 * Возвращает logoImg для последующего удаления файла из CDN в app.
 */
export async function deleteCourse(courseId: string, rowsPort?: TrainerCourseRowsPort): Promise<DeleteCourseResult> {
  try {
    const course = await requireTrainerCourseRowsPort(rowsPort).readLogo(courseId);

    if (!course) {
      return { success: false, error: "Курс не найден" };
    }

    await requireTrainerCourseRowsPort(rowsPort).deleteDependencies(courseId);

    invalidateCourseContentCache(courseId);
    await publishCourseContentChange();
    logger.info("Курс удалён", { courseId });
    return { success: true, logoImg: course.logoImg };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Курс");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error ? serviceError.message : "Ошибка при удалении курса";
        return { success: false, error: msg };
      }
    }
    logger.error("Ошибка при удалении курса", error as Error, { courseId });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Ошибка при удалении курса",
    };
  }
}

/**
 * Право на изменение курса: автор или вызов с allowAdmin (передавать только для ADMIN).
 */
export async function trainerCanEditCourse(
  courseId: string,
  trainerId: string,
  options?: { allowAdmin?: boolean },
  rowsPort?: TrainerCourseRowsPort,
): Promise<boolean> {
  try {
    const course = await requireTrainerCourseRowsPort(rowsPort).readAuthor(courseId);
    if (!course) return false;
    if (options?.allowAdmin) return true;
    return course.authorId === trainerId;
  } catch {
    return false;
  }
}

/**
 * Получение курса с dayLinks и access для формы редактирования.
 * Возвращает null, если курс не найден или не принадлежит тренеру.
 * При allowAdmin: true проверка автора пропускается (для ADMIN).
 */
export async function getCourseDraftWithRelations(
  courseId: string,
  trainerId: string,
  options?: { allowAdmin?: boolean },
  rowsPort?: TrainerCourseRowsPort,
): Promise<CourseDraftDto | null> {
  try {
    const course = await requireTrainerCourseRowsPort(rowsPort).readDraft(courseId);

    if (!course) return null;
    const isAuthor = course.authorId === trainerId;
    if (!options?.allowAdmin && !isAuthor) return null;

    return {
      id: course.id,
      name: course.name,
      guideContent: course.guideContent,
      shortDesc: course.shortDesc,
      description: course.description,
      duration: course.duration,
      videoUrl: course.videoUrl,
      logoImg: course.logoImg,
      isPrivate: course.isPrivate,
      isPaid: course.isPaid ?? false,
      showInProfile: (course as { showInProfile?: boolean }).showInProfile ?? true,
      isPersonalized: (course as { isPersonalized?: boolean }).isPersonalized ?? false,
      equipment: course.equipment,
      trainingLevel: course.trainingLevel,
      dayLinks: course.dayLinks.map((dl) => ({
        id: dl.id,
        dayId: dl.dayId,
        order: dl.order,
        day: dl.day,
      })),
      access: course.access.map((a) => ({
        userId: a.userId,
        user: a.user,
      })),
    };
  } catch {
    // The caller intentionally treats source failures as masked NOT_FOUND.
    // Never forward Prisma/driver error messages, stack, or actor/course IDs.
    // Logger.error accepts message-only; no new Error means no captured stack.
    logger.error("TRAINER_COURSE_DRAFT_READ_FAILED");
    return null;
  }
}
