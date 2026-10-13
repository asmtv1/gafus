import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { authOptions } from "@gafus/auth";
import { startYookassaAppSubscriptionPayment } from "@gafus/core/services/appSubscription";

const startYookassaSchema = z.object({
  planCode: z.enum(["TWO_WEEKS", "MONTHLY", "THREE_MONTHS"]),
  promoCode: z
    .object({ code: z.string(), revision: z.number().int().positive() })
    .optional(),
});

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
    return NextResponse.json(
      { success: false, error: "Не авторизован", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    console.error("[app-subscription/yookassa/start] YooKassa config missing");
    return NextResponse.json(
      { success: false, error: "Платежи недоступны", code: "CONFIG" },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = startYookassaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Выберите тариф подписки", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  let data: Awaited<ReturnType<typeof startYookassaAppSubscriptionPayment>>;
  try {
    const origin = getOrigin(request);
    data = await startYookassaAppSubscriptionPayment({
      userId: session.user.id,
      origin,
      shopId,
      secretKey,
      planCode: parsed.data.planCode,
      promoCode: parsed.data.promoCode,
    });
  } catch (error) {
    console.error("[app-subscription/yookassa/start] start failed before payment response", error);
    return NextResponse.json(
      { success: false, error: "Платежи недоступны", code: "CONFIG_WEB_ORIGIN" },
      { status: 500 },
    );
  }
  if (!data.success) {
    return NextResponse.json(
      { success: false, error: data.error, code: data.code ?? "PAYMENT_ERROR" },
      {
        status:
          data.code === "PROMO_CODE_NOT_ELIGIBLE" ||
          data.code === "PROMO_CODE_FEATURE_DISABLED"
            ? 403
            : data.code === "PROMO_CODE_CHANGED" ||
                data.code === "PROMO_CODE_INACTIVE" ||
                data.code === "PROMO_CHECKOUT_IN_PROGRESS" ||
                data.code === "SUBSCRIPTION_CHECKOUT_IN_PROGRESS" ||
                data.code === "SUBSCRIPTION_ALREADY_ACTIVE"
              ? 409
              : data.code === "PROMO_CODE_NOT_FOUND"
                ? 404
                : 400,
      },
    );
  }

  return NextResponse.json({ success: true, data });
});
