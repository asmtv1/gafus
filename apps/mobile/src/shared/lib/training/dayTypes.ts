/**
 * Типы дней тренировки — логика как на web (dayTypes, Day.tsx, TrainingDayList)
 */

/** Типы дней, которые не нумеруются как «День N» */
export const NON_NUMBERED_DAY_TYPES = [
  "instructions",
  "introduction",
  "diagnostics",
  "summary",
] as const;

/** Подписи типов дней для списка и карточек (как на web TrainingDayList) */
export const DAY_TYPE_LABELS: Record<string, string> = {
  base: "Базовый день",
  regular: "Тренировочный день",
  introduction: "Вводный блок",
  instructions: "Инструкции",
  diagnostics: "Диагностика",
  summary: "Подведение итогов",
};

/**
 * Заголовок дня по типу и displayDayNumber (как на web Day.tsx)
 */
export function getDayTitle(type: string, displayDayNumber?: number | null): string {
  switch (type) {
    case "instructions":
      return "Инструкции";
    case "introduction":
      return "Вводный блок";
    case "diagnostics":
      return "Диагностика";
    case "summary":
      return "Подведение итогов";
    default:
      return displayDayNumber != null ? `День ${displayDayNumber}` : "День";
  }
}
