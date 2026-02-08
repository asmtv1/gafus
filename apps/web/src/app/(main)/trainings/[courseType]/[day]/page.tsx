import { redirect } from "next/navigation";
import { Day } from "@features/training/components/Day";
import { getTrainingDayWithUserSteps } from "@shared/lib/training/getTrainingDayWithUserSteps";
import { checkDayAccess } from "@shared/lib/training/checkDayAccess";
import { generatePageMetadata } from "@gafus/metadata";
import { dayIdSchema } from "@shared/lib/validation/schemas";
import { AccessDeniedAlert } from "@features/training/components/AccessDeniedAlert";
import { getCourseMetadata } from "@gafus/core/services/course";
import { checkCourseAccessById } from "@gafus/core/services/course";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

import type { Metadata } from "next";

export default async function DayPage(props: {
  params: Promise<{ courseType: string; day: string }>;
}) {
  const { courseType, day } = await props.params;

  // Валидируем, что day является корректным ID
  const dayId = dayIdSchema.parse(day);

  // Проверяем доступ к дню (для дней типа summary)
  const accessCheck = await checkDayAccess(dayId);
  if (!accessCheck.allowed) {
    // Редиректим на список дней с параметром locked
    redirect(`/trainings/${courseType}?locked=true`);
  }

  // Создаем UserTraining при необходимости (только в компоненте страницы)
  const { training, requiresPersonalization } = await getTrainingDayWithUserSteps(courseType, dayId, {
    createIfMissing: true,
  });

  if (requiresPersonalization) {
    redirect(`/trainings/${courseType}?personalize=1`);
  }

  if (!training) {
    // Платный курс без оплаты — редирект на страницу курса с предложением оплаты (ЮKassa)
    const courseMetadata = await getCourseMetadata(courseType);
    if (courseMetadata?.isPaid && courseMetadata.id) {
      let userId: string | null = null;
      try {
        userId = await getCurrentUserId();
      } catch {
        // Гость на платном — редирект на список, там покажут оплату
        redirect(`/trainings/${courseType}`);
      }
      const { hasAccess } = await checkCourseAccessById(courseMetadata.id, userId);
      if (!hasAccess) {
        redirect(`/trainings/${courseType}`);
      }
    }
    return <AccessDeniedAlert courseType={courseType} />;
  }

  return <Day training={training} courseType={courseType} />;
}

// Генерация метаданных (read-only, не создает данные в БД)
export async function generateMetadata(props: {
  params: Promise<{ courseType: string; day: string }>;
}): Promise<Metadata> {
  const { courseType, day } = await props.params;
  // Валидируем ID дня
  const dayId = dayIdSchema.parse(day);
  // Read-only вызов без создания UserTraining
  const { training } = await getTrainingDayWithUserSteps(courseType, dayId);

  if (!training) {
    return generatePageMetadata({
      title: "Тренировка",
      description: "Детали тренировочного дня.",
    });
  }

  return generatePageMetadata({
    title: training.title,
    description: training.description,
    path: `/trainings/${courseType}/${day}`,
  });
}
