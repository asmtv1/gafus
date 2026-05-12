import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getAppSubscriptionOffer } from "@gafus/core/services/appSubscription";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Не авторизован", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const data = await getAppSubscriptionOffer(session.user.id);
  return NextResponse.json({ success: true, data });
}
