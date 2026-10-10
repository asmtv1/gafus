import { Hono } from "hono";
import { z } from "zod";
import {
  updateGafusSettingsAdmin,
  adjustGafusBalanceAdmin,
  getGafusAdminDashboard,
} from "@gafus/core/services/adminGafus";

export const gafusAdminRoutes = new Hono();

function adminError(error: unknown) {
  if (error instanceof z.ZodError || (error instanceof Error &&
    /^(INVALID_SETTING|INVALID_SETTINGS_KEYS|REASON_REQUIRED|INVALID_REQUEST_ID)/.test(error.message))) {
    return { status: 400 as const, code: "GAFUS_VALIDATION_ERROR" };
  }
  if (error instanceof Error && error.message === "FORBIDDEN") return { status: 403 as const, code: "FORBIDDEN" };
  if (error instanceof Error && /^(SETTINGS_REVISION_CONFLICT|REQUEST_CONFLICT)$/.test(error.message)) {
    return { status: 409 as const, code: "GAFUS_CONFLICT" };
  }
  return { status: 500 as const, code: "GAFUS_INTERNAL_ERROR" };
}

gafusAdminRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

const settingsPatch = z.object({
  economyEnabled: z.boolean().optional(),
  earningEnabled: z.boolean().optional(),
  spendingEnabled: z.boolean().optional(),
  postReward: z.number().int().min(0).max(100).optional(),
  questionReward: z.number().int().min(0).max(100).optional(),
  answerReward: z.number().int().min(0).max(100).optional(),
  activityLimit: z.number().int().min(0).max(100).optional(),
  activityWindowSeconds: z.number().int().min(1).max(30 * 86400).optional(),
  reactionThreshold: z.number().int().min(1).max(1_000_000).optional(),
  reactionReward: z.number().int().min(0).max(100).optional(),
  bestAnswerReward: z.number().int().min(0).max(100).optional(),
  courseStepCost: z.number().int().min(1).max(100).optional(),
  miniGuideCost: z.number().int().min(1).max(100).optional(),
  accessDurationSeconds: z.number().int().min(1).max(90 * 86400).optional(),
}).strict();

gafusAdminRoutes.get("/dashboard", async c => {
  try {
    return c.json({ success: true, data: await getGafusAdminDashboard(c.get("user").id) });
  } catch (error) {
    const mapped = adminError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status as 500);
  }
});

gafusAdminRoutes.patch("/settings", async c => {
  try {
    const body = z.object({
      expectedRevision: z.number().int().min(1),
      reason: z.string().trim().min(5).max(1000),
      patch: settingsPatch,
    }).strict().parse(await c.req.json());
    const data = await updateGafusSettingsAdmin({ actorId: c.get("user").id, ...body });
    return c.json({ success: true, data });
  } catch (error) {
    const mapped = adminError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status as 500);
  }
});

gafusAdminRoutes.post("/adjust", async c => {
  try {
    const body = z.object({
      userId: z.string().min(1).max(128),
      delta: z.number().int().min(-10000).max(10000).refine(x => x !== 0),
      requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/),
      reason: z.string().trim().min(5).max(1000),
    }).strict().parse(await c.req.json());
    const data = await adjustGafusBalanceAdmin({ actorId: c.get("user").id, ...body });
    return c.json({ success: true, data });
  } catch (error) {
    const mapped = adminError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status as 500);
  }
});
