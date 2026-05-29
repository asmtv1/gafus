import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@gafus/auth";
import { AuthorizationError } from "@gafus/core/errors";
import { getSurveyResponse, getSurveyTemplate } from "@gafus/core/services/survey";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-survey-template");

const paramsSchema = z.object({
  slug: z.string().min(1),
});

const querySchema = z.object({
  stepId: z.string().min(1).optional(),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }

    const params = paramsSchema.parse(await context.params);
    const query = querySchema.parse({
      stepId: request.nextUrl.searchParams.get("stepId") ?? undefined,
    });
    const template = getSurveyTemplate(params.slug);
    if (!template) {
      return NextResponse.json(
        { success: false, error: "Анкета не найдена", code: "SURVEY_NOT_FOUND" },
        { status: 400 },
      );
    }

    const response = query.stepId
      ? await getSurveyResponse(session.user.id, query.stepId)
      : null;

    return NextResponse.json({ success: true, data: { template, response } });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { success: false, error: error.message, code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message ?? "Ошибка валидации", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    logger.error("Failed to load survey", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
