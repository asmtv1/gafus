import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getAppSubscriptionAccess } from "@gafus/core/services/appSubscription";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Не авторизован", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const data = await getAppSubscriptionAccess(session.user.id);
  return NextResponse.json({ success: true, data });
}
