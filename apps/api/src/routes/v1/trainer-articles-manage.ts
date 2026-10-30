/** Article editing follows the legacy Core owner check, not a synthetic admin override. */
import { Hono } from "hono";
import {
  getArticleForEdit,
  updateArticle,
  deleteArticle,
  createArticleSchema,
} from "@gafus/core/services/article";

type Actor = { id: string; role: string };
type EditResult = Awaited<ReturnType<typeof getArticleForEdit>>;
type WriteResult = Awaited<ReturnType<typeof updateArticle>>;
type DeleteResult = Awaited<ReturnType<typeof deleteArticle>>;
export interface TrainerArticlesManagePorts {
  read: (id: string, userId: string) => Promise<EditResult>;
  update: (id: string, input: Record<string, unknown>, userId: string) => Promise<WriteResult>;
  remove: (id: string, userId: string) => Promise<DeleteResult>;
}
const production: TrainerArticlesManagePorts = {
  read: getArticleForEdit, update: updateArticle, remove: deleteArticle,
};
const BAD = { success: false, code: "BAD_INPUT", error: "Некорректный запрос" } as const;
const FORBIDDEN = { success: false, code: "FORBIDDEN", error: "Доступ запрещён" } as const;
const NOT_FOUND = { success: false, code: "NOT_FOUND", error: "Статья не найдена" } as const;
const FAILED = { success: false, code: "INTERNAL_SERVER_ERROR", error: "Операция не выполнена" } as const;
const idPattern = /^[a-zA-Z0-9_-]{1,128}$/;
const editableKeys = new Set([
  "title", "contentType", "content", "visibility", "videoUrl", "logoImg",
  "imageUrls", "slug", "description",
]);
const plain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const actor = (c: { get: (key: "user") => unknown }): Actor | null => {
  const user = c.get("user");
  if (!user || typeof user !== "object" || !("id" in user) || !("role" in user) ||
    typeof user.id !== "string" || typeof user.role !== "string" ||
    !user.id || !["TRAINER", "ADMIN"].includes(user.role)) return null;
  return { id: user.id, role: user.role };
};
const isJson = (value?: string) => /^application\/json(?:\s*;|\s*$)/i.test(value ?? "");
const noQuery = (q: Record<string, string[]>) => Object.keys(q).length === 0;

export function createTrainerArticlesManageRoutes(
  ports: TrainerArticlesManagePorts = production,
) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Vary", "Cookie");
    await next();
    c.header("Cache-Control", "private, no-store");
  });
  app.get("/:id", async c => {
    const owner = actor(c);
    if (!owner) return c.json(FORBIDDEN, 403);
    const id = c.req.param("id");
    if (!idPattern.test(id) || !noQuery(c.req.queries()) || c.req.raw.body !== null)
      return c.json(BAD, 400);
    try {
      const result = await ports.read(id, owner.id);
      if (!result.success) return c.json(NOT_FOUND, 404);
      // Core only returns owner-sanitized CreateArticleSchemaInput.
      const data = createArticleSchema.safeParse(result.data);
      if (!data.success) return c.json(FAILED, 500);
      const {
        title, contentType, content, visibility,
        videoUrl, logoImg, imageUrls, slug, description,
      } = data.data;
      return c.json({ success: true, data: {
        id, title, contentType, content, visibility, videoUrl: videoUrl ?? null,
        logoImg, imageUrls, slug, description,
      } }, 200);
    } catch { return c.json(FAILED, 500); }
  });
  app.put("/:id", async c => {
    const owner = actor(c);
    if (!owner) return c.json(FORBIDDEN, 403);
    const id = c.req.param("id");
    if (!idPattern.test(id) || !noQuery(c.req.queries()) || !isJson(c.req.header("content-type")))
      return c.json(BAD, 400);
    const len = c.req.header("content-length");
    if (len && (!/^\d+$/.test(len) || Number(len) > 2_500_000)) return c.json(BAD, 400);
    const raw: unknown = await c.req.json().catch(() => null);
    if (!plain(raw) || Object.keys(raw).some(key => !editableKeys.has(key)))
      return c.json(BAD, 400);
    const parsed = createArticleSchema.safeParse(raw);
    if (!parsed.success) return c.json(BAD, 400);
    try {
      const result = await ports.update(id, parsed.data, owner.id);
      if (!result.success) return c.json(FAILED, 409);
      return c.json({ success: true }, 200);
    } catch { return c.json(FAILED, 500); }
  });
  app.delete("/:id", async c => {
    const owner = actor(c);
    if (!owner) return c.json(FORBIDDEN, 403);
    const id = c.req.param("id");
    if (!idPattern.test(id) || !noQuery(c.req.queries()) || c.req.raw.body !== null)
      return c.json(BAD, 400);
    try {
      const result = await ports.remove(id, owner.id);
      if (!result.success) return c.json(FAILED, 409);
      return c.json({ success: true }, 200);
    } catch { return c.json(FAILED, 500); }
  });
  return app;
}
export const trainerArticlesManageRoutes = createTrainerArticlesManageRoutes();
