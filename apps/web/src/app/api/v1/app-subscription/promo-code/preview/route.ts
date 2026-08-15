import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import {
  AppSubscriptionPromoCodeDomainError,
  previewAppSubscriptionPromoCode,
} from "@gafus/core/services/appSubscription";

const previewSchema = z.object({
  planCode: z.enum(["MONTHLY", "THREE_MONTHS"]),
  promoCode: z.string(),
});

function promoErrorStatus(code: string): 400 | 403 | 404 | 409 {
  if (code === "PROMO_CODE_FEATURE_DISABLED" || code === "PROMO_CODE_NOT_ELIGIBLE") return 403;
  if (code === "PROMO_CODE_NOT_FOUND") return 404;
  if (
    code === "PROMO_CODE_INACTIVE" ||
    code === "PROMO_CODE_CHANGED" ||
    code === "PROMO_CHECKOUT_IN_PROGRESS"
  ) return 409;
  return 400;
}

export const POST = withCSRFProtection(async (request: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Не авторизован", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const parsed = previewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Некорректный промокод", code: "PROMO_CODE_INVALID_FORMAT" },
      { status: 400 },
    );
  }

  try {
    const data = await previewAppSubscriptionPromoCode({
      userId: session.user.id,
      planCode: parsed.data.planCode,
      promoCode: parsed.data.promoCode,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof AppSubscriptionPromoCodeDomainError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: promoErrorStatus(error.code) },
      );
    }
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка" },
      { status: 500 },
    );
  }
});
