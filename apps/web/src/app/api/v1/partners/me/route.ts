import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";
import { getPartnerProfile, getPartnerDashboard, PartnerProgramError } from "@gafus/core/services/appSubscription";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Не авторизован", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const profile = await getPartnerProfile(session.user.id);
    const data = await getPartnerDashboard(session.user.id);
    return NextResponse.json({ success: true, data: { ...data, active: profile.isActive } });
  } catch (error) {
    if (error instanceof PartnerProgramError) {
      return NextResponse.json({ success: false, error: "Партнёрская программа недоступна", code: error.code }, { status: 403 });
    }
    throw error;
  }
}
