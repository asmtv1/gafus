/**
 * Owner-scoped step/day editor endpoints. Existing Core owns the business
 * mutations/cache revisions; Hono supplies authenticated actor and strict DTOs.
 */
import { Hono } from "hono";
import { countEditableDaySteps } from "@gafus/core/services/trainerCourse";
import {
  getStepForEdit, updateStep, deleteSteps, updateStepSchema,
  type UpdateStepInput,
} from "@gafus/core/services/trainerStep";
import {
  getTrainingDayForEdit, updateTrainingDay, deleteDays, updateTrainingDaySchema,
  type UpdateTrainingDayInput,
} from "@gafus/core/services/trainingDay";

type Actor = { id: string; role: "TRAINER" | "ADMIN" };
type Result = { success?: boolean };
type Step = Awaited<ReturnType<typeof getStepForEdit>>;
type Day = Awaited<ReturnType<typeof getTrainingDayForEdit>>;
const BAD = { success: false, code: "BAD_INPUT", error: "Некорректные данные" } as const;
const DENIED = { success: false, code: "FORBIDDEN", error: "Доступ запрещён" } as const;
const MISSING = { success: false, code: "NOT_FOUND", error: "Материал не найден" } as const;
const FAILURE = { success: false, code: "OPERATION_FAILED", error: "Операция не выполнена" } as const;
const idOK = /^[A-Za-z0-9_-]{1,128}$/;
const obj = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x) &&
  Object.getPrototypeOf(x) === Object.prototype;
function actor(c: { get: (key: "user") => unknown }): Actor | null {
  const u = c.get("user");
  if (!u || typeof u !== "object" || !("id" in u) || !("role" in u) ||
    typeof u.id !== "string" || !u.id || (u.role !== "TRAINER" && u.role !== "ADMIN"))
    return null;
  return { id: u.id, role: u.role };
}
const safeBody = async (c: {
  req: { header: (key: string) => string | undefined; json: () => Promise<unknown> };
}) => {
  const ct = c.req.header("content-type") ?? "";
  const length = c.req.header("content-length");
  if (!/^application\/json(?:\s*;|\s*$)/i.test(ct) ||
      (length && (!/^\d+$/.test(length) || Number(length) > 150_000))) return null;
  const body: unknown = await c.req.json().catch(() => null);
  return obj(body) ? body : null;
};
const limitedKeys = (body: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(body).every(k => allowed.includes(k));
/** Some HTTP runtimes materialize a ReadableStream for an empty DELETE body.
 * The previous raw.body !== null check denied a real browser DELETE while
 * app.request() mocks passed. Read at most the first nonempty chunk; never
 * trust an empty-looking stream if transfer framing declares a payload.
 */
async function hasNoPayload(request: Request): Promise<boolean> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) !== 0))
    return false;
  if (request.headers.has("transfer-encoding")) return false;
  if (request.body === null) return true;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = request.clone().body?.getReader();
    if (!reader) return false;
    for (let index = 0; index < 4; index++) {
      const next = await reader.read();
      if (next.done) return true;
      if (next.value?.byteLength) return false;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (reader) void reader.cancel().catch(() => undefined);
  }
}
function privateRoutes() {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Vary", "Cookie");
    await next();
    c.header("Cache-Control", "private, no-store");
  });
  return app;
}
const stepFields = [
  "title", "description", "durationSec", "estimatedDurationSec", "type",
  "videoUrl", "videoUrls", "imageUrls", "pdfUrls", "checklist", "requiresVideoReport",
  "requiresWrittenFeedback", "hasTestQuestions", "isDailyCourse", "surveySlug",
];
const dayFields = [
  "title", "description", "type", "equipment",
  "showCoursePathExport", "shareProgressAcrossCourses", "stepIds",
];

export type TrainerContentPorts = {
  step: {
    read: (id: string, who: Actor) => Promise<Step>;
    update: (input: UpdateStepInput, who: Actor) => Promise<Result>;
    remove: (input: { stepIds: string[] }, who: Actor) => Promise<Result>;
  };
  day: {
    read: (id: string, who: Actor) => Promise<Day>;
    update: (input: UpdateTrainingDayInput, who: Actor) => Promise<Result>;
    remove: (input: { dayIds: string[] }, who: Actor) => Promise<Result>;
    countSteps: (ids: string[], who: Actor) => Promise<number>;
  };
};
const production: TrainerContentPorts = {
  step: { read: getStepForEdit, update: updateStep, remove: deleteSteps },
  day: {
    read: getTrainingDayForEdit, update: updateTrainingDay, remove: deleteDays,
    countSteps: countEditableDaySteps,
  },
};

// Batch routes have the same all-or-nothing owner fencing as single deletion.
// All ID authorization and the actual deletion are atomic in Core.
const batchIds = (body: Record<string, unknown> | null, key: "stepIds" | "dayIds") => {
  if (!body || Object.keys(body).length !== 1 || !Array.isArray(body[key])) return null;
  const ids: unknown[] = body[key];
  if (ids.length < 1 || ids.length > 100 ||
      ids.some(id => typeof id !== "string" || !idOK.test(id)) ||
      new Set(ids).size !== ids.length) return null;
  return ids as string[];
};

export function createTrainerStepManageRoutes(ports: TrainerContentPorts = production) {
  const app = privateRoutes();
  app.delete("/batch", async c => {
    const who = actor(c);
    if (!who) return c.json(DENIED, 403);
    if (Object.keys(c.req.queries()).length) return c.json(BAD, 400);
    const ids = batchIds(await safeBody(c), "stepIds");
    if (!ids) return c.json(BAD, 400);
    try {
      const result = await ports.step.remove({ stepIds: ids }, who);
      return result.success ? c.json({ success: true, count: ids.length }, 200) : c.json(FAILURE, 409);
    } catch { return c.json(FAILURE, 500); }
  });
  app.get("/:id", async c => {
    const who = actor(c);
    if (!who) return c.json(DENIED, 403);
    const id = c.req.param("id");
    if (!idOK.test(id) || Object.keys(c.req.queries()).length || c.req.raw.body !== null)
      return c.json(BAD, 400);
    try {
      const value = await ports.step.read(id, who);
      if (!value) return c.json(MISSING, 404);
      return c.json({ success: true, data: value }, 200);
    } catch { return c.json(FAILURE, 500); }
  });
  app.put("/:id", async c => {
    const who = actor(c);
    if (!who) return c.json(DENIED, 403);
    const id = c.req.param("id");
    if (!idOK.test(id) || Object.keys(c.req.queries()).length) return c.json(BAD, 400);
    const body = await safeBody(c);
    if (!body || !limitedKeys(body, stepFields)) return c.json(BAD, 400);
    const parsed = updateStepSchema.safeParse({ ...body, id });
    if (!parsed.success) return c.json(BAD, 400);
    try {
      const result = await ports.step.update(parsed.data, who);
      return result.success ? c.json({ success: true }, 200) : c.json(FAILURE, 409);
    } catch { return c.json(FAILURE, 500); }
  });
  app.delete("/:id", async c => {
    const who = actor(c);
    if (!who) return c.json(DENIED, 403);
    const id = c.req.param("id");
    if (!idOK.test(id) || Object.keys(c.req.queries()).length ||
        !(await hasNoPayload(c.req.raw)))
      return c.json(BAD, 400);
    try {
      const result = await ports.step.remove({ stepIds: [id] }, who);
      return result.success ? c.json({ success: true }, 200) : c.json(FAILURE, 409);
    } catch { return c.json(FAILURE, 500); }
  });
  return app;
}

export function createTrainerDayManageRoutes(ports: TrainerContentPorts = production) {
  const app = privateRoutes();
  app.delete("/batch", async c => {
    const who = actor(c);
    if (!who) return c.json(DENIED, 403);
    if (Object.keys(c.req.queries()).length) return c.json(BAD, 400);
    const ids = batchIds(await safeBody(c), "dayIds");
    if (!ids) return c.json(BAD, 400);
    try {
      const result = await ports.day.remove({ dayIds: ids }, who);
      return result.success ? c.json({ success: true, count: ids.length }, 200) : c.json(FAILURE, 409);
    } catch { return c.json(FAILURE, 500); }
  });
  app.get("/:id", async c => {
    const who = actor(c);
    if (!who) return c.json(DENIED, 403);
    const id = c.req.param("id");
    if (!idOK.test(id) || Object.keys(c.req.queries()).length || c.req.raw.body !== null)
      return c.json(BAD, 400);
    try {
      const day = await ports.day.read(id, who);
      if (!day) return c.json(MISSING, 404);
      // Do not return the unrestricted ORM document or private linked records.
      return c.json({ success: true, data: {
        id: day.id, title: day.title, description: day.description,
        type: day.type, equipment: day.equipment,
        showCoursePathExport: day.showCoursePathExport,
        shareProgressAcrossCourses: day.shareProgressAcrossCourses,
        stepIds: day.stepLinks.map(row => row.stepId),
      } }, 200);
    } catch { return c.json(FAILURE, 500); }
  });
  app.put("/:id", async c => {
    const who = actor(c);
    if (!who) return c.json(DENIED, 403);
    const id = c.req.param("id");
    if (!idOK.test(id) || Object.keys(c.req.queries()).length) return c.json(BAD, 400);
    const body = await safeBody(c);
    if (!body || !limitedKeys(body, dayFields)) return c.json(BAD, 400);
    const parsed = updateTrainingDaySchema.safeParse({ ...body, id });
    if (!parsed.success || parsed.data.stepIds.length > 250 ||
        parsed.data.stepIds.some(stepId => !idOK.test(stepId))) return c.json(BAD, 400);
    const uniqueIds = [...new Set(parsed.data.stepIds)];
    try {
      if ((await ports.day.countSteps(uniqueIds, who)) !== uniqueIds.length)
        return c.json(MISSING, 404);
      const result = await ports.day.update(parsed.data, who);
      return result.success ? c.json({ success: true }, 200) : c.json(FAILURE, 409);
    } catch { return c.json(FAILURE, 500); }
  });
  app.delete("/:id", async c => {
    const who = actor(c);
    if (!who) return c.json(DENIED, 403);
    const id = c.req.param("id");
    if (!idOK.test(id) || Object.keys(c.req.queries()).length ||
        !(await hasNoPayload(c.req.raw)))
      return c.json(BAD, 400);
    try {
      const result = await ports.day.remove({ dayIds: [id] }, who);
      return result.success ? c.json({ success: true }, 200) : c.json(FAILURE, 409);
    } catch { return c.json(FAILURE, 500); }
  });
  return app;
}
export const trainerStepManageRoutes = createTrainerStepManageRoutes();
export const trainerDayManageRoutes = createTrainerDayManageRoutes();
