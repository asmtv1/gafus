"use server";

import {
  deleteFileFromCDN,
  uploadFileToCDN,
  getRelativePathFromCDNUrl,
  getCourseImagePath,
} from "@gafus/cdn-upload";
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";
import { revalidatePath, revalidateTag } from "next/cache";
import { invalidateCoursesCache } from "./invalidateCoursesCache";
import { invalidateTrainingDaysCache } from "./invalidateTrainingDaysCache";
import { randomUUID } from "crypto";
import { createTrainerPanelLogger } from "@gafus/logger";

const logger = createTrainerPanelLogger("trainer-panel-create-course");

export interface CreateCourseInput {
  name: string;
  shortDesc: string;
  description: string;
  duration: string;
  videoUrl?: string;
  logoImg: string;
  isPublic: boolean;
  isPaid: boolean;
  priceRub: number | null;
  showInProfile: boolean;
  trainingDays: string[];
  allowedUsers: string[];
  equipment: string;
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
}

export async function createCourseServerAction(formData: FormData) {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; username: string; role: string };
  } | null;
  if (!session?.user?.id) {
    return { success: false, error: "Не авторизован" };
  }

  const authorId = session.user.id as string;
  const trainerId = authorId;

  // Извлекаем данные из FormData
  const name = formData.get("name")?.toString() || "";
  const shortDesc = formData.get("shortDesc")?.toString() || "";
  const description = formData.get("description")?.toString() || "";
  const duration = formData.get("duration")?.toString() || "";
  const videoUrl = formData.get("videoUrl")?.toString();
  const isPublic = formData.get("isPublic")?.toString() === "true";
  const isPaid = formData.get("isPaid")?.toString() === "true";
  const priceRubRaw = formData.get("priceRub")?.toString();
  const priceRub = priceRubRaw ? parseFloat(priceRubRaw) : null;
  if (isPaid) {
    if (priceRub == null || Number.isNaN(priceRub) || priceRub < 1 || priceRub > 999_999) {
      return { success: false, error: "Для платного курса укажите цену от 1 до 999 999 ₽" };
    }
  }
  const showInProfile = formData.get("showInProfile")?.toString() === "true";
  const trainingDays = formData.getAll("trainingDays").map(String);
  const allowedUsers = formData.getAll("allowedUsers").map(String);
  const equipment = formData.get("equipment")?.toString() || "";
  const trainingLevel =
    (formData.get("trainingLevel")?.toString() as
      | "BEGINNER"
      | "INTERMEDIATE"
      | "ADVANCED"
      | "EXPERT") || "BEGINNER";
  const logoFile = formData.get("logoImg") as File | null;

  const isPrivate = !isPublic;

  // Создаем курс в БД сначала (получаем courseId)
  let course;
  try {
    course = await prisma.course.create({
      data: {
        name,
        type: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        description,
        shortDesc,
        duration,
        logoImg: "", // Временно пустая строка, обновим после загрузки файла
        isPrivate,
        isPaid,
        priceRub: isPaid && priceRub != null ? priceRub : null,
        showInProfile: showInProfile ?? true,
        videoUrl: videoUrl || null,
        equipment,
        trainingLevel,
        author: { connect: { id: authorId } },
        dayLinks: {
          create: (trainingDays || []).map((dayId: string, index: number) => ({
            day: { connect: { id: String(dayId) } },
            order: index + 1, // Дни начинаются с 1, а не с 0
          })),
        },
        access: isPrivate
          ? {
              create: (allowedUsers || []).map((userId: string) => ({
                user: { connect: { id: String(userId) } },
              })),
            }
          : undefined,
      },
    });
  } catch (error) {
    logger.error("❌ Ошибка создания курса в БД", error as Error);
    return { success: false, error: "Не удалось создать курс" };
  }

  const courseId = course.id;

  // Загружаем файл изображения в CDN (если есть)
  let logoImgUrl: string | null = null;
  if (logoFile && logoFile.size > 0) {
    try {
      const ext = logoFile.name.split(".").pop() || "jpg";
      const uuid = randomUUID();
      const relativePath = getCourseImagePath(trainerId, courseId, uuid, ext);
      logoImgUrl = await uploadFileToCDN(logoFile, relativePath);

      // Обновляем курс с logoImg
      await prisma.course.update({
        where: { id: courseId },
        data: { logoImg: logoImgUrl },
      });

      logger.info(`✅ Изображение курса загружено: ${logoImgUrl}`);
    } catch (error) {
      // Откатываем создание курса при ошибке загрузки
      await prisma.course.delete({ where: { id: courseId } });
      logger.error("❌ Ошибка загрузки изображения курса", error as Error);
      return { success: false, error: "Не удалось загрузить изображение курса" };
    }
  }

  revalidateTag("statistics");
  revalidatePath("/main-panel/statistics");

  // Инвалидируем кэш курсов при создании нового курса
  await invalidateCoursesCache();

  // Инвалидируем кэш дней курсов при создании курса с днями
  await invalidateTrainingDaysCache(courseId);

  return { success: true, id: courseId };
}

export interface UpdateCourseInput extends CreateCourseInput {
  id: string;
}

export async function updateCourseServerAction(input: UpdateCourseInput) {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; username: string; role: string };
  } | null;
  if (!session?.user?.id) return { success: false, error: "Не авторизован" };

  if (input.isPaid && (input.priceRub == null || input.priceRub < 1 || input.priceRub > 999_999)) {
    return { success: false, error: "Для платного курса укажите цену от 1 до 999 999 ₽" };
  }

  const isPrivate = !input.isPublic;

  const desiredDayIds = (input.trainingDays || []).map((dayId: string) => String(dayId));

  await prisma.$transaction(
    async (tx) => {
      // Обновление основных полей
      await tx.course.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description,
          shortDesc: input.shortDesc,
          duration: input.duration,
          logoImg: input.logoImg,
          videoUrl: input.videoUrl || null,
          isPrivate,
          isPaid: input.isPaid,
          priceRub: input.isPaid && input.priceRub != null ? input.priceRub : null,
          showInProfile: input.showInProfile ?? true,
          equipment: input.equipment,
          trainingLevel: input.trainingLevel,
        },
      });

      // Сохраняем существующие DayOnCourse, чтобы не сбрасывать прогресс.
      const existingDayLinks = await tx.dayOnCourse.findMany({
        where: { courseId: input.id },
        select: { id: true, dayId: true, order: true },
        orderBy: { order: "asc" },
      });

      const existingByDayId = new Map<string, typeof existingDayLinks>();
      for (const link of existingDayLinks) {
        const list = existingByDayId.get(link.dayId);
        if (list) {
          list.push(link);
        } else {
          existingByDayId.set(link.dayId, [link]);
        }
      }

      const reusedLinks: { id: string; newOrder: number }[] = [];
      const newLinks: { dayId: string; order: number }[] = [];

      desiredDayIds.forEach((dayId, index) => {
        const list = existingByDayId.get(dayId);
        if (list && list.length > 0) {
          const link = list.shift();
          if (link) {
            reusedLinks.push({ id: link.id, newOrder: index + 1 });
          }
        } else {
          newLinks.push({ dayId, order: index + 1 });
        }
      });

      const removedLinks = Array.from(existingByDayId.values()).flat();
      if (removedLinks.length > 0) {
        await tx.dayOnCourse.deleteMany({
          where: { id: { in: removedLinks.map((link) => link.id) } },
        });
      }

      if (reusedLinks.length > 0) {
        const tempBase = desiredDayIds.length + existingDayLinks.length + 1000;
        for (let index = 0; index < reusedLinks.length; index += 1) {
          const link = reusedLinks[index];
          await tx.dayOnCourse.update({
            where: { id: link.id },
            data: { order: tempBase + index },
          });
        }
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

      if (reusedLinks.length > 0) {
        for (const link of reusedLinks) {
          await tx.dayOnCourse.update({
            where: { id: link.id },
            data: { order: link.newOrder },
          });
        }
      }

      // Пересобираем доступ: для платного курса не удаляем CourseAccess (оплатившие сохраняют доступ)
      if (input.isPaid) {
        const allowedSet = new Set((input.allowedUsers || []).map(String));
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
          .filter((a) => !allowedSet.has(a.userId) && !paidUserIds.has(a.userId))
          .map((a) => a.userId);
        if (toRemove.length > 0) {
          await tx.courseAccess.deleteMany({
            where: { courseId: input.id, userId: { in: toRemove } },
          });
        }
        for (const userId of allowedSet) {
          const exists = existingAccess.some((a) => a.userId === userId);
          if (!exists) {
            await tx.courseAccess.create({ data: { courseId: input.id, userId } });
          }
        }
      } else {
        await tx.courseAccess.deleteMany({ where: { courseId: input.id } });
        if (isPrivate) {
          await tx.courseAccess.createMany({
            data: (input.allowedUsers || []).map((userId: string) => ({
              courseId: input.id,
              userId: String(userId),
            })),
          });
        }
      }
    },
    {
      maxWait: 10000, // 10 секунд ожидания начала транзакции
      timeout: 20000, // 20 секунд таймаут транзакции (сложная операция)
    },
  );

  revalidateTag("statistics");
  revalidatePath("/main-panel/statistics");

  // Инвалидируем кэш курсов при обновлении курса
  await invalidateCoursesCache();

  // Инвалидируем кэш дней курсов при обновлении курса с днями
  await invalidateTrainingDaysCache(input.id);

  return { success: true };
}

export async function deleteCourseServerAction(courseId: string) {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; username: string; role: string };
  } | null;
  if (!session?.user?.id) return { success: false, error: "Не авторизован" };

  // Получаем информацию о курсе для удаления изображения
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { logoImg: true },
  });

  // Удаляем изображение курса из CDN (если есть)
  if (course?.logoImg) {
    const relativePath = getRelativePathFromCDNUrl(course.logoImg);
    try {
      await deleteFileFromCDN(relativePath);
      console.log(`🗑️ Изображение курса удалено из CDN: ${relativePath}`);
    } catch (error) {
      console.warn(`⚠️ Не удалось удалить изображение курса из CDN: ${error}`);
    }
  }

  // Удаляем зависимые записи
  await prisma.courseAccess.deleteMany({ where: { courseId } });
  await prisma.favoriteCourse.deleteMany({ where: { courseId } });
  await prisma.courseReview.deleteMany({ where: { courseId } });
  await prisma.userCourse.deleteMany({ where: { courseId } });
  await prisma.dayOnCourse.deleteMany({ where: { courseId } });
  await prisma.course.delete({ where: { id: courseId } });

  revalidateTag("statistics");
  revalidatePath("/main-panel/statistics");

  // Инвалидируем кэш курсов при удалении курса
  await invalidateCoursesCache();

  // Инвалидируем кэш дней курсов при удалении курса
  await invalidateTrainingDaysCache(courseId);

  return { success: true };
}
