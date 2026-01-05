export interface OfflineAction {
  id: string;
  type: "step-completion" | "profile-update" | "comment" | "rating" | "step-status-update" | "step-pause" | "step-resume" | "cache-invalidation" | "favorite-toggle";
  data: StepCompletionData | ProfileUpdateData | CommentData | RatingData | StepStatusUpdateData | StepPauseData | StepResumeData | CacheInvalidationData | FavoriteToggleData;
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
  dayOnCourseId: string;
  stepIndex: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED";
  stepTitle?: string;
  stepOrder?: number;
}

export interface StepPauseData {
  courseId: string;
  dayOnCourseId: string;
  stepIndex: number;
  pausedAt: number; // timestamp когда была поставлена пауза
  timeLeft: number; // оставшееся время в секундах
}

export interface StepResumeData {
  courseId: string;
  dayOnCourseId: string;
  stepIndex: number;
  resumedAt: number; // timestamp когда было возобновлено
  timeLeft: number; // оставшееся время в секундах
}

export interface CacheInvalidationData {
  userId: string;
  cacheKeys: string[];
}

export interface FavoriteToggleData {
  courseId: string;
  action: 'add' | 'remove';
}

export interface OfflineState {
  // Упрощенный статус сети - только navigator.onLine
  isOnline: boolean;
  activeDownloads: number;

  // Очередь синхронизации
  syncQueue: OfflineAction[];
  lastSyncTime: number | null;
  syncErrors: string[];
  maxRetries: number;
  lastSyncAttempt: number | null; // Время последней попытки синхронизации
  syncCooldown: number; // Таймаут между попытками синхронизации (в мс)

  // Действия
  setOnlineStatus: (isOnline: boolean) => void;
  startDownload: () => void;
  finishDownload: () => void;
  addToSyncQueue: (action: Omit<OfflineAction, "id" | "timestamp" | "retryCount">) => void;
  removeFromSyncQueue: (id: string) => void;
  clearSyncQueue: () => void;
  cleanupOldActions: () => void;
  syncOfflineActions: () => Promise<void>;
}
