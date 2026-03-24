"use server";

import {
  trackPresentationEvent as trackPresentationEventCore,
  type TrackPresentationEventData,
} from "@gafus/core/services/tracking";
import { createWebLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";

const logger = createWebLogger("web-track-presentation-event");

/**
 * Отследить событие на presentation.html. Обёртка над core.
 */
export async function trackPresentationEvent(
  data: TrackPresentationEventData,
): Promise<{ success: boolean; error?: string }> {
  try {
    return await trackPresentationEventCore(data);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "trackPresentationEvent action",
      error instanceof Error ? error : new Error(String(error)),
      { sessionId: data.sessionId, eventType: data.eventType },
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось зафиксировать событие",
    };
  }
}
