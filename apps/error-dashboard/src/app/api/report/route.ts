import { reportError } from "@shared/lib/actions/errors";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.warn("Received error report:", body);

    // Валидация обязательных полей
    const requiredFields = ["message", "appName", "environment", "url", "userAgent"];
    for (const field of requiredFields) {
      if (!body[field]) {
        console.warn(`Missing required field: ${field}`);
        return NextResponse.json(
          { error: `Отсутствует обязательное поле: ${field}` },
          { status: 400 },
        );
      }
    }

    // Отправляем ошибку в базу данных
    const result = await reportError({
      message: body.message,
      stack: body.stack,
      appName: body.appName,
      environment: body.environment,
      url: body.url,
      userAgent: body.userAgent,
      userId: body.userId,
      sessionId: body.sessionId,
      componentStack: body.componentStack,
      additionalContext: body.additionalContext,
      tags: body.tags || [],
    });

    if (result.success) {
      return NextResponse.json({ success: true, errorId: result.errorId }, { status: 200 });
    } else {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
  } catch (error) {
    console.error("Ошибка при обработке отчета об ошибке:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
