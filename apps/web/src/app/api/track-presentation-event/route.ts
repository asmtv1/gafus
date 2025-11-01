import { NextRequest, NextResponse } from "next/server";
import { trackPresentationEvent } from "@shared/lib/actions/trackPresentationEvent";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger('api-track-presentation-event');

/**
 * API endpoint для отслеживания событий на presentation.html
 * Клики, достижения секций, вехи прокрутки
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sessionId,
      eventType,
      eventName,
      targetElement,
      targetSection,
      scrollDepth,
      timeOnPage,
      metadata,
    } = body;

    if (!sessionId || !eventType || !eventName) {
      return NextResponse.json(
        { error: "Не указаны обязательные параметры" },
        { status: 400 }
      );
    }

    // Находим соответствующий PresentationView
    const { prisma } = await import("@gafus/prisma");
    const view = await prisma.presentationView.findFirst({
      where: { sessionId },
      orderBy: { firstViewAt: 'desc' },
    });

    const result = await trackPresentationEvent({
      sessionId,
      viewId: view?.id || null,
      eventType,
      eventName,
      targetElement: targetElement || null,
      targetSection: targetSection || null,
      scrollDepth: scrollDepth || null,
      timeOnPage: timeOnPage || null,
      metadata: metadata || null,
    });

    if (result.success) {
      // Обновляем счетчик кликов в PresentationView
      if (eventType === 'click' && eventName === 'cta_click' && view) {
        await prisma.presentationView.update({
          where: { id: view.id },
          data: {
            ctaClicks: { increment: 1 }
          }
        });
      }

      // Обновляем достижения секций
      if (eventType === 'section_reached' && view) {
        const sectionMap: Record<string, string> = {
          'problem_reached': 'reachedProblem',
          'solution_reached': 'reachedSolution',
          'features_reached': 'reachedFeatures',
          'comparison_reached': 'reachedComparison',
          'goals_reached': 'reachedGoals',
          'contact_reached': 'reachedContact',
        };

        const fieldName = sectionMap[eventName];
        if (fieldName && timeOnPage) {
          await prisma.presentationView.update({
            where: { id: view.id },
            data: {
              [fieldName]: timeOnPage
            }
          });
        }
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: result.error || "Ошибка трекинга" },
      { status: 500 }
    );
  } catch (error) {
    logger.error("API: Ошибка трекинга события presentation.html", error as Error);

    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}


