import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@gafus/auth";
import { getOnboardingTourStatus } from "@gafus/core/services/user";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-user-onboarding-tour-status");

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const data = await getOnboardingTourStatus(session.user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error("Error getting onboarding tour status", error as Error);
    return NextResponse.json(
      { success: false, error: "Ошибка получения статуса экскурсии" },
      { status: 500 },
    );
  }
}
