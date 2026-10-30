import { TrainingStatus } from "@gafus/types";
const levels: Record<string,string> = {
  BEGINNER: "Начальный", INTERMEDIATE: "Средний", ADVANCED: "Продвинутый", EXPERT: "Экспертный",
};
const statuses: Record<string,string> = {
  [TrainingStatus.NOT_STARTED]: "Не начат", [TrainingStatus.IN_PROGRESS]: "В процессе",
  [TrainingStatus.COMPLETED]: "Пройден", [TrainingStatus.PAUSED]: "Приостановлен",
  [TrainingStatus.RESET]: "Сброшен",
};
export function courseLevelLabel(value: unknown): string {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(levels, value)
    ? levels[value] : "Уровень не указан";
}
export function courseProgressLabel(value: unknown): string {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(statuses, value)
    ? statuses[value] : "Нет данных о прогрессе";
}
