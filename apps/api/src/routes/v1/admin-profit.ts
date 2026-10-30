import { Hono } from "hono";
import { z } from "zod/v3";
import { prisma } from "@gafus/prisma";
import {
  getProfitDashboard, saveProfitVideoExpense, cancelProfitVideoExpense,
} from "@gafus/core/services/appSubscription";
import { requireRole } from "../../middleware/auth.js";

export const adminProfitRoutes = new Hono();
adminProfitRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const reportQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paymentPage: z.coerce.number().int().min(1).max(10000).default(1),
  videoPage: z.coerce.number().int().min(1).max(10000).default(1),
}).strict();
const expenseInput = z.object({
  partnerId: id,
  paidDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().int().min(1).max(10000),
  comment: z.string().max(512).optional(),
}).strict();
const saveInput = z.object({
  requestKey: z.string().regex(/^[\w-]{16,64}$/),
  id: id.optional(),
  version: z.number().int().positive().optional(),
  input: expenseInput,
}).strict();
const cancelInput = z.object({
  id,
  version: z.number().int().positive(),
}).strict();

async function currentAdmin(actorId: string): Promise<boolean> {
  const actor = await prisma.user.findUnique({
    where: { id: actorId }, select: { role: true },
  });
  return actor?.role === "ADMIN";
}

function resultError(error: unknown): "STALE_RECORD" | "INVALID_EXPENSE" | "INTERNAL_ERROR" {
  if (error instanceof Error && /Запись уже|уже изменена/.test(error.message)) return "STALE_RECORD";
  if (error instanceof Error && /Некоррект|Креатор не|Ключ операции/.test(error.message)) {
    return "INVALID_EXPENSE";
  }
  return "INTERNAL_ERROR";
}

adminProfitRoutes.get("/", requireRole("ADMIN"), async c => {
  const parsed = reportQuery.safeParse({
    from: c.req.query("from"),
    to: c.req.query("to"),
    paymentPage: c.req.query("paymentPage") ?? 1,
    videoPage: c.req.query("videoPage") ?? 1,
  });
  if (!parsed.success) return c.json({ success: false, code: "INVALID_PERIOD" }, 400);
  try {
    if (!(await currentAdmin(c.get("user").id))) {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
    const data = await getProfitDashboard(parsed.data);
    return c.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && /^(Период|Некорректная дата)/.test(error.message)) {
      return c.json({ success: false, code: "INVALID_PERIOD" }, 400);
    }
    return c.json({ success: false, code: "PROFIT_UNAVAILABLE" }, 503);
  }
});

adminProfitRoutes.post("/video-expenses", requireRole("ADMIN"), async c => {
  let input: z.infer<typeof saveInput>;
  try { input = saveInput.parse(await c.req.json()); }
  catch { return c.json({ success: false, code: "INVALID_EXPENSE" }, 400); }
  try {
    const actorId = c.get("user").id;
    if (!(await currentAdmin(actorId))) return c.json({ success: false, code: "FORBIDDEN" }, 403);
    await saveProfitVideoExpense({ ...input, actorId });
    return c.json({ success: true });
  } catch (error) {
    const code = resultError(error);
    return c.json({ success: false, code }, code === "STALE_RECORD" ? 409 : code === "INVALID_EXPENSE" ? 400 : 500);
  }
});

adminProfitRoutes.post("/video-expenses/cancel", requireRole("ADMIN"), async c => {
  let input: z.infer<typeof cancelInput>;
  try { input = cancelInput.parse(await c.req.json()); }
  catch { return c.json({ success: false, code: "INVALID_EXPENSE" }, 400); }
  try {
    const actorId = c.get("user").id;
    if (!(await currentAdmin(actorId))) return c.json({ success: false, code: "FORBIDDEN" }, 403);
    await cancelProfitVideoExpense(actorId, input.id, input.version);
    return c.json({ success: true });
  } catch (error) {
    const code = resultError(error);
    return c.json({ success: false, code }, code === "STALE_RECORD" ? 409 : code === "INVALID_EXPENSE" ? 400 : 500);
  }
});
