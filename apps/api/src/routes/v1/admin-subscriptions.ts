import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "@gafus/prisma";
import {
  getAppSubscriptionAdminDashboard,
  getAppSubscriptionPaymentHistory,
  getAppSubscriptionPromoCodesAdmin,
  getNpdAdminPage,
  createAppSubscriptionPromoCode,
  updateAppSubscriptionPromoCode,
  archiveAppSubscriptionPromoCode,
  AppSubscriptionPromoCodeDomainError,
  adminRetryNpdReceiptOperation,
  adminQueueNpdReconciliation,
} from "@gafus/core/services/appSubscription";
import { requireRole } from "../../middleware/auth.js";

export const adminSubscriptionRoutes = new Hono();
adminSubscriptionRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});

const pageSize = z.coerce.number().pipe(z.union([
  z.literal(10), z.literal(25), z.literal(50), z.literal(100),
]));
const querySchema = z.object({
  tab: z.enum(["payments", "promo-codes", "npd"]).default("payments"),
  paymentPage: z.coerce.number().int().min(1).max(10000).default(1),
  paymentPageSize: pageSize.default(25),
  paymentStatus: z.enum(["SUCCEEDED", "PENDING", "CANCELED", "FAILED", "REFUNDED"]).optional(),
  paymentSearch: z.string().trim().max(128).optional(),
  includeArchived: z.enum(["1", "true"]).optional(),
  npdPage: z.coerce.number().int().min(1).max(10000).default(1),
  npdPageSize: pageSize.default(25),
  npdStatus: z.enum([
    "PENDING", "ISSUED", "CANCEL_PENDING", "CANCELED", "RECONCILIATION_REQUIRED", "FAILED",
  ]).optional(),
  npdSearch: z.string().trim().max(128).optional(),
  npdFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  npdTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

adminSubscriptionRoutes.get("/", requireRole("ADMIN", "MODERATOR"), async c => {
  const url = new URL(c.req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const params = querySchema.safeParse(raw);
  if (!params.success) return c.json({ success: false, code: "INVALID_FILTERS" }, 400);
  try {
    const actor = await prisma.user.findUnique({
      where: { id: c.get("user").id }, select: { role: true },
    });
    const role = actor?.role;
    if (role !== "ADMIN" && role !== "MODERATOR") {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
    const q = params.data;
    if (q.tab === "promo-codes") {
      return c.json({ success: true, data: {
        role, dashboard: null, paymentHistory: null,
        promoCodes: await getAppSubscriptionPromoCodesAdmin({
          includeArchived: q.includeArchived !== undefined,
        }), npd: null,
      } });
    }
    if (q.tab === "npd") {
      const npd = await getNpdAdminPage({
        role, page: q.npdPage, pageSize: q.npdPageSize,
        status: q.npdStatus, search: q.npdSearch,
        from: q.npdFrom ? new Date(`${q.npdFrom}T00:00:00.000Z`) : undefined,
        to: q.npdTo ? new Date(`${q.npdTo}T00:00:00.000Z`) : undefined,
      });
      return c.json({ success: true, data: {
        role, dashboard: null, paymentHistory: null, promoCodes: null, npd,
      } });
    }
    const [dashboard, paymentHistory] = await Promise.all([
      getAppSubscriptionAdminDashboard(),
      getAppSubscriptionPaymentHistory({
        page: q.paymentPage, pageSize: q.paymentPageSize,
        status: q.paymentStatus, search: q.paymentSearch,
      }),
    ]);
    return c.json({ success: true, data: {
      role, dashboard, paymentHistory, promoCodes: null, npd: null,
    } });
  } catch {
    return c.json({ success: false, code: "SUBSCRIPTIONS_ADMIN_UNAVAILABLE" }, 503);
  }
});


const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const discount = z.number().int().min(1).max(50);
const promoCreate = z.object({
  code: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
  discountPercent: discount,
  isActive: z.boolean(),
}).strict();
const promoUpdate = z.object({
  discountPercent: discount,
  isActive: z.boolean(),
}).strict();
async function currentAdmin(actorId: string): Promise<boolean> {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
  return actor?.role === "ADMIN";
}
function promoError(error: unknown) {
  if (error instanceof AppSubscriptionPromoCodeDomainError) {
    const code = error.code;
    const status = code === "PROMO_CODE_DUPLICATE" || code === "PROMO_CODE_ARCHIVED"
      || code === "PROMO_CODE_CHANGED" ? 409 : code === "PROMO_CODE_NOT_FOUND" ? 404 : 400;
    return { status: status as 400 | 404 | 409, code };
  }
  return { status: 500 as const, code: "PROMO_UPDATE_FAILED" };
}

adminSubscriptionRoutes.post("/promo-codes", requireRole("ADMIN"), async c => {
  const parsed = promoCreate.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, code: "INVALID_PROMO" }, 400);
  try {
    const actorId = c.get("user").id;
    if (!(await currentAdmin(actorId))) return c.json({ success: false, code: "FORBIDDEN" }, 403);
    const data = await createAppSubscriptionPromoCode({ ...parsed.data, actorId });
    return c.json({ success: true, data });
  } catch (error) {
    const mapped = promoError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status);
  }
});

adminSubscriptionRoutes.patch("/promo-codes/:id", requireRole("ADMIN"), async c => {
  const codeId = c.req.param("id");
  if (!id.safeParse(codeId).success) return c.json({ success: false, code: "INVALID_ID" }, 400);
  const parsed = promoUpdate.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, code: "INVALID_PROMO" }, 400);
  try {
    const actorId = c.get("user").id;
    if (!(await currentAdmin(actorId))) return c.json({ success: false, code: "FORBIDDEN" }, 403);
    const data = await updateAppSubscriptionPromoCode({ id: codeId, ...parsed.data, actorId });
    return c.json({ success: true, data });
  } catch (error) {
    const mapped = promoError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status);
  }
});

adminSubscriptionRoutes.delete("/promo-codes/:id", requireRole("ADMIN"), async c => {
  const codeId = c.req.param("id");
  if (!id.safeParse(codeId).success) return c.json({ success: false, code: "INVALID_ID" }, 400);
  try {
    const actorId = c.get("user").id;
    if (!(await currentAdmin(actorId))) return c.json({ success: false, code: "FORBIDDEN" }, 403);
    const data = await archiveAppSubscriptionPromoCode({ id: codeId, actorId });
    return c.json({ success: true, data });
  } catch (error) {
    const mapped = promoError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status);
  }
});

adminSubscriptionRoutes.post("/npd/:receiptId/retry", requireRole("ADMIN"), async c => {
  const receiptId = c.req.param("receiptId");
  if (!id.safeParse(receiptId).success) return c.json({ success: false, code: "INVALID_ID" }, 400);
  try {
    if (!(await currentAdmin(c.get("user").id))) {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
    const result = await adminRetryNpdReceiptOperation(receiptId);
    if (!result.ok) {
      return c.json({ success: false, code: result.code },
        result.code === "RECONCILIATION_REQUIRED" ? 409 : 400);
    }
    return c.json({ success: true });
  } catch {
    return c.json({ success: false, code: "NPD_RETRY_FAILED" }, 500);
  }
});

adminSubscriptionRoutes.post("/npd/:receiptId/reconcile", requireRole("ADMIN"), async c => {
  const receiptId = c.req.param("receiptId");
  if (!id.safeParse(receiptId).success) return c.json({ success: false, code: "INVALID_ID" }, 400);
  try {
    if (!(await currentAdmin(c.get("user").id))) {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
    const result = await adminQueueNpdReconciliation(receiptId);
    if (!result.ok) return c.json({ success: false, code: result.code }, 400);
    return c.json({ success: true });
  } catch {
    return c.json({ success: false, code: "NPD_RECONCILIATION_FAILED" }, 500);
  }
});
