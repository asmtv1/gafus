import { Hono } from "hono";
import { z } from "zod/v3";
import {
  getPartnerAdminBalanceDetail,
  getPartnerAdminBalanceDetailPage,
  listPartnerAdminBalances,
  listPartnerAdminBalancePage,
  markPartnerBalancePaidAdmin,
} from "@gafus/subscription-write-server";

import { requireRole } from "../../middleware/auth.js";

export const adminPartnerRoutes = new Hono();

adminPartnerRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
});

function isPartnerId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

function mapError(error: unknown) {
  return error instanceof Error && error.message === "FORBIDDEN"
    ? { status: 403 as const, code: "FORBIDDEN" }
    : { status: 500 as const, code: "ADMIN_PARTNERS_INTERNAL" };
}

adminPartnerRoutes.get("/", requireRole("ADMIN"), async c => {
  try {
    if (c.req.query("page") !== undefined) {
      const parsed = z.object({
        page:z.coerce.number().int().min(1).max(10000),
        pageSize:z.coerce.number().int().refine(v=>[25,50,100].includes(v)).default(25),
        search:z.string().trim().max(128).default(""),
      }).safeParse(c.req.query());
      if (!parsed.success) return c.json({success:false,code:"INVALID_PAGE"},400);
      return c.json({success:true,data:await listPartnerAdminBalancePage(c.get("user").id,parsed.data)});
    }
    return c.json({ success: true, data: await listPartnerAdminBalances(c.get("user").id) });
  } catch (error) {
    const mapped = mapError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status as 500);
  }
});

adminPartnerRoutes.get("/:partnerId", requireRole("ADMIN"), async c => {
  const partnerId = c.req.param("partnerId");
  if (!isPartnerId(partnerId)) return c.json({ success: false, code: "INVALID_PARTNER_ID" }, 400);
  try {
    const paged=c.req.query("referralsPage")!==undefined||c.req.query("payoutsPage")!==undefined;
    const parsed=z.object({
      referralsPage:z.coerce.number().int().min(1).max(10000).default(1),
      payoutsPage:z.coerce.number().int().min(1).max(10000).default(1),
      pageSize:z.coerce.number().int().refine(v=>[25,50,100].includes(v)).default(25),
    }).safeParse(c.req.query());
    if(paged&&!parsed.success)return c.json({success:false,code:"INVALID_PAGE"},400);
    const partner=paged&&parsed.success
      ? await getPartnerAdminBalanceDetailPage(c.get("user").id,partnerId,parsed.data)
      : await getPartnerAdminBalanceDetail(c.get("user").id,partnerId);
    if (!partner) return c.json({ success: false, code: "PARTNER_NOT_FOUND" }, 404);
    return c.json({ success: true, data: partner });
  } catch (error) {
    const mapped = mapError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status as 500);
  }
});

/** Mirrors Next mark-paid action; Core provides locked, concurrency-safe accounting. */
adminPartnerRoutes.post("/:partnerId/mark-paid", requireRole("ADMIN"), async c => {
  const partnerId = c.req.param("partnerId");
  if (!isPartnerId(partnerId)) return c.json({ success: false, code: "INVALID_PARTNER_ID" }, 400);
  try {
    const result = await markPartnerBalancePaidAdmin({ actorId: c.get("user").id, partnerId });
    if (!result.success) return c.json({ success: false, error: result.error }, 409);
    return c.json({ success: true, amountKopecks: result.amountKopecks });
  } catch (error) {
    const mapped = mapError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status as 500);
  }
});
