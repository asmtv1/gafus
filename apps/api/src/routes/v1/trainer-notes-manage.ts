/**
 * Full trainer note workflows, matching the legacy Next actions without sending
 * private student entries to a public or summary endpoint.
 */
import { Hono } from "hono";
import { searchStudentsByUsername } from "@gafus/core/services/user";
import {
  createTrainerNote,
  updateTrainerNote,
  deleteTrainerNote,
  getTrainerNotes,
  createTrainerNoteSchema,
  updateTrainerNoteSchema,
  deleteTrainerNoteSchema,
  type CreateTrainerNoteInput,
  type UpdateTrainerNoteInput,
  type DeleteTrainerNoteInput,
} from "@gafus/core/services/notes";

type Actor = { id: string; role: string };
type Result = { success?: boolean; error?: string };
export interface TrainerNotesManagePorts {
  lookup: (query: string, limit: number) => Promise<{ id: string; username: string }[]>;
  list: (query: {
    page: number;
    pageSize: number;
    studentId?: string;
    trainerId: string | null;
  }) => ReturnType<typeof getTrainerNotes>;
  create: (input: CreateTrainerNoteInput, actorId: string) => Promise<Result>;
  update: (input: UpdateTrainerNoteInput, actorId: string, isAdmin: boolean) => Promise<Result>;
  remove: (input: DeleteTrainerNoteInput, actorId: string, isAdmin: boolean) => Promise<Result>;
}
const productionPorts: TrainerNotesManagePorts = {
  lookup: searchStudentsByUsername,
  list: getTrainerNotes,
  create: createTrainerNote,
  update: updateTrainerNote,
  remove: deleteTrainerNote,
};
const BAD = { success: false, code: "BAD_INPUT", error: "Некорректные данные" } as const;
const DENIED = { success: false, code: "FORBIDDEN", error: "Недостаточно прав" } as const;
const FAILURE = {
  success: false,
  code: "INTERNAL_SERVER_ERROR",
  error: "Операция не выполнена",
} as const;
const ROLES = new Set(["TRAINER", "ADMIN", "MODERATOR"]);
const CUID = /^c[a-z0-9]{8,}$/;
const NUM = /^(0|[1-9][0-9]*)$/;
const plain = (x: unknown): x is Record<string, unknown> =>
  x !== null &&
  typeof x === "object" &&
  !Array.isArray(x) &&
  Object.getPrototypeOf(x) === Object.prototype;
const authorised = (c: { get: (key: "user") => unknown }): Actor | null => {
  const value = c.get("user");
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    !("role" in value) ||
    typeof value.id !== "string" ||
    typeof value.role !== "string" ||
    !value.id ||
    !ROLES.has(value.role)
  )
    return null;
  return { id: value.id, role: value.role };
};
const requestIsJson = (value: string | undefined) =>
  !!value && /^application\/json(?:\s*;|\s*$)/i.test(value);
const safeBody = async (c: {
  req: { header: (name: string) => string | undefined; json: () => Promise<unknown> };
}) => {
  const length = c.req.header("content-length");
  if (
    !requestIsJson(c.req.header("content-type")) ||
    (length !== undefined && (!NUM.test(length) || Number(length) > 100_000))
  )
    return null;
  const value: unknown = await c.req.json().catch(() => null);
  return plain(value) ? value : null;
};
const noQuery = (queries: Record<string, string[]>) => Object.keys(queries).length === 0;

/**
 * In real Node HTTP the adapter can expose a non-null empty ReadableStream
 * for a bodyless DELETE. Require zero actual bytes, not a null stream pointer.
 * Examine no more than four empty chunks and cancel immediately on content;
 * reject declared positive Content-Length before reading anything.
 */
async function bodyIsEmpty(c: { req: {
  header: (name: string) => string | undefined;
  raw: Request;
} }): Promise<boolean> {
  const length = c.req.header("content-length");
  if (length !== undefined && (!NUM.test(length) || Number(length) !== 0)) return false;
  const stream = c.req.raw.body;
  if (stream === null) return true;
  const reader = stream.getReader();
  try {
    for (let i = 0; i < 4; i++) {
      const chunk = await reader.read();
      if (chunk.done) return true;
      if (chunk.value && chunk.value.byteLength > 0) return false;
    }
    return false;
  } catch {
    return false;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
const validKeys = (body: Record<string, unknown>, keys: string[]) =>
  Object.keys(body).every((key) => keys.includes(key));

export function createTrainerNotesManageRoutes(ports: TrainerNotesManagePorts = productionPorts) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Vary", "Cookie");
    await next();
    c.header("Cache-Control", "private, no-store");
  });
  app.get("/", async (c) => {
    const actor = authorised(c);
    if (!actor) return c.json(DENIED, 403);
    if (c.req.raw.body !== null) return c.json(BAD, 400);
    const q = c.req.queries();
    if (
      Object.keys(q).some(
        (key) => !["page", "pageSize", "studentId"].includes(key) || q[key]?.length !== 1,
      )
    )
      return c.json(BAD, 400);
    const pageRaw = q.page?.[0] ?? "0";
    const sizeRaw = q.pageSize?.[0] ?? "50";
    const studentId = q.studentId?.[0];
    if (
      !NUM.test(pageRaw) ||
      !NUM.test(sizeRaw) ||
      Number(pageRaw) > 1000 ||
      Number(sizeRaw) < 1 ||
      Number(sizeRaw) > 50 ||
      (studentId !== undefined && !CUID.test(studentId))
    )
      return c.json(BAD, 400);
    try {
      const data = await ports.list({
        page: Number(pageRaw),
        pageSize: Number(sizeRaw),
        studentId,
        trainerId: actor.role === "ADMIN" ? null : actor.id,
      });
      return c.json({ success: true, data }, 200);
    } catch {
      return c.json(FAILURE, 500);
    }
  });
  app.get("/lookup", async (c) => {
    const actor = authorised(c);
    if (!actor) return c.json(DENIED, 403);
    if (c.req.raw.body !== null) return c.json(BAD, 400);
    const q = c.req.queries();
    if (Object.keys(q).length !== 1 || q.query?.length !== 1) return c.json(BAD, 400);
    const search = q.query[0]?.trim() ?? "";
    if (search.length < 2 || search.length > 50) return c.json(BAD, 400);
    try {
      const data = await ports.lookup(search, 10);
      return c.json({ success: true, data }, 200);
    } catch {
      return c.json(FAILURE, 500);
    }
  });
  app.post("/", async (c) => {
    const actor = authorised(c);
    if (!actor) return c.json(DENIED, 403);
    if (!noQuery(c.req.queries())) return c.json(BAD, 400);
    const body = await safeBody(c);
    if (!body || !validKeys(body, ["title", "entries", "studentIds", "tags"]))
      return c.json(BAD, 400);
    const parsed = createTrainerNoteSchema.strict().safeParse(body);
    if (!parsed.success || new Set(parsed.data.studentIds).size !== parsed.data.studentIds.length)
      return c.json(BAD, 400);
    try {
      const result = await ports.create(parsed.data, actor.id);
      if (!result.success) return c.json(FAILURE, 409);
      return c.json({ success: true }, 201);
    } catch {
      return c.json(FAILURE, 500);
    }
  });
  app.put("/:id", async (c) => {
    const actor = authorised(c);
    if (!actor) return c.json(DENIED, 403);
    const id = c.req.param("id");
    if (!CUID.test(id) || !noQuery(c.req.queries())) return c.json(BAD, 400);
    const body = await safeBody(c);
    if (!body || !validKeys(body, ["title", "entries", "studentIds", "tags"]))
      return c.json(BAD, 400);
    const parsed = updateTrainerNoteSchema.strict().safeParse({ ...body, id });
    if (
      !parsed.success ||
      (parsed.data.studentIds &&
        new Set(parsed.data.studentIds).size !== parsed.data.studentIds.length)
    )
      return c.json(BAD, 400);
    try {
      const result = await ports.update(parsed.data, actor.id, actor.role === "ADMIN");
      if (!result.success) return c.json(FAILURE, 409);
      return c.json({ success: true }, 200);
    } catch {
      return c.json(FAILURE, 500);
    }
  });
  app.delete("/:id", async (c) => {
    const actor = authorised(c);
    if (!actor) return c.json(DENIED, 403);
    if (!noQuery(c.req.queries()) || !(await bodyIsEmpty(c))) return c.json(BAD, 400);
    const parsed = deleteTrainerNoteSchema.strict().safeParse({ id: c.req.param("id") });
    if (!parsed.success) return c.json(BAD, 400);
    try {
      const result = await ports.remove(parsed.data, actor.id, actor.role === "ADMIN");
      if (!result.success) return c.json(FAILURE, 409);
      return c.json({ success: true }, 200);
    } catch {
      return c.json(FAILURE, 500);
    }
  });
  return app;
}
export const trainerNotesManageRoutes = createTrainerNotesManageRoutes();
