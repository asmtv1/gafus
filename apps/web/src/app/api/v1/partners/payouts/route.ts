import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { PartnerProgramError, requestPartnerPayout } from "@gafus/core/services/appSubscription";

const payoutSchema = z.object({ amountKopecks: z.number().int().positive() });

export const POST = withCSRFProtection(async (request: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ success: false, error: "Не авторизован", code: "UNAUTHORIZED" }, { status: 401 });
  const parsed = payoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Укажите корректную сумму", code: "PAYOUT_AMOUNT_INVALID" }, { status: 400 });
  try {
    const data = await requestPartnerPayout(session.user.id, parsed.data.amountKopecks);
    return NextResponse.json({ success: true, data: { id: data.id, status: data.status, amountKopecks: data.amountKopecks } }, { status: 201 });
  } catch (error) {
    if (error instanceof PartnerProgramError) {
      const status = error.code === "PARTNER_REQUIRED" ? 403 : error.code === "PAYOUT_BALANCE_INSUFFICIENT" ? 409 : 400;
      const message = error.code === "PAYOUT_BALANCE_INSUFFICIENT" ? "На балансе недостаточно средств" : "Не удалось создать заявку на выплату";
      return NextResponse.json({ success: false, error: message, code: error.code }, { status });
    }
    throw error;
  }
});
