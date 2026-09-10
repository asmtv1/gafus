import { Hono } from "hono";
import { z } from "zod";
import {
  PartnerProgramError,
  getPartnerProfile,
  getPartnerDashboard,
  requestPartnerPayout,
} from "@gafus/core/services/appSubscription";

export const partnersRoutes = new Hono();

function errorStatus(error: PartnerProgramError) {
  switch (error.code) {
    case "PARTNER_REQUIRED": return 403;
    case "REFERRAL_INVALID": return 404;
    case "REFERRAL_SELF": case "REFERRAL_ALREADY_SET": return 409;
    case "PAYOUT_BALANCE_INSUFFICIENT": return 409;
    default: return 400;
  }
}

function partnerError(c: import("hono").Context, error: unknown) {
  if (error instanceof PartnerProgramError) return c.json({ success: false, code: error.code, error: error.message }, errorStatus(error));
  return c.json({ success: false, code: "PARTNER_ERROR", error: "Внутренняя ошибка" }, 500);
}

partnersRoutes.get("/me", async (c) => {
  try {
    const user = c.get("user");
    const profile = await getPartnerProfile(user.id);
    const data = await getPartnerDashboard(user.id);
    return c.json({ success: true, data: { ...data, active: profile.isActive } });
  } catch (error) { return partnerError(c, error); }
});

partnersRoutes.post("/attribution", (c) => c.json({
  success: false,
  code: "DEPRECATED_PARTNER_ATTRIBUTION_FLOW",
  error: "Этот способ привязки партнёра больше не поддерживается",
}, 410));

partnersRoutes.post("/payouts", async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    const parsed = z.object({ amountKopecks: z.number().int().positive() }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, code: "PAYOUT_AMOUNT_INVALID", error: "Некорректная сумма" }, 400);
    const data = await requestPartnerPayout(c.get("user").id, parsed.data.amountKopecks);
    return c.json({ success: true, data: { id: data.id, status: data.status, amountKopecks: data.amountKopecks } }, 201);
  } catch (error) { return partnerError(c, error); }
});
