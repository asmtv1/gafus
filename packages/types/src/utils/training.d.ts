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
    estimatedDurationSec?: number | null;
    status: TrainingStatus;
    order: number;
    isPausedOnServer?: boolean;
    remainingSecOnServer?: number;
    type?: "TRAINING" | "EXAMINATION" | "THEORY" | "BREAK" | "PRACTICE";
    checklist?: any;
    requiresVideoReport?: boolean;
    requiresWrittenFeedback?: boolean;
    hasTestQuestions?: boolean;
    userStepId?: string;
}
/** Полная информация о тренировочном дне + шаги + статус пользователя */
export interface TrainingDetail {
    trainingDayId: string;
    dayOnCourseId: string;
    displayDayNumber?: number | null;
    title: string;
    type: string;
    courseId: string;
    description: string;
    duration: string;
    userStatus: TrainingStatus;
    steps: TrainingStep[];
}
//# sourceMappingURL=training.d.ts.map