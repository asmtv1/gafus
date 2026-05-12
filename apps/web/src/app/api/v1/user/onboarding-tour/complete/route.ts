import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@gafus/auth";
import { markOnboardingTourSeen } from "@gafus/core/services/user";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-user-onboarding-tour-complete");

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const data = await markOnboardingTourSeen(session.user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error("Error completing onboarding tour", error as Error);
    return NextResponse.json(
      { success: false, error: "Ошибка сохранения статуса экскурсии" },
      { status: 500 },
    );
  }
}
