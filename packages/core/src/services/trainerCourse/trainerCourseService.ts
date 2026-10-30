/**
 * Trainer Course Service — бизнес-логика курсов тренера.
 * Чистая логика без Next.js и CDN; app отвечает за сессию, CDN и revalidate.
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import type { ActionResult } from "@gafus/types";
import { handlePrismaError } from "@gafus/core/errors";
import { invalidateCourseContentCache } from "../training/trainingDayContent";
import { publishCourseContentChange } from "../training/trainingContentRevision";
import type {
  CreateTrainerCourseInput,
  UpdateTrainerCourseInput,
} from "./schemas";
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
export function canCreatePaidCourse(
  _userId: string,
  role: string,
  username: string,
): boolean {
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
): Promise<ActionResult & { id?: string }> {
  try {
    const isPrivate = !input.isPublic;
    const type = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const dayLinksCreate = (input.trainingDays ?? []).map((dayId, index) => ({
      day: { connect: { id: String(dayId) } },
      order: index + 1,
    }));

    await prisma.$transaction(async (tx) => {
      await tx.course.create({
        data: {
          id: input.id,
          name: input.name,
          type,
          description: input.description ?? "",
          shortDesc: input.shortDesc ?? "",
          duration: input.duration,
          logoImg: input.logoImg ?? "",
          isPrivate,
          isPaid: input.isPaid ?? false,
          showInProfile: input.showInProfile ?? true,
          isPersonalized: input.isPersonalized ?? false,
          guideContent: input.guideContent?.trim() || null,
          videoUrl: input.videoUrl || null,
          equipment: input.equipment ?? "",
          trainingLevel: input.trainingLevel,
          authorId,
          dayLinks: {
            create: dayLinksCreate,
          },
          access:
            isPrivate && (input.allowedUsers?.length ?? 0) > 0
              ? {
                  create: (input.allowedUsers ?? []).map((userId) => ({
                    user: { connect: { id: String(userId) } },
                  })),
                }
              : undefined,
        },
      });
    });

    logger.info("Курс создан", { courseId: input.id, authorId });
    return { success: true, id: input.id };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Курс");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error
            ? serviceError.message
            : "Ошибка при создании курса";
        return { success: false, error: msg };
      }
    }
    logger.error("Ошибка при создании курса", error as Error, {
      authorId,
      courseId: input.id,
    });
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Ошибка при создании курса",
    };
  }
}

/**
 * Обновление курса. Сохраняет существующие DayOnCourse (не сбрасывает прогресс).
 * Назначения разрешены только для приватных курсов.
 */
class CourseVersionNoMatch extends Error {}

export type CourseFullFormResult = ActionResult & {
  status?: "stale" | "not_found" | "invalid" | "unknown";
  version?: number;
};

export async function updateCourse(
  input: UpdateTrainerCourseInput,
  actor: CourseVersionActor,
): Promise<CourseFullFormResult> {
  if (!actor || !/^[A-Za-z0-9_-]{1,128}$/.test(actor.id) ||
      !["TRAINER", "ADMIN"].includes(actor.role) ||
      !Number.isInteger(input?.expectedVersion) ||
      input.expectedVersion < 1 || input.expectedVersion > 2147483647) {
    return { success: false, status: "invalid",
      error: "Требуется актуальная версия курса" };
  }
  let nextVersion: number | undefined;
  try {
    const isPrivate = !input.isPublic;

    await prisma.$transaction(
      async (tx) => {
        const desiredDayIds = (input.trainingDays ?? []).map((d) => String(d));
          // The ONLY Course row update in this transaction. Actor ownership,
          // expectedVersion and full-form metadata are applied atomically.
          // The database BEFORE UPDATE trigger alone advances Course.version.
          const newRows = actor.role === "ADMIN"
            ? await tx.$queryRaw<{ id: string; version: number }[]>`
                UPDATE "Course" SET
                  "name" = ${input.name},
                  "description" = ${input.description ?? ""},
                  "shortDesc" = ${input.shortDesc ?? ""},
                  "duration" = ${input.duration},
                  "logoImg" = ${input.logoImg},
                  "videoUrl" = ${input.videoUrl || null},
                  "isPrivate" = ${isPrivate},
                  "isPaid" = ${input.isPaid},
                  "showInProfile" = ${input.showInProfile ?? true},
                  "isPersonalized" = ${input.isPersonalized ?? false},
                  "guideContent" = CASE WHEN ${input.guideContent === undefined}
                    THEN "guideContent"
                    ELSE ${input.guideContent?.trim() || null} END,
                  "equipment" = ${input.equipment ?? ""},
                  "trainingLevel" = ${input.trainingLevel}::"TrainingLevel",
                  "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" = ${input.id} AND "version" = ${input.expectedVersion}
                RETURNING "id","version"
              `
            : await tx.$queryRaw<{ id: string; version: number }[]>`
                UPDATE "Course" SET
                  "name" = ${input.name},
                  "description" = ${input.description ?? ""},
                  "shortDesc" = ${input.shortDesc ?? ""},
                  "duration" = ${input.duration},
                  "logoImg" = ${input.logoImg},
                  "videoUrl" = ${input.videoUrl || null},
                  "isPrivate" = ${isPrivate},
                  "isPaid" = ${input.isPaid},
                  "showInProfile" = ${input.showInProfile ?? true},
                  "isPersonalized" = ${input.isPersonalized ?? false},
                  "guideContent" = CASE WHEN ${input.guideContent === undefined}
                    THEN "guideContent"
                    ELSE ${input.guideContent?.trim() || null} END,
                  "equipment" = ${input.equipment ?? ""},
                  "trainingLevel" = ${input.trainingLevel}::"TrainingLevel",
                  "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" = ${input.id} AND "authorId" = ${actor.id}
                  AND "version" = ${input.expectedVersion}
                RETURNING "id","version"
              `;
          if (newRows.length === 0) throw new CourseVersionNoMatch();
          if (newRows.length !== 1 ||
              newRows[0]?.id !== input.id ||
              newRows[0]?.version !== input.expectedVersion + 1)
            throw new Error("COURSE_VERSION_UNEXPECTED_UPDATE");
          nextVersion = newRows[0].version;

          const existingDayLinks = await tx.dayOnCourse.findMany({
          where: { courseId: input.id },
          select: { id: true, dayId: true, order: true },
          orderBy: { order: "asc" },
        });

        const existingByDayId = new Map<string, typeof existingDayLinks>();
        for (const link of existingDayLinks) {
          const list = existingByDayId.get(link.dayId) ?? [];
          list.push(link);
          existingByDayId.set(link.dayId, list);
        }

        const reusedLinks: { id: string; newOrder: number }[] = [];
        const newLinks: { dayId: string; order: number }[] = [];

        desiredDayIds.forEach((dayId, index) => {
          const list = existingByDayId.get(dayId);
          if (list && list.length > 0) {
            const link = list.shift();
            if (link) reusedLinks.push({ id: link.id, newOrder: index + 1 });
          } else {
            newLinks.push({ dayId, order: index + 1 });
          }
        });

        const removedLinks = Array.from(existingByDayId.values()).flat();
        if (removedLinks.length > 0) {
          await tx.dayOnCourse.deleteMany({
            where: { id: { in: removedLinks.map((l) => l.id) } },
          });
        }

        const tempBase =
          desiredDayIds.length + existingDayLinks.length + 1000;
        for (let i = 0; i < reusedLinks.length; i += 1) {
          const link = reusedLinks[i];
          await tx.dayOnCourse.update({
            where: { id: link.id },
            data: { order: tempBase + i },
          });
        }

        if (newLinks.length > 0) {
          await tx.dayOnCourse.createMany({
            data: newLinks.map((link) => ({
              courseId: input.id,
              dayId: link.dayId,
              order: link.order,
            })),
          });
        }

        for (const link of reusedLinks) {
          await tx.dayOnCourse.update({
            where: { id: link.id },
            data: { order: link.newOrder },
          });
        }

        await tx.courseAccess.deleteMany({ where: { courseId: input.id } });
        if (isPrivate && input.allowedUsers?.length) {
          await tx.courseAccess.createMany({
            data: input.allowedUsers.map(userId => ({
              courseId: input.id, userId: String(userId),
            })),
          });
        }
      },
      { maxWait: 10000, timeout: 20000 },
    );

    invalidateCourseContentCache(input.id);
    await publishCourseContentChange();
    logger.info("Курс обновлён", { courseId: input.id });
    return { success: true, version: nextVersion };
  } catch (error) {
    if (error instanceof CourseVersionNoMatch) {
      // No child writes were performed because the conditional UPDATE
      // is the FIRST statement in the transactional mutation.
      try {
        const existing = actor.role === "ADMIN"
          ? await prisma.$queryRaw<{ id: string }[]>`
              SELECT "id" FROM "Course" WHERE "id" = ${input.id}
            `
          : await prisma.$queryRaw<{ id: string }[]>`
              SELECT "id" FROM "Course"
              WHERE "id" = ${input.id} AND "authorId" = ${actor.id}
            `;
        return existing.length === 1
          ? { success: false, status: "stale", error: "Версия курса устарела" }
          : { success: false, status: "not_found", error: "Курс не найден" };
      } catch {
        return { success: false, status: "unknown",
          error: "Результат обновления курса неизвестен" };
      }
    }
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Курс");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error
            ? serviceError.message
            : "Ошибка при обновлении курса";
        return { success: false, status: "unknown", error: msg };
      }
    }
    logger.error("Ошибка при обновлении курса", error as Error, {
      courseId: input.id,
    });
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Ошибка при обновлении курса",
    };
  }
}

/**
 * Удаление курса. Удаляет зависимые записи в порядке: CourseAccess,
 * FavoriteCourse, CourseReview, UserCourse, DayOnCourse, Course.
 * Возвращает logoImg для последующего удаления файла из CDN в app.
 */
export async function deleteCourse(
  courseId: string,
): Promise<DeleteCourseResult> {
  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { logoImg: true },
    });

    if (!course) {
      return { success: false, error: "Курс не найден" };
    }

    await prisma.courseAccess.deleteMany({ where: { courseId } });
    await prisma.favoriteCourse.deleteMany({ where: { courseId } });
    await prisma.courseReview.deleteMany({ where: { courseId } });
    await prisma.userCourse.deleteMany({ where: { courseId } });
    await prisma.dayOnCourse.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });

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
          serviceError instanceof Error
            ? serviceError.message
            : "Ошибка при удалении курса";
        return { success: false, error: msg };
      }
    }
    logger.error("Ошибка при удалении курса", error as Error, { courseId });
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Ошибка при удалении курса",
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
): Promise<boolean> {
  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { authorId: true },
    });
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
): Promise<CourseDraftDto | null> {
  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        name: true,
        guideContent: true,
        shortDesc: true,
        description: true,
        duration: true,
        videoUrl: true,
        logoImg: true,
        isPrivate: true,
        isPaid: true,
        showInProfile: true,
        isPersonalized: true,
        equipment: true,
        trainingLevel: true,
        authorId: true,
        dayLinks: {
          select: {
            id: true,
            dayId: true,
            order: true,
            day: { select: { id: true, title: true } },
          },
          orderBy: { order: "asc" },
        },
        access: {
          select: {
            userId: true,
            user: { select: { id: true, username: true } },
          },
        },
      },
    });

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
      isPersonalized:
        (course as { isPersonalized?: boolean }).isPersonalized ?? false,
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
