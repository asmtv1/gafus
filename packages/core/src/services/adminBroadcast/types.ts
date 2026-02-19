export interface BroadcastResult {
  success: boolean;
  totalUsers: number;
  sentCount: number;
  failedCount: number;
  error?: string;
}
