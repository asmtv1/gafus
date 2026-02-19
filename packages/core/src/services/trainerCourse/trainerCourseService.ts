/**
 * Trainer Course Service — бизнес-логика курсов тренера.
 * Чистая логика без Next.js и CDN; app отвечает за сессию, CDN и revalidate.
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import type { ActionResult } from "@gafus/types";
import { handlePrismaError } from "@gafus/core/errors";
import type {
  CreateTrainerCourseInput,
  UpdateTrainerCourseInput,
} from "./schemas";

const logger = createWebLogger("trainer-course");

/** Результат успешного удаления курса (logoImg для удаления из CDN в app) */
export interface DeleteCourseResult extends ActionResult {
  logoImg?: string;
}

/** DTO курса для формы редактирования (черновик с связями) */
export interface CourseDraftDto {
  id: string;
  name: string;
  shortDesc: string;
  description: string;
  duration: string;
  videoUrl: string | null;
  logoImg: string;
  isPrivate: boolean;
  isPaid: boolean;
  priceRub: number | null;
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
          priceRub:
            input.isPaid && input.priceRub != null ? input.priceRub : null,
          showInProfile: input.showInProfile ?? true,
          isPersonalized: input.isPersonalized ?? false,
          videoUrl: input.videoUrl || null,
          equipment: input.equipment ?? "",
          trainingLevel: input.trainingLevel,
          authorId,
          dayLinks: {
            create: (input.trainingDays ?? []).map((dayId, index) => ({
              day: { connect: { id: String(dayId) } },
              order: index + 1,
            })),
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
 * Для платного курса не удаляет CourseAccess у оплативших (Payment.status === "SUCCEEDED").
 */
export async function updateCourse(
  input: UpdateTrainerCourseInput,
): Promise<ActionResult> {
  try {
    const isPrivate = !input.isPublic;
    const desiredDayIds = (input.trainingDays ?? []).map((d) => String(d));

    await prisma.$transaction(
      async (tx) => {
        await tx.course.update({
          where: { id: input.id },
          data: {
            name: input.name,
            description: input.description ?? "",
            shortDesc: input.shortDesc ?? "",
            duration: input.duration,
            logoImg: input.logoImg,
            videoUrl: input.videoUrl || null,
            isPrivate,
            isPaid: input.isPaid,
            priceRub:
              input.isPaid && input.priceRub != null ? input.priceRub : null,
            showInProfile: input.showInProfile ?? true,
            isPersonalized: input.isPersonalized ?? false,
            equipment: input.equipment ?? "",
            trainingLevel: input.trainingLevel,
          },
        });

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

        if (input.isPaid) {
          const allowedSet = new Set(
            (input.allowedUsers ?? []).map(String),
          );
          const existingAccess = await tx.courseAccess.findMany({
            where: { courseId: input.id },
            select: { userId: true },
          });
          const paidUserIds = await tx.payment
            .findMany({
              where: { courseId: input.id, status: "SUCCEEDED" },
              select: { userId: true },
            })
            .then((rows) => new Set(rows.map((r) => r.userId)));
          const toRemove = existingAccess
            .filter(
              (a) => !allowedSet.has(a.userId) && !paidUserIds.has(a.userId),
            )
            .map((a) => a.userId);
          if (toRemove.length > 0) {
            await tx.courseAccess.deleteMany({
              where: { courseId: input.id, userId: { in: toRemove } },
            });
          }
          for (const userId of allowedSet) {
            const exists = existingAccess.some((a) => a.userId === userId);
            if (!exists) {
              await tx.courseAccess.create({
                data: { courseId: input.id, userId },
              });
            }
          }
        } else {
          await tx.courseAccess.deleteMany({ where: { courseId: input.id } });
          if (isPrivate && (input.allowedUsers?.length ?? 0) > 0) {
            await tx.courseAccess.createMany({
              data: (input.allowedUsers ?? []).map((userId) => ({
                courseId: input.id,
                userId: String(userId),
              })),
            });
          }
        }
      },
      { maxWait: 10000, timeout: 20000 },
    );

    logger.info("Курс обновлён", { courseId: input.id });
    return { success: true };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Курс");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error
            ? serviceError.message
            : "Ошибка при обновлении курса";
        return { success: false, error: msg };
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
 * Получение курса с dayLinks и access для формы редактирования.
 * Возвращает null, если курс не найден или не принадлежит тренеру.
 */
export async function getCourseDraftWithRelations(
  courseId: string,
  trainerId: string,
): Promise<CourseDraftDto | null> {
  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        name: true,
        shortDesc: true,
        description: true,
        duration: true,
        videoUrl: true,
        logoImg: true,
        isPrivate: true,
        isPaid: true,
        priceRub: true,
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

    if (!course || course.authorId !== trainerId) {
      return null;
    }

    return {
      id: course.id,
      name: course.name,
      shortDesc: course.shortDesc,
      description: course.description,
      duration: course.duration,
      videoUrl: course.videoUrl,
      logoImg: course.logoImg,
      isPrivate: course.isPrivate,
      isPaid: course.isPaid ?? false,
      priceRub: course.priceRub != null ? Number(course.priceRub) : null,
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
  } catch (error) {
    logger.error("Ошибка при получении черновика курса", error as Error, {
      courseId,
      trainerId,
    });
    return null;
  }
}
