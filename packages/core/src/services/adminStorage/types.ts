export interface StorageStats {
  totalExamResults: number;
  withVideo: number;
  withoutVideo: number;
  deletedVideos: number;
  completedWithVideo: number;
  pendingWithVideo: number;
  completedOlderThan30Days: number;
  pendingOlderThan90Days: number;
  deletedByReplacement: number;
  deletedByAutoCleanupCompleted: number;
  deletedByAutoCleanupPending: number;
}
