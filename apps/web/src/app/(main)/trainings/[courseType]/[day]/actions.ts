"use server";

// Реэкспорт notification actions из shared для обратной совместимости
export {
  pauseNotificationAction,
  resumeNotificationAction,
  resetNotificationAction,
} from "@shared/lib/StepNotification/notificationActions";
