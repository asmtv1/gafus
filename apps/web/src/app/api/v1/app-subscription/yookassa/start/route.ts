import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { authOptions } from "@gafus/auth";
import { startYookassaAppSubscriptionPayment } from "@gafus/core/services/appSubscription";

function getOrigin(request: NextRequest): string {
  const configured =
    process.env.WEB_APP_URL ??
    process.env.NEXT_PUBLIC_WEB_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL;
  const raw =
    configured ??
    (process.env.NODE_ENV !== "production"
      ? `${request.headers.get("x-forwarded-proto") ?? "http"}://${request.headers.get("host") ?? "localhost:3002"}`
      : "");
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Invalid web origin protocol");
  }
  return url.origin;
}

export const POST = withCSRFProtection(async (request: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Не авторизован", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    return NextResponse.json({ success: false, error: "Платежи недоступны", code: "CONFIG" }, { status: 500 });
  }

  let data: Awaited<ReturnType<typeof startYookassaAppSubscriptionPayment>>;
  try {
    data = await startYookassaAppSubscriptionPayment({
      userId: session.user.id,
      origin: getOrigin(request),
      shopId,
      secretKey,
    });
  } catch {
    return NextResponse.json({ success: false, error: "Платежи недоступны", code: "CONFIG_WEB_ORIGIN" }, { status: 500 });
  }
  if (!data.success) {
    return NextResponse.json({ success: false, error: data.error, code: "PAYMENT_ERROR" }, { status: 400 });
  }

  return NextResponse.json({ success: true, data });
});
