/** File preview and safe add-only import using the existing Next/Core parser.
 * No production import, destructive cleanup, or replacement of occupied dates.
 */
import { createHash } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod/v3";
import {
  previewDailyCourseImportFile, importDailyCourseFile,
  type DailyCourseActor, type DailyCourseImportPreviewDto,
} from "@gafus/core/services/dailyCourse";

const MAX_FILE = 1_048_576;
const inputSchema = z.object({ content: z.string().min(1).max(MAX_FILE) }).strict();
const confirmSchema = inputSchema.extend({
  previewDigest: z.string().regex(/^[a-f0-9]{64}$/),
  confirmation: z.literal("ИМПОРТИРОВАТЬ"),
}).strict();
const invalid = { success: false, code: "BAD_INPUT" } as const;
const denied = { success: false, code: "FORBIDDEN" } as const;
const failed = { success: false, code: "IMPORT_FAILED" } as const;
const getActor = (user?: DailyCourseActor): DailyCourseActor | null =>
  user?.id && ["TRAINER", "ADMIN"].includes(user.role) ? { id: user.id, role: user.role } : null;
const acceptsJson = (contentType?: string) =>
  contentType?.split(";")[0]?.trim().toLowerCase() === "application/json";
function fingerprint(actor: DailyCourseActor, content: string, preview: DailyCourseImportPreviewDto) {
  return createHash("sha256")
    .update(JSON.stringify([actor.id, actor.role, content, preview]))
    .digest("hex");
}
export interface DailyImportPorts {
  preview: typeof previewDailyCourseImportFile;
  confirm: typeof importDailyCourseFile;
}
const production: DailyImportPorts = {
  preview: previewDailyCourseImportFile,
  confirm: importDailyCourseFile,
};
export function createTrainerDailyImportRoutes(ports: DailyImportPorts = production) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    c.header("Referrer-Policy", "no-referrer");
    await next();
  });
  const check = (c: { req: { queries: () => Record<string, string[]>;
    header: (name: string) => string | undefined } }) =>
    Object.keys(c.req.queries()).length === 0 && acceptsJson(c.req.header("content-type")) &&
      Number(c.req.header("content-length") ?? 0) <= MAX_FILE + 2048;
  app.post("/preview", async c => {
    const actor = getActor(c.get("user"));
    if (!actor) return c.json(denied, 403);
    if (!check(c)) return c.json(invalid, 400);
    const raw: unknown = await c.req.json().catch(() => null);
    const parsed = inputSchema.safeParse(raw);
    if (!parsed.success) return c.json(invalid, 400);
    try {
      const preview = await ports.preview(actor, { content: parsed.data.content });
      return c.json({ success: true, data: {
        preview, previewDigest: fingerprint(actor, parsed.data.content, preview),
      } });
    } catch { return c.json(failed, 422); }
  });
  app.post("/confirm", async c => {
    const actor = getActor(c.get("user"));
    if (!actor) return c.json(denied, 403);
    if (!check(c)) return c.json(invalid, 400);
    const raw: unknown = await c.req.json().catch(() => null);
    const parsed = confirmSchema.safeParse(raw);
    if (!parsed.success) return c.json(invalid, 400);
    try {
      const preview = await ports.preview(actor, { content: parsed.data.content });
      if (fingerprint(actor, parsed.data.content, preview) !== parsed.data.previewDigest)
        return c.json({ success: false, code: "PREVIEW_CHANGED" }, 409);
      if (preview.summary.importableDays < 1)
        return c.json({ success: false, code: "NOTHING_TO_IMPORT" }, 409);
      // Always skip conflicts, including future dates, until the Core
      // replacement branch supports a transactional owner/revision CAS.
      const result = await ports.confirm(actor, {
        content: parsed.data.content, replaceConflicts: false,
      });
      return c.json({ success: true, data: result });
    } catch { return c.json(failed, 409); }
  });
  return app;
}
export const trainerDailyImportRoutes = createTrainerDailyImportRoutes();
