"use server";

import {
  trackPresentationView as trackPresentationViewCore,
  type TrackPresentationViewData,
  type PresentationEventType,
} from "@gafus/core/services/tracking";
import { getErrorMessage } from "@gafus/core/errors";
import { createWebLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";

const logger = createWebLogger("web-track-presentation-view");

/**
 * Отследить просмотр presentation.html. Обёртка над core.
 */
export async function trackPresentationView(
  data: TrackPresentationViewData,
  eventType: PresentationEventType = "view",
): Promise<{ success: boolean; error?: string }> {
  try {
    return await trackPresentationViewCore(data, eventType);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "trackPresentationView action",
      error instanceof Error ? error : new Error(String(error)),
      { sessionId: data.sessionId, eventType },
    );
    return {
      success: false,
      error: getErrorMessage(error, "Не удалось зафиксировать просмотр"),
    };
  }
}
