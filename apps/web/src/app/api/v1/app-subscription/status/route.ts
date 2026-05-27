import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import {
  getAppSubscriptionAccess,
  reconcilePendingYookassaAppSubscription,
} from "@gafus/core/services/appSubscription";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Не авторизован", code: "UNAUTHORIZED" }, { status: 401 });
  }

  if (process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY) {
    await reconcilePendingYookassaAppSubscription({
      userId: session.user.id,
      shopId: process.env.YOOKASSA_SHOP_ID,
      secretKey: process.env.YOOKASSA_SECRET_KEY,
    });
  }

  const data = await getAppSubscriptionAccess(session.user.id);
  return NextResponse.json({ success: true, data });
}
