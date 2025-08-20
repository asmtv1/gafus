import { Day } from "@features/training/components/Day";
import { getTrainingDayWithUserSteps } from "@shared/lib/training/getTrainingDayWithUserSteps";

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

  const training: TrainingDetail | null = await getTrainingDayWithUserSteps(courseType, dayNumber);

  if (!training) {
    throw new Error("Тренировка не найдена");
  }

  return <Day training={training} />;
}

// Генерация метаданных
export async function generateMetadata(props: {
  params: Promise<{ courseType: string; day: string }>;
}) {
  const { courseType, day } = await props.params;
  const training: TrainingDetail | null = await getTrainingDayWithUserSteps(
    courseType,
    Number(day),
  );

  if (!training) {
    return {
      title: "Тренировка",
      description: "Детали тренировочного дня.",
    };
  }

  return {
    title: training.title,
    description: training.description,
  };
}
