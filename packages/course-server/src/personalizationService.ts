/**
 * Personalization Service — бизнес-логика сохранения персонализации курса (имя, пол, питомец).
 * Используется server action в web.
 */

import { prisma } from "@gafus/prisma";

export interface SaveCoursePersonalizationInput {
  userDisplayName: string;
  userGender: "male" | "female";
  petName: string;
  petGender?: "male" | "female" | null;
  petNameGen?: string | null;
  petNameDat?: string | null;
  petNameAcc?: string | null;
  petNameIns?: string | null;
  petNamePre?: string | null;
}

/**
 * Проверяет, что курс персонализирован, и сохраняет/обновляет только поля персонализации в UserCourse.
 * Не трогает status, startedAt, completedAt.
 */
export async function saveCoursePersonalization(
  userId: string,
  courseId: string,
  data: SaveCoursePersonalizationInput,
): Promise<{ success: true } | { success: false; error: string }> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { isPersonalized: true },
  });
  if (!course?.isPersonalized) {
    return { success: false, error: "Курс не поддерживает персонализацию" };
  }

  const {
    userDisplayName,
    userGender,
    petName,
    petGender,
    petNameGen,
    petNameDat,
    petNameAcc,
    petNameIns,
    petNamePre,
  } = data;

  await prisma.userCourse.upsert({
    where: { userId_courseId: { userId, courseId } },
    create: {
      userId,
      courseId,
      userDisplayName,
      userGender,
      petName,
      petGender: petGender ?? null,
      petNameGen: petNameGen ?? null,
      petNameDat: petNameDat ?? null,
      petNameAcc: petNameAcc ?? null,
      petNameIns: petNameIns ?? null,
      petNamePre: petNamePre ?? null,
    },
    update: {
      userDisplayName,
      userGender,
      petName,
      petGender: petGender ?? null,
      petNameGen: petNameGen ?? null,
      petNameDat: petNameDat ?? null,
      petNameAcc: petNameAcc ?? null,
      petNameIns: petNameIns ?? null,
      petNamePre: petNamePre ?? null,
    },
  });

  return { success: true };
}
