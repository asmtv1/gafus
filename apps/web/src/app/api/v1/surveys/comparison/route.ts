import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@gafus/auth";
import { AuthorizationError } from "@gafus/core/errors";
import { getSurveyComparison } from "@gafus/core/services/survey";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-survey-comparison");

const querySchema = z.object({
  courseId: z.string().min(1),
  familySlug: z.string().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }

    const query = querySchema.parse({
      courseId: request.nextUrl.searchParams.get("courseId"),
      familySlug: request.nextUrl.searchParams.get("familySlug"),
    });
    const comparison = await getSurveyComparison(
      session.user.id,
      query.courseId,
      query.familySlug,
    );

    return NextResponse.json({ success: true, data: comparison });
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
    logger.error("Failed to load survey comparison", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
