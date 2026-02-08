"use server";

/**
 * Tracking Server Actions - обёртки над trackingService для Web
 */

import { createWebLogger } from "@gafus/logger";
import * as trackingService from "@gafus/core/services/tracking";
import type {
  TrackPresentationViewData,
  TrackPresentationEventData,
  PresentationEventType,
} from "@gafus/core/services/tracking";

const _logger = createWebLogger("tracking-actions");

/**
 * Отслеживает просмотр presentation.html
 */
export async function trackPresentationViewAction(
  data: TrackPresentationViewData,
  eventType: PresentationEventType = "view",
) {
  return trackingService.trackPresentationView(data, eventType);
}

/**
 * Отслеживает событие на presentation.html
 */
export async function trackPresentationEventAction(data: TrackPresentationEventData) {
  return trackingService.trackPresentationEvent(data);
}

/**
 * Отслеживает клик по re-engagement уведомлению
 */
export async function trackReengagementClickAction(notificationId: string) {
  return trackingService.trackReengagementClick(notificationId);
}
