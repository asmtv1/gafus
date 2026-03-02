"use server";

import {
  trackPresentationEvent as trackPresentationEventCore,
  type TrackPresentationEventData,
} from "@gafus/core/services/tracking";

/**
 * Отследить событие на presentation.html. Обёртка над core.
 */
export async function trackPresentationEvent(
  data: TrackPresentationEventData,
): Promise<{ success: boolean; error?: string }> {
  return trackPresentationEventCore(data);
}
