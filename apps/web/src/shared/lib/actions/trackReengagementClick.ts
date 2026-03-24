"use server";

import { trackReengagementClick as trackReengagementClickCore } from "@gafus/core/services/tracking";
import { createWebLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";

const logger = createWebLogger("web-track-reengagement-click");

/**
 * Отследить клик по re-engagement уведомлению. Обёртка над core.
 */
export async function trackReengagementClick(
  notificationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    return await trackReengagementClickCore(notificationId);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "trackReengagementClick action",
      error instanceof Error ? error : new Error(String(error)),
      { notificationId },
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось зафиксировать клик",
    };
  }
}
