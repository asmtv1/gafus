// Типы для push-воркера

export interface SendStepNotificationPayload {
  notificationId: string;
}

// Re-export типы которые используются в воркере
export type { PushSubscriptionJSON } from "../data/push";
