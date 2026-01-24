import { getCSRFTokenForClient } from "@gafus/csrf/server";
import { createErrorDashboardLogger } from "@gafus/logger";
import { NextResponse } from "next/server";

// Создаем логгер для error-dashboard (отключена отправка в error-dashboard)
const logger = createErrorDashboardLogger("error-dashboard-csrf");

export async function GET() {
  try {
    const token = await getCSRFTokenForClient();

    return NextResponse.json({ token });
  } catch (error) {
    logger.error("Error generating CSRF token", error as Error, {
      operation: "generate_csrf_token",
      endpoint: "/api/csrf-token",
    });
    return NextResponse.json({ error: "Failed to generate CSRF token" }, { status: 500 });
  }
}
