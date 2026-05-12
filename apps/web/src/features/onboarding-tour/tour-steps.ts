export const WEB_ONBOARDING_TOUR_VERSION = "v1";

export type WebOnboardingTourStepId =
  | "start"
  | "consultations"
  | "pets"
  | "add-pet"
  | "prevention"
  | "documents"
  | "daily-course"
  | "courses"
  | "finish";

export type WebOnboardingTourTargetId =
  | "consultations-list"
  | "tab-pets"
  | "pets-add-button"
  | "pet-prevention-section"
  | "pet-documents-section"
  | "daily-course-card"
  | "courses-list";

export interface WebOnboardingTourStep {
  id: WebOnboardingTourStepId;
  title: string;
  text: string;
  route?: string;
  targetId?: WebOnboardingTourTargetId;
  primaryActionLabel?: string;
  allowSkip?: boolean;
  requiresPetCreation?: boolean;
}

export function getWebOnboardingTourSteps({
  hasPets,
}: {
  hasPets: boolean;
}): WebOnboardingTourStep[] {
  const petPreventionTarget = hasPets ? "pet-prevention-section" : "pets-add-button";
  const petDocumentsTarget = hasPets ? "pet-documents-section" : "pets-add-button";

  return [
    {
      id: "start",
      title: "Быстрый тур",
      text: "Покажем за минуту, где записаться к кинологу, добавить питомца и начать занятия.",
    },
    {
      id: "consultations",
      title: "Кинолог",
      text: "Здесь можно выбрать кинолога, посмотреть свободные слоты и записаться на консультацию.",
      route: "/consultations",
      targetId: "consultations-list",
    },
    {
      id: "pets",
      title: "Питомцы",
      text: "В этом разделе хранятся профили ваших питомцев.",
      route: "/pets",
      targetId: "tab-pets",
    },
    {
      id: "add-pet",
      title: "Добавить питомца",
      text: "Добавьте питомца, чтобы вести его данные, документы и историю процедур.",
      route: "/pets",
      targetId: "pets-add-button",
      primaryActionLabel: hasPets ? undefined : "Добавить питомца",
      allowSkip: hasPets,
      requiresPetCreation: !hasPets,
    },
    {
      id: "prevention",
      title: "Процедуры",
      text: "После добавления питомца здесь можно записывать прививки, обработки и напоминания.",
      route: "/pets",
      targetId: petPreventionTarget,
    },
    {
      id: "documents",
      title: "Документы",
      text: "К карточке питомца можно прикреплять документы: ветпаспорт, справки и другие файлы.",
      route: "/pets",
      targetId: petDocumentsTarget,
    },
    {
      id: "daily-course",
      title: "Задание дня",
      text: "Задания обновляются ежедневно и дают короткую связку упражнений для регулярной практики.",
      route: "/courses",
      targetId: "daily-course-card",
    },
    {
      id: "courses",
      title: "Остальные курсы",
      text: "Ниже находится каталог остальных курсов. Можно выбрать подходящий формат и продолжить обучение.",
      route: "/courses",
      targetId: "courses-list",
    },
    {
      id: "finish",
      title: "Готово",
      text: "Экскурсию можно будет повторить из профиля.",
    },
  ];
}
