import { Hono } from "hono";
import { z } from "zod";
import {
  listGafusFraudSignalsAdmin,
  reviewGafusFraudSignalAdmin,
} from "@gafus/core/services/adminGafus";
import {
  getLegacyGafusImportPreflight,
  importLegacyRewardedBatch,
} from "@gafus/core/services/gafus";
import { requireRole } from "../../middleware/auth.js";

/** Completes legacy Next admin Gafus fraud and operator-only import actions. */
export const adminGafusOperationsRoutes = new Hono();
adminGafusOperationsRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});

const fraudReview = z.object({
  action: z.enum(["CONFIRM", "DISMISS"]),
  reason: z.string().trim().min(5).max(1000),
  requestedReversal: z.number().int().min(0).max(10000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === "CONFIRM" && value.requestedReversal === undefined) {
    ctx.addIssue({ code: "custom", message: "REVERSAL_REQUIRED" });
  }
  if (value.action === "DISMISS" && (value.requestedReversal ?? 0) !== 0) {
    ctx.addIssue({ code: "custom", message: "REVERSAL_NOT_ALLOWED" });
  }
});
const importSchema = z.object({
  confirmation: z.literal("IMPORT_LEGACY_GAFUS"),
  cursor: z.string().trim().max(128).regex(/^[A-Za-z0-9_-]*$/).optional(),
}).strict();
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);

function coreError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "FORBIDDEN") return { code: "FORBIDDEN", status: 403 as const };
  if (/^(FRAUD_SIGNAL_NOT_FOUND)$/.test(message)) {
    return { code: "SIGNAL_NOT_FOUND", status: 404 as const };
  }
  if (/^(FRAUD_SIGNAL_ALREADY_REVIEWED|LEGACY_IMPORT_UNSETTLED_STATE)$/.test(message)) {
    return { code: "CONFLICT", status: 409 as const };
  }
  if (/^(INVALID_REVERSAL|REASON_REQUIRED|LEGACY_IMPORT_CONFIRMATION_REQUIRED)$/.test(message)) {
    return { code: "INVALID_OPERATION", status: 400 as const };
  }
  return { code: "GAFUS_OPERATION_UNAVAILABLE", status: 503 as const };
}

adminGafusOperationsRoutes.get("/fraud", requireRole("ADMIN"), async c => {
  const status = z.enum(["OPEN", "RESOLVED", "DISMISSED"])
    .safeParse(c.req.query("status") ?? "OPEN");
  if (!status.success) return c.json({ success: false, code: "INVALID_STATUS" }, 400);
  try {
    const data = await listGafusFraudSignalsAdmin({
      actorId: c.get("user").id, status: status.data,
    });
    return c.json({ success: true, data });
  } catch (error) {
    const mapped = coreError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status);
  }
});

adminGafusOperationsRoutes.post("/fraud/:signalId/review", requireRole("ADMIN"), async c => {
  const signalId = c.req.param("signalId");
  if (!id.safeParse(signalId).success) return c.json({ success: false, code: "INVALID_ID" }, 400);
  const parsed = fraudReview.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, code: "INVALID_REVIEW" }, 400);
  try {
    const data = await reviewGafusFraudSignalAdmin({
      actorId: c.get("user").id,
      signalId,
      action: parsed.data.action,
      reason: parsed.data.reason,
      requestedReversal: parsed.data.action === "CONFIRM" ? parsed.data.requestedReversal : 0,
    });
    return c.json({ success: true, data });
  } catch (error) {
    const mapped = coreError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status);
  }
});

adminGafusOperationsRoutes.get("/legacy/preflight", requireRole("ADMIN"), async c => {
  try {
    const data = await getLegacyGafusImportPreflight(c.get("user").id);
    return c.json({ success: true, data });
  } catch (error) {
    const mapped = coreError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status);
  }
});

/** No batch import from GET, application startup or a background schedule. */
adminGafusOperationsRoutes.post("/legacy/import", requireRole("ADMIN"), async c => {
  const parsed = importSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, code: "IMPORT_NOT_CONFIRMED" }, 400);
  try {
    const data = await importLegacyRewardedBatch({
      actorId: c.get("user").id, confirmed: true,
      batchSize: 50, cursor: parsed.data.cursor || undefined,
    });
    return c.json({ success: true, data });
  } catch (error) {
    const mapped = coreError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status);
  }
});
