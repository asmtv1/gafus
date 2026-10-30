import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { prisma } from "@gafus/prisma";
import {
  getFreePartnerPromoCodesForAdminPanel,
  getUserAppSubscriptionAdminSummary,
  adminGrantPaidUntil,
  adminGrantLifetime,
  adminClearManualGrant,
  cancelYookassaAppSubscription,
} from "@gafus/core/services/appSubscription";
import {
  getAllUsers, updateUserAdmin, deleteUserAdmin, partnerChangeRequiresAdmin,
} from "@gafus/core/services/adminUser";

import { requireRole } from "../../middleware/auth.js";

/** Next users/page.tsx read parity: registered staff DB role + user list + free partner promos. */
export const adminUsersRoutes = new Hono();

adminUsersRoutes.get("/", requireRole("ADMIN", "MODERATOR"), async c => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  try {
    const actorId = c.get("user").id;
    // Revalidate CURRENT DB role before accessing the PII-containing user list.
    const freePartnerPromoCodes = await getFreePartnerPromoCodesForAdminPanel(actorId);
    const result = await getAllUsers();
    if (!result.success) return c.json({ success: false, code: "ADMIN_USERS_UNAVAILABLE" }, 503);
    return c.json({ success: true, data: { users: result.data, freePartnerPromoCodes } });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
    return c.json({ success: false, code: "ADMIN_USERS_UNAVAILABLE" }, 503);
  }
});


const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const updateSchema = z.object({
  username: z.string().min(1).max(80).optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().max(64).optional(),
  role: z.enum(["ADMIN", "MODERATOR", "TRAINER", "PARTNER", "USER"]).optional(),
  newPassword: z.string().min(6).max(256).optional(),
  partnerPromoCodeId: z.string().min(1).max(128).optional(),
}).strict().refine(input => Object.keys(input).length > 0);

adminUsersRoutes.use("*", bodyLimit({
  maxSize: 16 * 1024,
  onError: c => c.json({ success: false, code: "BODY_TOO_LARGE" }, 413),
}));

/** Current DB roles are checked again; never allow moderator takeover of staff accounts. */
async function mayMutate(actorId: string, targetId: string, changesRole: boolean) {
  const [actor, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId }, select: { role: true } }),
    prisma.user.findUnique({ where: { id: targetId }, select: { role: true } }),
  ]);
  if (!actor || !["ADMIN", "MODERATOR"].includes(actor.role)) return "FORBIDDEN" as const;
  if (!target) return "USER_NOT_FOUND" as const;
  if (actor.role === "MODERATOR" && (
    changesRole || ["ADMIN", "MODERATOR", "TRAINER", "PARTNER"].includes(target.role)
  )) return "FORBIDDEN" as const;
  return null;
}

function parseId(value: string) {
  return idSchema.safeParse(value).success;
}

adminUsersRoutes.patch("/:userId", requireRole("ADMIN", "MODERATOR"), async c => {
  const userId = c.req.param("userId");
  if (!parseId(userId)) return c.json({ success: false, code: "INVALID_USER_ID" }, 400);
  let input: z.infer<typeof updateSchema>;
  try {
    input = updateSchema.parse(await c.req.json());
  } catch {
    return c.json({ success: false, code: "INVALID_USER_UPDATE" }, 400);
  }
  try {
    const actorId = c.get("user").id;
    const decision = await mayMutate(
      actorId, userId, input.role !== undefined || input.partnerPromoCodeId !== undefined,
    );
    if (decision) return c.json({ success: false, code: decision }, decision === "FORBIDDEN" ? 403 : 404);
    if (await partnerChangeRequiresAdmin(actorId, userId, input)) {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
    const result = await updateUserAdmin(userId, input, actorId);
    if (!result.success) return c.json({ success: false, error: result.error }, 422);
    return c.json({ success: true });
  } catch {
    return c.json({ success: false, code: "ADMIN_USER_UPDATE_FAILED" }, 500);
  }
});

adminUsersRoutes.delete("/:userId", requireRole("ADMIN", "MODERATOR"), async c => {
  const userId = c.req.param("userId");
  if (!parseId(userId)) return c.json({ success: false, code: "INVALID_USER_ID" }, 400);
  try {
    const actorId = c.get("user").id;
    const decision = await mayMutate(actorId, userId, false);
    if (decision) return c.json({ success: false, code: decision }, decision === "FORBIDDEN" ? 403 : 404);
    const result = await deleteUserAdmin(userId, actorId);
    if (!result.success) return c.json({ success: false, error: result.error }, 422);
    return c.json({ success: true });
  } catch {
    return c.json({ success: false, code: "ADMIN_USER_DELETE_FAILED" }, 500);
  }
});


const manualGrantSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("paid_until"),
    paidUntil: z.string().min(1).max(40),
    reason: z.string().trim().max(500).optional(),
  }).strict(),
  z.object({ action: z.literal("lifetime"), reason: z.string().trim().max(500).optional() }).strict(),
  z.object({ action: z.literal("clear") }).strict(),
  z.object({ action: z.literal("cancel_yookassa_renewal") }).strict(),
]);

/** Legacy Next users/[id]/app-subscription GET, with CURRENT DB staff verification. */
adminUsersRoutes.get("/:userId/app-subscription", requireRole("ADMIN", "MODERATOR"), async c => {
  const userId = c.req.param("userId");
  if (!parseId(userId)) return c.json({ success: false, code: "INVALID_USER_ID" }, 400);
  try {
    const actor = await prisma.user.findUnique({
      where: { id: c.get("user").id }, select: { role: true },
    });
    if (actor?.role !== "ADMIN" && actor?.role !== "MODERATOR") {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
    const data = await getUserAppSubscriptionAdminSummary(userId);
    return c.json({ success: true, data });
  } catch {
    return c.json({ success: false, code: "USER_SUBSCRIPTION_UNAVAILABLE" }, 503);
  }
});

/** Manual paid/lifetime grants, revocation, and stop YooKassa auto-renewal for one user. */
adminUsersRoutes.post("/:userId/app-subscription", requireRole("ADMIN"), async c => {
  const userId = c.req.param("userId");
  if (!parseId(userId)) return c.json({ success: false, code: "INVALID_USER_ID" }, 400);
  const parsed = manualGrantSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, code: "INVALID_GRANT" }, 400);
  if (parsed.data.action === "paid_until") {
    const paidUntil = new Date(parsed.data.paidUntil);
    if (!Number.isFinite(paidUntil.getTime()) || paidUntil.getTime() <= Date.now()) {
      return c.json({ success: false, code: "INVALID_EXPIRY" }, 400);
    }
  }
  try {
    const actorId = c.get("user").id;
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (actor?.role !== "ADMIN") {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
    if (parsed.data.action === "paid_until") {
      await adminGrantPaidUntil({
        userId, adminUserId: actorId, paidUntil: new Date(parsed.data.paidUntil),
        reason: parsed.data.reason,
      });
    } else if (parsed.data.action === "lifetime") {
      await adminGrantLifetime({ userId, adminUserId: actorId, reason: parsed.data.reason });
    } else if (parsed.data.action === "clear") {
      await adminClearManualGrant({ userId, adminUserId: actorId });
    } else {
      await cancelYookassaAppSubscription(userId);
    }
    return c.json({ success: true });
  } catch {
    return c.json({ success: false, code: "USER_SUBSCRIPTION_UPDATE_FAILED" }, 503);
  }
});
