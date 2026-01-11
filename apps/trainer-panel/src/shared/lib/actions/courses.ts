"use server";

import { deleteFileFromCDN } from "@gafus/cdn-upload";
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";
import { revalidatePath, revalidateTag } from "next/cache";
import { invalidateCoursesCache } from "./invalidateCoursesCache";
import { invalidateTrainingDaysCache } from "./invalidateTrainingDaysCache";

export interface CreateCourseInput {
  name: string;
  shortDesc: string;
  description: string;
  duration: string;
  videoUrl?: string;
  logoImg: string;
  isPublic: boolean;
  isPaid: boolean;
  showInProfile: boolean;
  trainingDays: string[];
  allowedUsers: string[];
  equipment: string;
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
}

export async function createCourseServerAction(input: CreateCourseInput) {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; username: string; role: string };
  } | null;
  if (!session?.user?.id) {
    return { success: false, error: "Не авторизован" };
  }

  const authorId = session.user.id as string;
  const isPrivate = !input.isPublic;

  const course = await prisma.course.create({
    data: {
      name: input.name,
      type: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description: input.description,
      shortDesc: input.shortDesc,
      duration: input.duration,
      logoImg: input.logoImg,
      isPrivate,
      isPaid: input.isPaid,
      showInProfile: input.showInProfile ?? true,
      videoUrl: input.videoUrl || null,
      equipment: input.equipment,
      trainingLevel: input.trainingLevel,
      author: { connect: { id: authorId } },
      dayLinks: {
        create: (input.trainingDays || []).map((dayId: string, index: number) => ({
          day: { connect: { id: String(dayId) } },
          order: index + 1, // Дни начинаются с 1, а не с 0
        })),
      },
      access: isPrivate
        ? {
            create: (input.allowedUsers || []).map((userId: string) => ({
              user: { connect: { id: String(userId) } },
            })),
          }
        : undefined,
    },
  });

  revalidateTag("statistics");
  revalidatePath("/main-panel/statistics");
  
  // Инвалидируем кэш курсов при создании нового курса
  await invalidateCoursesCache();
  
  // Инвалидируем кэш дней курсов при создании курса с днями
  await invalidateTrainingDaysCache(course.id);

  return { success: true, id: course.id };
}

export interface UpdateCourseInput extends CreateCourseInput {
  id: string;
}

export async function updateCourseServerAction(input: UpdateCourseInput) {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; username: string; role: string };
  } | null;
  if (!session?.user?.id) return { success: false, error: "Не авторизован" };

  const isPrivate = !input.isPublic;

  const desiredDayIds = (input.trainingDays || []).map((dayId: string) => String(dayId));

  await prisma.$transaction(async (tx) => {
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

    // Пересобираем доступ
    await tx.courseAccess.deleteMany({ where: { courseId: input.id } });
    if (isPrivate) {
      await tx.courseAccess.createMany({
        data: (input.allowedUsers || []).map((userId: string) => ({
          courseId: input.id,
          userId: String(userId),
        })),
      });
    }
  });

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
    const relativePath = course.logoImg.replace('/uploads/', '');
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
