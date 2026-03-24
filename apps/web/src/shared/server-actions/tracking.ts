"use server";

/**
 * Tracking Server Actions - обёртки над trackingService для Web
 */

import * as trackingService from "@gafus/core/services/tracking";
import { createWebLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";
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
  try {
    return await trackingService.trackPresentationView(data, eventType);
  } catch (error) {
    unstable_rethrow(error);
    _logger.error(
      "trackPresentationViewAction failed",
      error instanceof Error ? error : new Error(String(error)),
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Ошибка трекинга",
    };
  }
}

/**
 * Отслеживает событие на presentation.html
 */
export async function trackPresentationEventAction(data: TrackPresentationEventData) {
  try {
    return await trackingService.trackPresentationEvent(data);
  } catch (error) {
    unstable_rethrow(error);
    _logger.error(
      "trackPresentationEventAction failed",
      error instanceof Error ? error : new Error(String(error)),
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Ошибка трекинга",
    };
  }
}

/**
 * Отслеживает клик по re-engagement уведомлению
 */
export async function trackReengagementClickAction(notificationId: string) {
  try {
    return await trackingService.trackReengagementClick(notificationId);
  } catch (error) {
    unstable_rethrow(error);
    _logger.error(
      "trackReengagementClickAction failed",
      error instanceof Error ? error : new Error(String(error)),
      { notificationId },
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Ошибка трекинга",
    };
  }
}
