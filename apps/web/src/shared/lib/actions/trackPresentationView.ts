"use server";

import {
  trackPresentationView as trackPresentationViewCore,
  type TrackPresentationViewData,
  type PresentationEventType,
} from "@gafus/core/services/tracking";

/**
 * Отследить просмотр presentation.html. Обёртка над core.
 */
export async function trackPresentationView(
  data: TrackPresentationViewData,
  eventType: PresentationEventType = "view",
): Promise<{ success: boolean; error?: string }> {
  return trackPresentationViewCore(data, eventType);
}
