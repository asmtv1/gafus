/**
 * Registered full trainer course editor. Uses the existing atomic Core CAS
 * writer (Course.version + day/access changes in one SQL transaction).
 * This endpoint does not upload or delete media provider objects.
 */
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { prisma } from "@gafus/prisma";
import {
  getCourseEditorSnapshot, updateCourse, updateTrainerCourseSchema,
  createCourse, createTrainerCourseSchema, canCreatePaidCourse,
  deleteCourseVersioned,
  type UpdateTrainerCourseInput, type CreateTrainerCourseInput,
} from "@gafus/core/services/trainerCourse";

type Actor = { id: string; role: "TRAINER" | "ADMIN"; username: string };
type Snapshot = Awaited<ReturnType<typeof getCourseEditorSnapshot>>;
type Updated = Awaited<ReturnType<typeof updateCourse>>;
export interface TrainerFullCoursePorts {
  snapshot: (courseId: string, actor: Actor) => Promise<Snapshot>;
  update: (input: UpdateTrainerCourseInput, actor: Actor) => Promise<Updated>;
  countDays: (ids: string[], actor: Actor) => Promise<number>;
  countUsers: (ids: string[]) => Promise<number>;
  create: (input: CreateTrainerCourseInput, authorId: string) =>
    Promise<{ success?: boolean; id?: string }>;
  remove: typeof deleteCourseVersioned;
}
const production: TrainerFullCoursePorts = {
  snapshot: getCourseEditorSnapshot,
  update: updateCourse,
  create: createCourse,
  remove: deleteCourseVersioned,
  countUsers: async ids => prisma.user.count({
    where: { id: { in: ids }, role: "USER" },
  }),
  countDays: async (ids, actor) => prisma.trainingDay.count({
    where: { id: { in: ids }, ...(actor.role === "TRAINER" ? { authorId: actor.id } : {}) },
  }),
};
const BAD = { success: false, code: "BAD_INPUT", error: "Некорректные данные курса" } as const;
const DENIED = { success: false, code: "FORBIDDEN", error: "Недостаточно прав" } as const;
const MISSING = { success: false, code: "NOT_FOUND", error: "Курс не найден" } as const;
const STALE = { success: false, code: "STALE_VERSION", error: "Версия курса устарела" } as const;
const FAILED = { success: false, code: "OPERATION_FAILED", error: "Не удалось изменить курс" } as const;
const idOK = /^[a-zA-Z0-9_-]{1,128}$/;
const fields = [
  "name", "guideContent", "shortDesc", "description", "duration", "videoUrl",
  "logoImg", "isPublic", "isPaid", "showInProfile", "isPersonalized",
  "trainingDays", "allowedUsers", "equipment", "trainingLevel", "expectedVersion",
];
function actor(c: { get: (key: "user") => unknown }): Actor | null {
  const user = c.get("user");
  if (!user || typeof user !== "object" || !("id" in user) ||
      !("username" in user) || !("role" in user) ||
      typeof user.id !== "string" || typeof user.username !== "string" ||
      (user.role !== "TRAINER" && user.role !== "ADMIN") ||
      !idOK.test(user.id)) return null;
  return { id: user.id, username: user.username, role: user.role };
}
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x) &&
  Object.getPrototypeOf(x) === Object.prototype;
export function createTrainerFullCourseRoutes(ports: TrainerFullCoursePorts = production) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Vary", "Cookie");
    await next();
    c.header("Cache-Control", "private, no-store");
  });
  app.post("/", async c => {
    const staff = actor(c);
    if (!staff) return c.json(DENIED, 403);
    if (Object.keys(c.req.queries()).length ||
        !/^application\/json(?:\s*;|\s*$)/i.test(c.req.header("content-type") ?? ""))
      return c.json(BAD, 400);
    const length = c.req.header("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > 250_000))
      return c.json(BAD, 400);
    const body: unknown = await c.req.json().catch(() => null);
    if (!object(body) || Object.keys(body).some(key => key !== "expectedVersion" &&
        !fields.includes(key)) || "expectedVersion" in body)
      return c.json(BAD, 400);
    const id = randomUUID();
    const checked = createTrainerCourseSchema.strict().safeParse({ ...body, id });
    if (!checked.success) return c.json(BAD, 400);
    const input = checked.data;
    if (input.trainingDays.length > 250 || input.allowedUsers.length > 500 ||
      new Set(input.trainingDays).size !== input.trainingDays.length ||
      new Set(input.allowedUsers).size !== input.allowedUsers.length ||
      input.trainingDays.some(dayId => !idOK.test(dayId)) ||
      input.allowedUsers.some(userId => !idOK.test(userId)) ||
      (input.isPublic && input.allowedUsers.length > 0))
      return c.json(BAD, 400);
    if (input.isPaid && !canCreatePaidCourse(staff.id, staff.role, staff.username))
      return c.json(DENIED, 403);
    try {
      if (input.trainingDays.length &&
        await ports.countDays(input.trainingDays, staff) !== input.trainingDays.length)
        return c.json(MISSING, 404);
      if (input.allowedUsers.length &&
        await ports.countUsers(input.allowedUsers) !== input.allowedUsers.length)
        return c.json(BAD, 400);
      const created = await ports.create(input, staff.id);
      if (!created.success || created.id !== id) return c.json(FAILED, 500);
      return c.json({ success: true, data: { id } }, 201);
    } catch { return c.json(FAILED, 500); }
  });
  app.delete("/:id", async c => {
    const staff = actor(c);
    if (!staff) return c.json(DENIED, 403);
    const id = c.req.param("id");
    if (!idOK.test(id) || Object.keys(c.req.queries()).length ||
        !/^application\/json(?:\s*;|\s*$)/i.test(c.req.header("content-type") ?? ""))
      return c.json(BAD, 400);
    const size = c.req.header("content-length");
    if (size && (!/^\d+$/.test(size) || Number(size) > 1000)) return c.json(BAD, 400);
    const body: unknown = await c.req.json().catch(() => null);
    if (!object(body) || Object.keys(body).length !== 1 ||
      typeof body.expectedVersion !== "number" ||
      !Number.isInteger(body.expectedVersion) ||
      body.expectedVersion < 1 || body.expectedVersion > 2147483647)
      return c.json(BAD, 400);
    try {
      const result = await ports.remove(id, body.expectedVersion, staff);
      if (result.status === "deleted")
        return c.json({ success: true, data: { id } }, 200);
      if (result.status === "stale") return c.json(STALE, 409);
      if (result.status === "not_found") return c.json(MISSING, 404);
      if (result.status === "invalid") return c.json(BAD, 400);
      return c.json(FAILED, 500);
    } catch { return c.json(FAILED, 500); }
  });
  app.put("/:id", async c => {
    const staff = actor(c);
    if (!staff) return c.json(DENIED, 403);
    const id = c.req.param("id");
    if (!idOK.test(id) || Object.keys(c.req.queries()).length ||
      !/^application\/json(?:\s*;|\s*$)/i.test(c.req.header("content-type") ?? ""))
      return c.json(BAD, 400);
    const length = c.req.header("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > 250_000))
      return c.json(BAD, 400);
    const body: unknown = await c.req.json().catch(() => null);
    if (!object(body) || Object.keys(body).some(key => !fields.includes(key)))
      return c.json(BAD, 400);
    const checked = updateTrainerCourseSchema.strict().safeParse({ ...body, id });
    if (!checked.success) return c.json(BAD, 400);
    const input = checked.data;
    if (input.trainingDays.length > 250 || input.allowedUsers.length > 500 ||
      new Set(input.trainingDays).size !== input.trainingDays.length ||
      new Set(input.allowedUsers).size !== input.allowedUsers.length ||
      input.trainingDays.some(dayId => !idOK.test(dayId)) ||
      input.allowedUsers.some(userId => !idOK.test(userId)) ||
      (input.isPublic && input.allowedUsers.length > 0))
      return c.json(BAD, 400);
    if (input.isPaid && !canCreatePaidCourse(staff.id, staff.role, staff.username))
      return c.json(DENIED, 403);
    try {
      const original = await ports.snapshot(id, staff);
      if (original.status === "not_found") return c.json(MISSING, 404);
      if (original.status !== "found") return c.json(FAILED, 500);
      if (original.data.version !== input.expectedVersion) return c.json(STALE, 409);
      if (input.trainingDays.length &&
        await ports.countDays(input.trainingDays, staff) !== input.trainingDays.length)
        return c.json(MISSING, 404);
      const result = await ports.update(input, staff);
      if (result.success) {
        if (result.version !== input.expectedVersion + 1)
          return c.json(FAILED, 500);
        return c.json({ success: true, data: { id, version: result.version } }, 200);
      }
      if (result.status === "stale") return c.json(STALE, 409);
      if (result.status === "not_found") return c.json(MISSING, 404);
      return c.json(FAILED, 500);
    } catch { return c.json(FAILED, 500); }
  });
  return app;
}
export const trainerFullCourseRoutes = createTrainerFullCourseRoutes();
