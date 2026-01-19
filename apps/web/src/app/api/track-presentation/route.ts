import { NextRequest, NextResponse } from "next/server";
import { trackPresentationView } from "@gafus/core/services/tracking";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger('api-track-presentation');

/**
 * API endpoint для отслеживания просмотров presentation.html
 * Поддерживает события: view, heartbeat, exit
 */
export async function POST(request: NextRequest) {
  try {
    // Обработка sendBeacon (blob) и обычного fetch (JSON)
    let body;
    const contentType = request.headers.get("content-type");
    
    if (contentType?.includes("application/json")) {
      try {
        const text = await request.text();
        body = text ? JSON.parse(text) : {};
      } catch (parseError) {
        logger.error("Failed to parse JSON body", parseError as Error, {
          operation: 'parse_json_error',
          contentType,
        });
        return NextResponse.json(
          { error: "Invalid JSON in request body" },
          { status: 400 }
        );
      }
    } else {
      // sendBeacon отправляет blob, нужно распарсить
      try {
        const blob = await request.blob();
        const text = await blob.text();
        body = text ? JSON.parse(text) : {};
      } catch (parseError) {
        logger.error("Failed to parse blob body", parseError as Error, {
          operation: 'parse_blob_error',
        });
        return NextResponse.json(
          { error: "Invalid JSON in request body" },
          { status: 400 }
        );
      }
    }

    const {
      sessionId,
      visitorId,
      referrer,
      referrerDomain,
      utmSource,
      utmMedium,
      utmCampaign,
      ref,
      campaign,
      source,
      tag,
      userAgent,
      ipAddress,
      language,
      deviceType,
      screenWidth,
      screenHeight,
      timeOnPage,
      scrollDepth,
      additionalData,
      eventType = "view",
    } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "ID сессии не указан" },
        { status: 400 }
      );
    }

    // Получаем IP адрес из заголовков если не передан
    const clientIp =
      ipAddress ||
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      null;

    const result = await trackPresentationView(
      {
        sessionId,
        visitorId: visitorId || null,
        referrer: referrer || null,
        referrerDomain: referrerDomain || null,
        utmSource: utmSource || null,
        utmMedium: utmMedium || null,
        utmCampaign: utmCampaign || null,
        ref: ref || null,
        campaign: campaign || null,
        source: source || null,
        tag: tag || null,
        userAgent: userAgent || null,
        ipAddress: clientIp,
        language: language || null,
        deviceType: deviceType || null,
        screenWidth: screenWidth || null,
        screenHeight: screenHeight || null,
        timeOnPage: timeOnPage || null,
        scrollDepth: scrollDepth || null,
        additionalData: additionalData || null,
      },
      eventType as "view" | "heartbeat" | "exit"
    );

    if (result.success) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: result.error || "Ошибка трекинга" },
      { status: 500 }
    );
  } catch (error) {
    logger.error("API: Ошибка трекинга presentation.html", error as Error);

    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

