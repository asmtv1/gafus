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

export interface OfflineState {
  // Статус сети
  isOnline: boolean;
  isStable: boolean;
  isActuallyConnected: boolean;

  // Очередь синхронизации
  syncQueue: OfflineAction[];
  lastSyncTime: number | null;
  syncErrors: string[];
  maxRetries: number;

  // Действия
  setOnlineStatus: (isOnline: boolean) => void;
  setNetworkStability: (isStable: boolean) => void;
  setActualConnection: (isConnected: boolean) => void;
  checkExternalConnection: () => Promise<boolean>;
  addToSyncQueue: (action: Omit<OfflineAction, "id" | "timestamp" | "retryCount">) => void;
  removeFromSyncQueue: (id: string) => void;
  clearSyncQueue: () => void;
  syncOfflineActions: () => Promise<void>;
}
