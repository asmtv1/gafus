import { Day } from "@features/training/components/Day";
import { getTrainingDayWithUserSteps } from "@shared/lib/training/getTrainingDayWithUserSteps";
import { generatePageMetadata } from "@gafus/metadata";
import { dayIdSchema } from "@shared/lib/validation/schemas";

import type { Metadata } from "next";
import type { TrainingDetail } from "@gafus/types";

export default async function DayPage(props: {
  params: Promise<{ courseType: string; day: string }>;
}) {
  const { courseType, day } = await props.params;

  // Валидируем, что day является корректным ID
  const dayId = dayIdSchema.parse(day);

  // Создаем UserTraining при необходимости (только в компоненте страницы)
  const training: TrainingDetail | null = await getTrainingDayWithUserSteps(
    courseType, 
    dayId,
    { createIfMissing: true }
  );

  if (!training) {
    throw new Error("Тренировка не найдена");
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
  const training: TrainingDetail | null = await getTrainingDayWithUserSteps(
    courseType,
    dayId,
  );

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
