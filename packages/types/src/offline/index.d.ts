export interface OfflineAction {
  id: string;
  type: "step-completion" | "profile-update" | "comment" | "rating";
  data: StepCompletionData | ProfileUpdateData | CommentData | RatingData;
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
export interface OfflineState {
  isOnline: boolean;
  isStable: boolean;
  isActuallyConnected: boolean;
  syncQueue: OfflineAction[];
  lastSyncTime: number | null;
  syncErrors: string[];
  maxRetries: number;
  setOnlineStatus: (isOnline: boolean) => void;
  setNetworkStability: (isStable: boolean) => void;
  setActualConnection: (isConnected: boolean) => void;
  checkActualConnection: () => Promise<boolean>;
  addToSyncQueue: (action: Omit<OfflineAction, "id" | "timestamp" | "retryCount">) => void;
  removeFromSyncQueue: (id: string) => void;
  clearSyncQueue: () => void;
  syncOfflineActions: () => Promise<void>;
}
//# sourceMappingURL=index.d.ts.map
