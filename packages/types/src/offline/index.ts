export interface OfflineAction {
  id: string;
  type: "step-completion" | "profile-update" | "comment" | "rating" | "step-status-update" | "step-pause" | "step-resume";
  data: StepCompletionData | ProfileUpdateData | CommentData | RatingData | StepStatusUpdateData | StepPauseData | StepResumeData;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

export interface StepCompletionData {
  stepId: string;
  courseId: string;
  userId: string;
  completedAt: Date;
}

export interface ProfileUpdateData {
  userId: string;
  updates: {
    name?: string;
    bio?: string;
    avatarUrl?: string;
  };
}

export interface CommentData {
  courseId: string;
  userId: string;
  content: string;
  rating?: number;
}

export interface RatingData {
  courseId: string;
  userId: string;
  rating: number;
  comment?: string;
}

export interface StepStatusUpdateData {
  courseId: string;
  day: number;
  stepIndex: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED";
  stepTitle?: string;
  stepOrder?: number;
}

export interface StepPauseData {
  courseId: string;
  day: number;
  stepIndex: number;
  pausedAt: number; // timestamp когда была поставлена пауза
  timeLeft: number; // оставшееся время в секундах
}

export interface StepResumeData {
  courseId: string;
  day: number;
  stepIndex: number;
  resumedAt: number; // timestamp когда было возобновлено
  timeLeft: number; // оставшееся время в секундах
}

export interface OfflineState {
  // Упрощенный статус сети - только navigator.onLine
  isOnline: boolean;

  // Очередь синхронизации
  syncQueue: OfflineAction[];
  lastSyncTime: number | null;
  syncErrors: string[];
  maxRetries: number;
  lastSyncAttempt: number | null; // Время последней попытки синхронизации
  syncCooldown: number; // Таймаут между попытками синхронизации (в мс)

  // Действия
  setOnlineStatus: (isOnline: boolean) => void;
  addToSyncQueue: (action: Omit<OfflineAction, "id" | "timestamp" | "retryCount">) => void;
  removeFromSyncQueue: (id: string) => void;
  clearSyncQueue: () => void;
  syncOfflineActions: () => Promise<void>;
}
