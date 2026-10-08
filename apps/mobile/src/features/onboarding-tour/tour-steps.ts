import type { Href } from "expo-router";

export const MOBILE_ONBOARDING_TOUR_VERSION = "v1";

export type MobileOnboardingTourStepId =
  | "start"
  | "consultations"
  | "pets"
  | "add-pet"
  | "prevention"
  | "documents"
  | "daily-course"
  | "courses"
  | "finish";

export type MobileOnboardingTourTargetId =
  | "tab-more"
  | "consultations-list"
  | "tab-pets"
  | "pets-add-button"
  | "pet-prevention-section"
  | "pet-documents-section"
  | "tab-courses"
  | "daily-course-card"
  | "courses-list";

export interface MobileOnboardingTourStep {
  id: MobileOnboardingTourStepId;
  title: string;
  text: string;
  route?: Href;
  targetId?: MobileOnboardingTourTargetId;
  secondaryTargetId?: MobileOnboardingTourTargetId;
  primaryActionLabel?: string;
  allowSkip?: boolean;
  requiresPetCreation?: boolean;
}

export function getMobileOnboardingTourSteps({
  hasPets,
}: {
  hasPets: boolean;
}): MobileOnboardingTourStep[] {
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
      text: "В разделе «Меню» откройте «Кинолог», чтобы выбрать специалиста, посмотреть свободные слоты и записаться на консультацию.",
      route: "/(main)/(tabs)/consultations",
      targetId: "consultations-list",
      secondaryTargetId: "tab-more",
    },
    {
      id: "pets",
      title: "Питомцы",
      text: "В этом разделе хранятся профили ваших питомцев.",
      route: "/(main)/(tabs)/pets",
      targetId: "tab-pets",
    },
    {
      id: "add-pet",
      title: "Добавить питомца",
      text: "Добавьте питомца, чтобы вести его данные, документы и историю процедур.",
      route: "/(main)/(tabs)/pets",
      targetId: "pets-add-button",
      secondaryTargetId: "tab-pets",
      primaryActionLabel: hasPets ? undefined : "Добавить питомца",
      allowSkip: hasPets,
      requiresPetCreation: !hasPets,
    },
    {
      id: "prevention",
      title: "Процедуры",
      text: "После добавления питомца здесь можно записывать прививки, обработки и напоминания.",
      route: "/(main)/(tabs)/pets",
      targetId: petPreventionTarget,
      secondaryTargetId: "tab-pets",
    },
    {
      id: "documents",
      title: "Документы",
      text: "К карточке питомца можно прикреплять документы: ветпаспорт, справки и другие файлы.",
      route: "/(main)/(tabs)/pets",
      targetId: petDocumentsTarget,
      secondaryTargetId: "tab-pets",
    },
    {
      id: "daily-course",
      title: "Задание дня",
      text: "Задания обновляются ежедневно и дают короткую связку упражнений для регулярной практики.",
      route: "/(main)/(tabs)",
      targetId: "daily-course-card",
      secondaryTargetId: "tab-courses",
    },
    {
      id: "courses",
      title: "Остальные курсы",
      text: "Ниже находится каталог остальных курсов. Можно выбрать подходящий формат и продолжить обучение.",
      route: "/(main)/(tabs)",
      targetId: "courses-list",
      secondaryTargetId: "tab-courses",
    },
    {
      id: "finish",
      title: "Готово",
      text: "Экскурсию можно будет повторить из профиля.",
    },
  ];
}
