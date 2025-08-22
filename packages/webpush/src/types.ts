// Типы для интеграции push-уведомлений с error-dashboard

export interface PushLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  context: string;
  message: string;
  error?:
    | {
        name: string;
        message: string;
        stack?: string;
      }
    | unknown;
  meta?: Record<string, unknown>;
  service: "push-notifications";
  userId?: string;
  notificationId?: string;
  endpoint?: string;
}

export interface PushMetrics {
  totalSent: number;
  totalFailed: number;
  successRate: number;
  averageResponseTime: number;
  lastSentAt?: string;
  lastFailedAt?: string;
}

export interface PushNotificationError {
  type: "subscription_invalid" | "network_error" | "server_error" | "quota_exceeded";
  message: string;
  endpoint: string;
  userId?: string;
  retryCount: number;
  shouldDeleteSubscription: boolean;
}
