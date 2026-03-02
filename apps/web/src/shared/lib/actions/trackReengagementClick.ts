"use server";

import { trackReengagementClick as trackReengagementClickCore } from "@gafus/core/services/tracking";

/**
 * Отследить клик по re-engagement уведомлению. Обёртка над core.
 */
export async function trackReengagementClick(
  notificationId: string,
): Promise<{ success: boolean; error?: string }> {
  return trackReengagementClickCore(notificationId);
}
