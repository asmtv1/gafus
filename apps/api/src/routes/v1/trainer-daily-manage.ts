/** Authenticated trainer daily-course authoring, backed by the existing Core.
 * No import, cleanup, provider, production, or implicit data deletion paths.
 */
import { Hono } from "hono";
import {
  upsertDailyCourseBundle, upsertDailyCourseBundleSchema,
  deleteDailyCourseBundle, deleteDailyCourseBundleSchema,
  upsertDailyCourseSchedule, upsertDailyCourseScheduleSchema,
  deleteDailyCourseSchedule, deleteDailyCourseScheduleSchema,
  type DailyCourseActor,
} from "@gafus/core/services/dailyCourse";

export type TrainerDailyManagePorts = {
  putBundle: typeof upsertDailyCourseBundle;
  deleteBundle: typeof deleteDailyCourseBundle;
  putSchedule: typeof upsertDailyCourseSchedule;
  deleteSchedule: typeof deleteDailyCourseSchedule;
};
const corePorts: TrainerDailyManagePorts = {
  putBundle: upsertDailyCourseBundle, deleteBundle: deleteDailyCourseBundle,
  putSchedule: upsertDailyCourseSchedule, deleteSchedule: deleteDailyCourseSchedule,
};
const bad = { success: false, code: "BAD_INPUT" } as const;
const denied = { success: false, code: "FORBIDDEN" } as const;
const failed = { success: false, code: "SAVE_FAILED" } as const;
const contentTypeOk = (v: string | undefined) =>
  v?.split(";")[0]?.trim().toLowerCase() === "application/json";
function scope(user: DailyCourseActor | undefined): DailyCourseActor | null {
  return user?.id && (user.role === "TRAINER" || user.role === "ADMIN") ?
    { id: user.id, role: user.role } : null;
}
function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function createTrainerDailyManageRoutes(ports: TrainerDailyManagePorts = corePorts) {
  const app = new Hono();
  app.put("/bundles", async c => {
    const actor = scope(c.get("user"));
    if (!actor) return c.json(denied, 403);
    if (Object.keys(c.req.queries()).length || !contentTypeOk(c.req.header("content-type")))
      return c.json(bad, 400);
    const body: unknown = await c.req.json().catch(() => null);
    if (!plain(body)) return c.json(bad, 400);
    const parsed = upsertDailyCourseBundleSchema.strict().safeParse(body);
    if (!parsed.success) return c.json(bad, 400);
    try {
      const result = await ports.putBundle(actor, parsed.data);
      return c.json({ success: true, data: result });
    } catch { return c.json(failed, 409); }
  });
  app.delete("/bundles/:bundleId", async c => {
    const actor = scope(c.get("user"));
    if (!actor) return c.json(denied, 403);
    if (Object.keys(c.req.queries()).length) return c.json(bad, 400);
    const parsed = deleteDailyCourseBundleSchema.safeParse({ bundleId: c.req.param("bundleId") });
    if (!parsed.success) return c.json(bad, 400);
    try {
      await ports.deleteBundle(actor, parsed.data);
      return c.json({ success: true });
    } catch { return c.json(failed, 409); }
  });
  app.put("/schedule", async c => {
    const actor = scope(c.get("user"));
    if (!actor) return c.json(denied, 403);
    // Core currently upserts by a globally unique date without an atomic
    // ownership predicate on an EXISTING slot. Until that Core invariant is
    // fixed, a trainer must not be allowed to replace another author's day.
    if (actor.role !== "ADMIN") return c.json(denied, 403);
    if (Object.keys(c.req.queries()).length || !contentTypeOk(c.req.header("content-type")))
      return c.json(bad, 400);
    const body: unknown = await c.req.json().catch(() => null);
    if (!plain(body)) return c.json(bad, 400);
    const parsed = upsertDailyCourseScheduleSchema.strict().safeParse(body);
    if (!parsed.success) return c.json(bad, 400);
    try {
      const result = await ports.putSchedule(actor, parsed.data);
      return c.json({ success: true, data: result });
    } catch { return c.json(failed, 409); }
  });
  app.delete("/schedule/:scheduleId", async c => {
    const actor = scope(c.get("user"));
    if (!actor) return c.json(denied, 403);
    if (Object.keys(c.req.queries()).length) return c.json(bad, 400);
    const parsed = deleteDailyCourseScheduleSchema.safeParse({ scheduleId: c.req.param("scheduleId") });
    if (!parsed.success) return c.json(bad, 400);
    try {
      await ports.deleteSchedule(actor, parsed.data);
      return c.json({ success: true });
    } catch { return c.json(failed, 409); }
  });
  return app;
}
export const trainerDailyManageRoutes = createTrainerDailyManageRoutes();
