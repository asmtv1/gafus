import { TrainingStatus } from "../utils/training-status";
/**
 * Единая логика расчета статуса дня на основе статусов шагов
 * Используется на клиенте и сервере для обеспечения консистентности
 *
 * Правила:
 * - COMPLETED: все шаги COMPLETED
 * - IN_PROGRESS: есть хотя бы один IN_PROGRESS, PAUSED или COMPLETED
 * - NOT_STARTED: все шаги NOT_STARTED или пустой массив
 *
 * ВАЖНО: PAUSED шаги считаются как IN_PROGRESS для расчета статуса дня
 * Это критично для синхронизации клиента и сервера!
 */
export declare function calculateDayStatusFromStatuses(stepStatuses: (string | TrainingStatus)[]): TrainingStatus;
//# sourceMappingURL=statusCalculations.d.ts.map