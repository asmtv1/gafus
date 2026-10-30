import type { AuthRole } from "@gafus/auth";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { prisma } from "@gafus/prisma";
import {
  addDayOff,
  addSlotException,
  dayOffInputSchema,
  getTrainerAvailability,
  getTrainerEditableSlots,
  removeDayOff,
  removeSlotException,
  resolveTargetTrainerUserIdForStaff,
  setTrainerAvailability,
  slotExceptionInputSchema,
  trainerAvailabilityInputSchema,
} from "@gafus/core/services/consultation";
import { requireRole } from "../../middleware/auth.js";

/** Dedicated admin schedule vertical, parity with legacy Next staff management. */
export const adminConsultationScheduleRoutes = new Hono();
adminConsultationScheduleRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const range = z.object({
  fromUtc: z.string().datetime({ offset: true }),
  toUtc: z.string().datetime({ offset: true }),
}).refine(q => new Date(q.toUtc).getTime() > new Date(q.fromUtc).getTime(), {
  message: "INVALID_RANGE",
}).refine(q => new Date(q.toUtc).getTime() - new Date(q.fromUtc).getTime() <= 16 * 86400_000, {
  message: "RANGE_TOO_WIDE",
});

async function authorizeTarget(actorId: string, trainerId: string) {
  const current = await prisma.user.findUnique({
    where: { id: actorId }, select: { role: true },
  });
  if (current?.role !== "ADMIN") return "FORBIDDEN" as const;
  try {
    await resolveTargetTrainerUserIdForStaff(
      { id: actorId, role: current.role as AuthRole }, trainerId,
    );
    return null;
  } catch {
    return "INVALID_TRAINER" as const;
  }
}

function errorResponse(c: Context) {
  return c.json({ success: false, code: "SCHEDULE_OPERATION_FAILED" }, 503);
}

adminConsultationScheduleRoutes.get("/:trainerId", requireRole("ADMIN"), async c => {
  const trainerId = c.req.param("trainerId");
  if (!id.safeParse(trainerId).success) return c.json({ success: false, code: "INVALID_ID" }, 400);
  const params = range.safeParse({
    fromUtc: c.req.query("fromUtc"), toUtc: c.req.query("toUtc"),
  });
  if (!params.success) return c.json({ success: false, code: "INVALID_RANGE" }, 400);
  try {
    const access = await authorizeTarget(c.get("user").id, trainerId);
    if (access) return c.json({ success: false, code: access }, 403);
    const [availability, editableSlots] = await Promise.all([
      getTrainerAvailability(trainerId),
      getTrainerEditableSlots(trainerId,
        new Date(params.data.fromUtc), new Date(params.data.toUtc)),
    ]);
    return c.json({ success: true, data: { availability, editableSlots } });
  } catch {
    return errorResponse(c);
  }
});

adminConsultationScheduleRoutes.put("/:trainerId", requireRole("ADMIN"), async c => {
  const trainerId = c.req.param("trainerId");
  if (!id.safeParse(trainerId).success) return c.json({ success: false, code: "INVALID_ID" }, 400);
  const parsed = trainerAvailabilityInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, code: "INVALID_AVAILABILITY" }, 400);
  try {
    const access = await authorizeTarget(c.get("user").id, trainerId);
    if (access) return c.json({ success: false, code: access }, 403);
    await setTrainerAvailability(trainerId, parsed.data);
    return c.json({ success: true });
  } catch { return errorResponse(c); }
});

adminConsultationScheduleRoutes.post("/:trainerId/day-offs", requireRole("ADMIN"), async c => {
  const trainerId = c.req.param("trainerId");
  if (!id.safeParse(trainerId).success) return c.json({ success: false, code: "INVALID_ID" }, 400);
  const parsed = dayOffInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, code: "INVALID_DAY_OFF" }, 400);
  try {
    const access = await authorizeTarget(c.get("user").id, trainerId);
    if (access) return c.json({ success: false, code: access }, 403);
    await addDayOff(trainerId, parsed.data.date, parsed.data.reason);
    return c.json({ success: true });
  } catch { return errorResponse(c); }
});

adminConsultationScheduleRoutes.delete("/:trainerId/day-offs/:dayOffId", requireRole("ADMIN"), async c => {
  const trainerId = c.req.param("trainerId");
  const dayOffId = c.req.param("dayOffId");
  if (!id.safeParse(trainerId).success || !id.safeParse(dayOffId).success) {
    return c.json({ success: false, code: "INVALID_ID" }, 400);
  }
  try {
    const access = await authorizeTarget(c.get("user").id, trainerId);
    if (access) return c.json({ success: false, code: access }, 403);
    await removeDayOff(trainerId, dayOffId);
    return c.json({ success: true });
  } catch { return errorResponse(c); }
});

adminConsultationScheduleRoutes.post("/:trainerId/exceptions", requireRole("ADMIN"), async c => {
  const trainerId = c.req.param("trainerId");
  if (!id.safeParse(trainerId).success) return c.json({ success: false, code: "INVALID_ID" }, 400);
  const parsed = slotExceptionInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, code: "INVALID_EXCEPTION" }, 400);
  try {
    const access = await authorizeTarget(c.get("user").id, trainerId);
    if (access) return c.json({ success: false, code: access }, 403);
    await addSlotException(trainerId, new Date(parsed.data.startAt),
      new Date(parsed.data.endAt), parsed.data.reason);
    return c.json({ success: true });
  } catch { return errorResponse(c); }
});

adminConsultationScheduleRoutes.delete("/:trainerId/exceptions/:exceptionId", requireRole("ADMIN"), async c => {
  const trainerId = c.req.param("trainerId");
  const exceptionId = c.req.param("exceptionId");
  if (!id.safeParse(trainerId).success || !id.safeParse(exceptionId).success) {
    return c.json({ success: false, code: "INVALID_ID" }, 400);
  }
  try {
    const access = await authorizeTarget(c.get("user").id, trainerId);
    if (access) return c.json({ success: false, code: access }, 403);
    await removeSlotException(trainerId, exceptionId);
    return c.json({ success: true });
  } catch { return errorResponse(c); }
});
