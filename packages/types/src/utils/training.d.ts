import type { TrainingStatus } from "./training-status";
export interface TrainingDayUtil {
    day: number;
    title: string;
    userStatus: TrainingStatus;
    courseId: string;
}
/** Тип шага тренировки с прогрессом пользователя */
export interface TrainingStep {
    id: string;
    videoUrl: string | null;
    pdfUrls?: string[];
    imageUrls?: string[];
    title: string;
    description: string;
    durationSec: number;
    status: TrainingStatus;
    order: number;
}
/** Полная информация о тренировочном дне + шаги + статус пользователя */
export interface TrainingDetail {
    trainingDayId: string;
    day: number;
    title: string;
    type: string;
    courseId: string;
    description: string;
    duration: string;
    userStatus: TrainingStatus;
    steps: TrainingStep[];
}
//# sourceMappingURL=training.d.ts.map