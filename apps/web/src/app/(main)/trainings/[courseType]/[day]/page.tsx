import { Day } from "@features/training/components/Day";
import { getTrainingDayWithUserSteps } from "@shared/lib/training/getTrainingDayWithUserSteps";
import { generatePageMetadata } from "@gafus/metadata";

import type { Metadata } from "next";
import type { TrainingDetail } from "@gafus/types";

export default async function DayPage(props: {
  params: Promise<{ courseType: string; day: string }>;
}) {
  const { courseType, day } = await props.params;

  // Валидируем, что day является корректным числом
  const dayNumber = Number(day);
  if (isNaN(dayNumber) || dayNumber < 1) {
    throw new Error("Некорректный номер дня");
  }

  // Создаем UserTraining при необходимости (только в компоненте страницы)
  const training: TrainingDetail | null = await getTrainingDayWithUserSteps(
    courseType, 
    dayNumber,
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
  // Read-only вызов без создания UserTraining
  const training: TrainingDetail | null = await getTrainingDayWithUserSteps(
    courseType,
    Number(day),
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
