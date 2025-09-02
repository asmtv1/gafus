export interface OfflineAction {
  id: string;
  type: "step-completion" | "profile-update" | "comment" | "rating" | "step-status-update";
  data: StepCompletionData | ProfileUpdateData | CommentData | RatingData | StepStatusUpdateData;
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
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  stepTitle?: string;
  stepOrder?: number;
}

// Типы для качества соединения
export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'offline';

export interface NetworkMetrics {
  latency: number; // в миллисекундах
  quality: ConnectionQuality;
  lastChecked: number;
  consecutiveFailures: number;
  adaptiveInterval: number; // текущий интервал проверки
}

export interface OfflineState {
  // Статус сети
  isOnline: boolean;
  isStable: boolean;
  isActuallyConnected: boolean;
  connectionQuality: ConnectionQuality;
  networkMetrics: NetworkMetrics;

  // Очередь синхронизации
  syncQueue: OfflineAction[];
  lastSyncTime: number | null;
  syncErrors: string[];
  maxRetries: number;
  lastSyncAttempt: number | null; // Время последней попытки синхронизации
  syncCooldown: number; // Таймаут между попытками синхронизации (в мс)

  // Действия
  setOnlineStatus: (isOnline: boolean) => void;
  setNetworkStability: (isStable: boolean) => void;
  setActualConnection: (isConnected: boolean) => void;
  setConnectionQuality: (quality: ConnectionQuality) => void;
  checkExternalConnection: () => Promise<boolean>;
  checkConnectionQuality: () => Promise<ConnectionQuality>;
  addToSyncQueue: (action: Omit<OfflineAction, "id" | "timestamp" | "retryCount">) => void;
  removeFromSyncQueue: (id: string) => void;
  clearSyncQueue: () => void;
  syncOfflineActions: () => Promise<void>;
}
