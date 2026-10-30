/** Safe trainer video display name editing; media objects are not mutated here. */
import { Hono } from "hono";
import { z } from "zod/v3";
import { updateTrainerVideoName } from "@gafus/core/services/trainerVideo";

export interface TrainerVideosManagePorts {
  rename: (videoId: string, trainerId: string, name: string | null) =>
    ReturnType<typeof updateTrainerVideoName>;
}
const production: TrainerVideosManagePorts = { rename: updateTrainerVideoName };
const bad = { success: false, code: "BAD_INPUT", error: "Некорректный запрос" } as const;
const denied = { success: false, code: "FORBIDDEN", error: "Недостаточно прав" } as const;
const failed = { success: false, code: "OPERATION_FAILED", error: "Название не обновлено" } as const;
const schema = z.object({ displayName: z.string().trim().max(255).nullable() }).strict();
const idPattern = /^[a-zA-Z0-9_-]{1,128}$/;
export function createTrainerVideosManageRoutes(ports: TrainerVideosManagePorts = production) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Vary", "Cookie");
    await next();
    c.header("Cache-Control", "private, no-store");
  });
  app.put("/:id/name", async c => {
    const actor = c.get("user") as { id?: unknown; role?: unknown } | undefined;
    if (!actor || typeof actor.id !== "string" ||
      (actor.role !== "TRAINER" && actor.role !== "ADMIN"))
      return c.json(denied, 403);
    const id = c.req.param("id");
    if (!idPattern.test(id) || Object.keys(c.req.queries()).length ||
      !/^application\/json(?:\s*;|\s*$)/i.test(c.req.header("content-type") ?? ""))
      return c.json(bad, 400);
    const size = c.req.header("content-length");
    if (size && (!/^\d+$/.test(size) || Number(size) > 3000))
      return c.json(bad, 400);
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return c.json(bad, 400);
    try {
      // Core refuses foreign TrainerVideo.trainerId even for an admin:
      // the existing Next rename action uses the exact same Core method.
      const result = await ports.rename(id, actor.id, parsed.data.displayName || null);
      return result.success ? c.json({ success: true }, 200) : c.json(failed, 409);
    } catch { return c.json(failed, 500); }
  });
  return app;
}
export const trainerVideosManageRoutes = createTrainerVideosManageRoutes();
