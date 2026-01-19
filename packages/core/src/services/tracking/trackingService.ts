/**
 * Tracking Service - бизнес-логика отслеживания событий
 * 
 * Этот модуль содержит чистую бизнес-логику без Next.js специфики.
 * Используется для отслеживания просмотров и событий на presentation.html,
 * а также кликов по re-engagement уведомлениям.
 */

import { prisma, type Prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

const logger = createWebLogger('tracking-service');

// ========== Presentation View Tracking ==========

const trackPresentationViewSchema = z.object({
  sessionId: z.string().min(1),
  visitorId: z.string().nullable().optional(),
  referrer: z.string().nullable().optional(),
  referrerDomain: z.string().nullable().optional(),
  utmSource: z.string().nullable().optional(),
  utmMedium: z.string().nullable().optional(),
  utmCampaign: z.string().nullable().optional(),
  ref: z.string().nullable().optional(),
  campaign: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  tag: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  deviceType: z.enum(['mobile', 'tablet', 'desktop']).nullable().optional(),
  screenWidth: z.number().int().positive().nullable().optional(),
  screenHeight: z.number().int().positive().nullable().optional(),
  timeOnPage: z.number().int().nonnegative().nullable().optional(),
  scrollDepth: z.number().int().min(0).max(100).nullable().optional(),
  additionalData: z.record(z.any()).nullable().optional(),
});

export type TrackPresentationViewData = z.infer<typeof trackPresentationViewSchema>;
export type PresentationEventType = "view" | "heartbeat" | "exit";

/**
 * Отслеживает просмотр presentation.html
 * @param data - Данные просмотра
 * @param eventType - Тип события (view, heartbeat, exit)
 */
export async function trackPresentationView(
  data: TrackPresentationViewData,
  eventType: PresentationEventType = "view"
): Promise<{ success: boolean; error?: string }> {
  try {
    const safeData = trackPresentationViewSchema.parse(data);

    if (eventType === "view") {
      // Создаём новую запись при первом просмотре
      await prisma.presentationView.create({
        data: {
          sessionId: safeData.sessionId,
          visitorId: safeData.visitorId || null,
          referrer: safeData.referrer || null,
          referrerDomain: safeData.referrerDomain || null,
          utmSource: safeData.utmSource || null,
          utmMedium: safeData.utmMedium || null,
          utmCampaign: safeData.utmCampaign || null,
          refParam: safeData.ref || null,
          campaignParam: safeData.campaign || null,
          sourceParam: safeData.source || null,
          tagParam: safeData.tag || null,
          userAgent: safeData.userAgent || null,
          ipAddress: safeData.ipAddress || null,
          language: safeData.language || null,
          deviceType: safeData.deviceType || null,
          screenWidth: safeData.screenWidth || null,
          screenHeight: safeData.screenHeight || null,
          timeOnPage: safeData.timeOnPage || null,
          scrollDepth: safeData.scrollDepth || null,
          additionalData: safeData.additionalData ?? undefined,
          firstViewAt: new Date(),
          lastViewAt: new Date(),
        },
      });

      logger.info("Просмотр presentation.html зафиксирован", {
        sessionId: safeData.sessionId,
        referrer: safeData.referrer,
      });
    } else if (eventType === "heartbeat" || eventType === "exit") {
      // Обновляем существующую запись при heartbeat или выходе
      const existingView = await prisma.presentationView.findFirst({
        where: { sessionId: safeData.sessionId },
        orderBy: { firstViewAt: "desc" },
      });

      if (existingView) {
        await prisma.presentationView.update({
          where: { id: existingView.id },
          data: {
            lastViewAt: new Date(),
            timeOnPage: safeData.timeOnPage || existingView.timeOnPage,
            scrollDepth: safeData.scrollDepth !== null && safeData.scrollDepth !== undefined
              ? Math.max(safeData.scrollDepth, existingView.scrollDepth || 0)
              : existingView.scrollDepth,
            sessionEndedAt: eventType === "exit" ? new Date() : null,
          },
        });

        if (eventType === "exit") {
          logger.info("Выход с presentation.html зафиксирован", {
            sessionId: safeData.sessionId,
            timeOnPage: safeData.timeOnPage,
            scrollDepth: safeData.scrollDepth,
          });
        }
      } else {
        // Если записи нет, создаём новую
        await prisma.presentationView.create({
          data: {
            sessionId: safeData.sessionId,
            referrer: safeData.referrer || null,
            referrerDomain: safeData.referrerDomain || null,
            utmSource: safeData.utmSource || null,
            utmMedium: safeData.utmMedium || null,
            utmCampaign: safeData.utmCampaign || null,
            userAgent: safeData.userAgent || null,
            ipAddress: safeData.ipAddress || null,
            language: safeData.language || null,
            timeOnPage: safeData.timeOnPage || null,
            scrollDepth: safeData.scrollDepth || null,
            additionalData: safeData.additionalData ?? undefined,
            firstViewAt: new Date(),
            lastViewAt: new Date(),
            sessionEndedAt: eventType === "exit" ? new Date() : null,
          },
        });
      }
    }

    return { success: true };
  } catch (error) {
    logger.error("Ошибка отслеживания просмотра presentation.html", error as Error, {
      sessionId: data.sessionId,
      eventType,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

// ========== Presentation Event Tracking ==========

export interface TrackPresentationEventData {
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
 * Отслеживает событие на presentation.html
 * @param data - Данные события
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

// ========== Reengagement Click Tracking ==========

/**
 * Отслеживает клик по re-engagement уведомлению
 * @param notificationId - ID уведомления
 */
export async function trackReengagementClick(
  notificationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!notificationId) {
      return {
        success: false,
        error: "ID уведомления не указан"
      };
    }

    await prisma.reengagementNotification.update({
      where: { id: notificationId },
      data: {
        clicked: true,
        clickedAt: new Date()
      }
    });

    logger.info('Клик по re-engagement уведомлению отслежен', { notificationId });

    return { success: true };
  } catch (error) {
    // Не логируем как ошибку если запись не найдена
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      logger.warn('Запись уведомления не найдена', { notificationId });
      return { success: true };
    }

    logger.error('Ошибка отслеживания клика', error as Error, { notificationId });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка'
    };
  }
}
