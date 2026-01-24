import { getCSRFTokenForClient } from "@gafus/csrf/server";
import { createWebLogger } from "@gafus/logger";
import { NextResponse } from "next/server";

// Создаем логгер для web API
const logger = createWebLogger("web-api-csrf");

/**
 * API маршрут для получения CSRF токена клиентом
 */
export async function GET() {
  try {
    const token = await getCSRFTokenForClient();

    return NextResponse.json({ token });
  } catch (error) {
    logger.error("Ошибка при генерации CSRF токена", error as Error, {
      operation: "generate_csrf_token",
      endpoint: "/api/csrf-token",
    });
    return NextResponse.json({ error: "Не удалось сгенерировать CSRF токен" }, { status: 500 });
  }
}
