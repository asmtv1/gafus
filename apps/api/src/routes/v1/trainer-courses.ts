/**
 * TR012 registered editor READ and name-only CAS remain unchanged.
 * COURSE031 full-form POST/PUT are SOURCE/MOCK ONLY and default OFF.
 * No activated full-form write, media or provider operations.
 */
import { randomUUID } from "node:crypto";
import { Hono, type TypedResponse } from "hono";
import type {
  createCourse,
  updateCourse,
  getCourseEditorSnapshot,
  createTrainerCourseSchema,
  updateTrainerCourseSchema,
} from "@gafus/core/services/trainerCourse";
import type {
  TrainerCourseVersionRead,
  TrainerCourseDraftRead,
  TrainerCourseEditorSnapshotRead,
  TrainerCourseFormCreateWireRequest,
  TrainerCourseFormUpdateWireRequest,
  TrainerCourseFormCreateWireSuccess,
  TrainerCourseFormUpdateWireSuccess,
} from "../../../../../packages/types/src/data/trainer-read-contracts";
import {
  readCourseNameVersion,
  updateCourseNameVersioned,
} from "@gafus/core/services/trainerCourse";
import { readCourseEditorApplication } from "../../modules/trainer-courses/composition/read-course-editor.js";

export const trainerCoursesRoutes = new Hono();

const courseIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
// Explicit malformed empty parameter; Hono does not match //draft to :courseId.
trainerCoursesRoutes.get("//draft", (c) => c.json({
  success: false, code: "BAD_QUERY", error: "Некорректный ID курса",
}, 400));

trainerCoursesRoutes.get("/:courseId/draft", async (c) => {
  const courseId = c.req.param("courseId");
  // Query is never an authorization mechanism. Disallow even unknown extras.
  if (!courseIdPattern.test(courseId) || Object.keys(c.req.queries()).length > 0 ||
      c.req.raw.body !== null) {
    return c.json({
      success: false, code: "BAD_QUERY", error: "Некорректный ID курса",
    }, 400);
  }
  const actor = c.get("user");
  if (actor.role !== "TRAINER" && actor.role !== "ADMIN") {
    return c.json({
      success: false, code: "FORBIDDEN", error: "Недостаточно прав",
    }, 403);
  }
  try {
    const draft = await readCourseEditorApplication.draft(courseId, actor.id, {
      allowAdmin: actor.role === "ADMIN",
    });
    if (!draft) {
      // Existing Core returns null for missing, foreign, AND swallowed DB errors.
      return c.json({ success: false, code: "NOT_FOUND", error: "Курс не найден" }, 404);
    }
    return c.json({ success: true, data: draft } satisfies TrainerCourseDraftRead);
  } catch {
    // Never expose Core/Prisma error, actor, course draft, or stack.
    return c.json({
      success: false, code: "INTERNAL_SERVER_ERROR", error: "Внутренняя ошибка сервера",
    }, 500);
  }
});


// AG1/AG4 TR012: one coherent Course/version/relations editor snapshot.
// No client owner override, new mutation or old strict /draft schema change.
trainerCoursesRoutes.get("/:courseId/editor-snapshot", async c => {
  const courseId = c.req.param("courseId");
  if (!courseIdPattern.test(courseId) || Object.keys(c.req.queries()).length !== 0 ||
      c.req.raw.body !== null)
    return c.json({
      success: false, code: "BAD_QUERY", error: "Некорректный ID курса",
    }, 400);
  const actor = c.get("user");
  if (actor.role !== "TRAINER" && actor.role !== "ADMIN")
    return c.json({
      success: false, code: "FORBIDDEN", error: "Недостаточно прав",
    }, 403);
  try {
    const result = await readCourseEditorApplication.editorSnapshot(courseId, {
      id: actor.id, role: actor.role,
    });
    if (result.status === "not_found")
      return c.json({
        success: false, code: "NOT_FOUND", error: "Курс не найден",
      }, 404);
    if (result.status === "invalid")
      return c.json({
        success: false, code: "BAD_QUERY", error: "Некорректный ID курса",
      }, 400);
    if (result.status !== "found")
      return c.json({
        success: false, code: "INTERNAL_SERVER_ERROR",
        error: "Внутренняя ошибка сервера",
      }, 500);
    return c.json({
      success: true, data: result.data,
    } satisfies TrainerCourseEditorSnapshotRead);
  } catch {
    return c.json({
      success: false, code: "INTERNAL_SERVER_ERROR",
      error: "Внутренняя ошибка сервера",
    }, 500);
  }
});


// AG1 additive global Course.version: only private versioned name-only CAS.
// Full-form, media, days and access writes are NOT mounted by these routes.
const invalidVersionQuery = {
  success:false,code:"BAD_QUERY",error:"Некорректный запрос",
} as const;
const unknownVersionError = {
  success:false,code:"INTERNAL_SERVER_ERROR",error:"Внутренняя ошибка сервера",
} as const;

trainerCoursesRoutes.get("/:courseId/version",async c=>{
  const courseId=c.req.param("courseId");
  if (!courseIdPattern.test(courseId) || Object.keys(c.req.queries()).length>0 ||
      c.req.raw.body!==null)
    return c.json(invalidVersionQuery,400);
  const user=c.get("user");
  if (user.role!=="TRAINER" && user.role!=="ADMIN")
    return c.json({success:false,code:"FORBIDDEN",error:"Недостаточно прав"},403);
  const result=await readCourseNameVersion(courseId,{id:user.id,role:user.role});
  if (result.status==="found")
    return c.json({success:true,data:result.data} satisfies TrainerCourseVersionRead);
  if (result.status==="not_found")
    return c.json({success:false,code:"NOT_FOUND",error:"Курс не найден"},404);
  if (result.status==="invalid")return c.json(invalidVersionQuery,400);
  return c.json(unknownVersionError,500);
});

trainerCoursesRoutes.patch("/:courseId/name",async c=>{
  const courseId=c.req.param("courseId");
  if (!courseIdPattern.test(courseId) || Object.keys(c.req.queries()).length>0)
    return c.json(invalidVersionQuery,400);
  const user=c.get("user");
  if (user.role!=="TRAINER" && user.role!=="ADMIN")
    return c.json({success:false,code:"FORBIDDEN",error:"Недостаточно прав"},403);
  let body:unknown;
  try { body=await c.req.json(); }
  catch { return c.json(invalidVersionQuery,400); }
  if (!body || typeof body!=="object" || Array.isArray(body))
    return c.json(invalidVersionQuery,400);
  const fields=Object.keys(body);
  if (fields.length!==2 || !fields.includes("name") ||
      !fields.includes("expectedVersion"))
    return c.json(invalidVersionQuery,400);
  const input=body as {name:unknown;expectedVersion:unknown};
  if (typeof input.name!=="string" || input.name.length<1 ||
      input.name.length>500 || typeof input.expectedVersion!=="number" ||
      !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion<1 ||
      input.expectedVersion>2147483647)
    return c.json(invalidVersionQuery,400);
  const result=await updateCourseNameVersioned({
    courseId,name:input.name,expectedVersion:input.expectedVersion,
  },{id:user.id,role:user.role});
  if (result.status==="updated")
    return c.json({success:true,data:result.data} satisfies TrainerCourseVersionRead);
  if (result.status==="stale")
    return c.json({success:false,code:"STALE_VERSION",error:"Версия курса устарела"},409);
  if (result.status==="not_found")
    return c.json({success:false,code:"NOT_FOUND",error:"Курс не найден"},404);
  if (result.status==="invalid")return c.json(invalidVersionQuery,400);
  return c.json(unknownVersionError,500);
});

/**
 * COURSE031: SOURCE/MOCK ONLY. The real app mounts this with NO capabilities.
 * No production composition ever provides real Core create/update functions.
 * To exercise the route, isolated tests must inject all mocked Core ports.
 */
type CourseFormMockPorts = {
  create: typeof createCourse;
  update: typeof updateCourse;
  snapshot: typeof getCourseEditorSnapshot;
  createSchema: typeof createTrainerCourseSchema;
  updateSchema: typeof updateTrainerCourseSchema;
};

type MockWriteOptIn = {
  mode: "SOURCE_MOCK_ONLY";
  ports: CourseFormMockPorts;
};

const invalidFullForm = {
  success: false, code: "BAD_QUERY", error: "Некорректный запрос",
} as const;
const internalFullForm = {
  success: false, code: "INTERNAL_SERVER_ERROR", error: "Внутренняя ошибка сервера",
} as const;
const hiddenFullForm = {
  success: false, code: "NOT_FOUND", error: "Курс недоступен",
} as const;
const forbiddenFullForm = {
  success: false, code: "FORBIDDEN", error: "Недостаточно прав",
} as const;
const staleFullForm = {
  success: false, code: "STALE_VERSION", error: "Версия курса устарела",
} as const;

function plainBody(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function ordinaryFreePublicBody(
  value: Record<string, unknown>,
): value is Record<string, unknown> & Pick<
  TrainerCourseFormCreateWireRequest,
  "isPublic" | "isPaid" | "logoImg" | "videoUrl" | "allowedUsers"
> {
  return value.isPublic === true && value.isPaid === false &&
    value.logoImg === "" && value.videoUrl === null &&
    Array.isArray(value.allowedUsers) && value.allowedUsers.length === 0;
}
function permittedFields(value: Record<string, unknown>, keys: Set<string>): boolean {
  return Object.keys(value).every(key => keys.has(key));
}
function validNextVersion(
  value: unknown, before: TrainerCourseFormUpdateWireRequest["expectedVersion"],
): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value === before + 1 && value <= 2147483647;
}

/** Exported ONLY for explicit mock-injected Hono source tests, never real app. */
export function createTrainerCourseFormSourceMockRoutes(optIn?: MockWriteOptIn) {
  const ports = optIn?.mode === "SOURCE_MOCK_ONLY" ? optIn.ports : undefined;
  const allowedFormFields = ports && new Set(
    Object.keys(ports.createSchema.shape).filter(key => key !== "id"),
  );
  const allowedUpdateFields = allowedFormFields &&
    new Set([...allowedFormFields, "expectedVersion"]);
  const routes = new Hono();
  routes.post("/", async c => {
    if (!ports) return c.json(hiddenFullForm, 404);
    if (Object.keys(c.req.queries()).length !== 0 ||
        c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase() !==
          "application/json") return c.json(invalidFullForm, 400);
    const actor = c.get("user");
    if (!actor || (actor.role !== "TRAINER" && actor.role !== "ADMIN"))
      return c.json(forbiddenFullForm, 403);
    let body: unknown;
    try { body = await c.req.json(); }
    catch { return c.json(invalidFullForm, 400); }
    if (!plainBody(body) || !allowedFormFields || !permittedFields(body, allowedFormFields) ||
        !ordinaryFreePublicBody(body)) return c.json(invalidFullForm, 400);
    const id = randomUUID();
    const checked = ports.createSchema.safeParse({ ...body, id });
    if (!checked.success) return c.json(invalidFullForm, 400);
    try {
      const result = await ports.create(checked.data, actor.id);
      if (result.success !== true || result.id !== id)
        return c.json(internalFullForm, 500);
      return c.json({ success: true, data: { id } }, 201) satisfies
        Response & TypedResponse<TrainerCourseFormCreateWireSuccess, 201, "json">;
    } catch { return c.json(internalFullForm, 500); }
  });
  routes.put("/:courseId", async c => {
    if (!ports) return c.json(hiddenFullForm, 404);
    const courseId = c.req.param("courseId");
    if (!courseIdPattern.test(courseId) || Object.keys(c.req.queries()).length !== 0 ||
        c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase() !==
          "application/json") return c.json(invalidFullForm, 400);
    const actor = c.get("user");
    if (!actor || (actor.role !== "TRAINER" && actor.role !== "ADMIN"))
      return c.json(forbiddenFullForm, 403);
    let body: unknown;
    try { body = await c.req.json(); }
    catch { return c.json(invalidFullForm, 400); }
    if (!plainBody(body) || !allowedUpdateFields || !permittedFields(body, allowedUpdateFields) ||
        !ordinaryFreePublicBody(body) ||
        typeof body.expectedVersion !== "number" ||
        !Number.isSafeInteger(body.expectedVersion) ||
        body.expectedVersion < 1 || body.expectedVersion > 2147483647)
      return c.json(invalidFullForm, 400);
    const parsed = ports.updateSchema.safeParse({ ...body, id: courseId });
    if (!parsed.success) return c.json(invalidFullForm, 400);
    try {
      // Owner-scoped coherent Core snapshot checks the EXISTING target subset.
      // CAS in Core makes any subsequent parent change fail on this same version.
      const observed = await ports.snapshot(courseId, { id: actor.id, role: actor.role });
      if (observed.status === "not_found") return c.json(hiddenFullForm, 404);
      if (observed.status === "invalid") return c.json(invalidFullForm, 400);
      if (observed.status !== "found") return c.json(internalFullForm, 500);
      const current = observed.data;
      if (current.id !== courseId || !Number.isSafeInteger(current.version) ||
          current.version < 1 || current.version > 2147483647)
        return c.json(internalFullForm, 500);
      if (current.isPaid !== false || current.isPrivate !== false ||
          current.logoImg !== "" || current.videoUrl !== null ||
          !Array.isArray(current.access) || current.access.length !== 0)
        return c.json(forbiddenFullForm, 403);
      if (current.version !== parsed.data.expectedVersion)
        return c.json(staleFullForm, 409);
      const result = await ports.update(parsed.data, { id: actor.id, role: actor.role });
      if (result.success === true) {
        if (!validNextVersion(result.version, parsed.data.expectedVersion))
          return c.json(internalFullForm, 500);
        return c.json({ success: true, data: { id: courseId, version: result.version } }) satisfies
          Response & TypedResponse<TrainerCourseFormUpdateWireSuccess, 200, "json">;
      }
      if (result.status === "stale") return c.json(staleFullForm, 409);
      if (result.status === "not_found") return c.json(hiddenFullForm, 404);
      if (result.status === "invalid") return c.json(invalidFullForm, 400);
      return c.json(internalFullForm, 500);
    } catch { return c.json(internalFullForm, 500); }
  });
  return routes;
}

// Real app gets only fail-closed handlers; real Core writers are NOT wired here.
trainerCoursesRoutes.route("/", createTrainerCourseFormSourceMockRoutes());
