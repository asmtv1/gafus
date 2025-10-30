"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import type { Prisma } from "@prisma/client";

const logger = createWebLogger('track-presentation-event');

interface TrackPresentationEventData {
  sessionId: string;
  viewId: string | null;
  eventType: string;
  eventName: string;
  targetElement?: string | null;
  targetSection?: string | null;
  scrollDepth?: number | null;
  timeOnPage?: number | null;
  metadata?: Prisma.InputJsonValue | null;
}

/**
 * Отследить событие на presentation.html
 */
export async function trackPresentationEvent(
  data: TrackPresentationEventData
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.presentationEvent.create({
      data: {
        sessionId: data.sessionId,
        viewId: data.viewId,
        eventType: data.eventType,
        eventName: data.eventName,
        targetElement: data.targetElement || null,
        targetSection: data.targetSection || null,
        scrollDepth: data.scrollDepth || null,
        timeOnPage: data.timeOnPage || null,
        metadata: data.metadata ?? undefined,
      },
    });

    return { success: true };
  } catch (error) {
    logger.error("Ошибка отслеживания события presentation.html", error as Error, {
      sessionId: data.sessionId,
      eventType: data.eventType,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

