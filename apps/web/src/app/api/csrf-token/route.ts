import { getCSRFTokenForClient } from "@gafus/csrf";
import { NextResponse } from "next/server";

/**
 * API маршрут для получения CSRF токена клиентом
 */
export async function GET() {
  try {
    const token = await getCSRFTokenForClient();

    return NextResponse.json({ token });
  } catch (error) {
    console.error("Ошибка при генерации CSRF токена:", error);
    return NextResponse.json({ error: "Не удалось сгенерировать CSRF токен" }, { status: 500 });
  }
}
