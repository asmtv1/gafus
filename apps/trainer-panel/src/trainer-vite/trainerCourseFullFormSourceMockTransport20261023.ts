/** COURSE011/TR012: test-injected SOURCE/MOCK-only CourseForm port. No fetch implementation. */
import { z } from "zod";
import type {
  TrainerCourseFormCreateWireRequest,
  TrainerCourseFormUpdateWireRequest,
  TrainerCourseFormCreateWireSuccess,
  TrainerCourseFormUpdateWireSuccess,
} from "../../../../packages/types/src/data/trainer-read-contracts";
import { parseVersionedCourseEditorSnapshot } from "./trainerCourseDraftReadContract";

export type CourseFormCreateBody = TrainerCourseFormCreateWireRequest;
export type CourseFormUpdateBody = TrainerCourseFormUpdateWireRequest;
export type CourseFormSourceMockTransport = (request: {
  path: string;
  method: "GET" | "POST" | "PUT";
  payload?: CourseFormCreateBody | CourseFormUpdateBody;
  signal: AbortSignal;
}) => Promise<{
  status: number;
  headers: Record<string, string>;
  body: unknown;
}>;

const id = /^[A-Za-z0-9_-]{1,128}$/;
const revision = z.number().int().min(1).max(2147483647);
const createdSchema = z
  .object({
    success: z.literal(true),
    data: z.object({ id: z.string().regex(id) }).strict(),
  })
  .strict();
const updatedSchema = z
  .object({
    success: z.literal(true),
    data: z.object({ id: z.string().regex(id), version: revision }).strict(),
  })
  .strict();

export type SourceMockWriteResult<T> =
  | { kind: "success"; data: T }
  | { kind: "stale" }
  | { kind: "invalid" }
  | { kind: "denied" }
  | { kind: "unknown" };

function checkPrivateHeaders(headers: Record<string, string>): void {
  const cache = (headers["cache-control"] ?? headers["Cache-Control"] ?? "")
    .toLowerCase()
    .split(",")
    .map((value) => value.trim());
  const referrer = (headers["referrer-policy"] ?? headers["Referrer-Policy"] ?? "").toLowerCase();
  if (
    !cache.includes("private") ||
    !cache.includes("no-store") ||
    cache.includes("public") ||
    referrer !== "no-referrer"
  ) {
    throw Error("UNSAFE_PRIVATE_RESPONSE");
  }
}

function verifyCurrent(signal: AbortSignal, isCurrent: () => boolean): void {
  if (signal.aborted || !isCurrent()) throw Error("SESSION_RETIRED");
}

async function call(input: {
  transport: CourseFormSourceMockTransport;
  method: "GET" | "POST" | "PUT";
  path: string;
  payload?: CourseFormCreateBody | CourseFormUpdateBody;
  signal: AbortSignal;
  isCurrent: () => boolean;
}) {
  verifyCurrent(input.signal, input.isCurrent);
  const result = await input.transport({
    method: input.method,
    path: input.path,
    ...(input.payload === undefined ? {} : { payload: input.payload }),
    signal: input.signal,
  });
  verifyCurrent(input.signal, input.isCurrent);
  checkPrivateHeaders(result.headers);
  return result;
}

export async function mockCreateCourse(input: {
  transport: CourseFormSourceMockTransport;
  body: CourseFormCreateBody;
  signal: AbortSignal;
  isCurrent: () => boolean;
}): Promise<SourceMockWriteResult<TrainerCourseFormCreateWireSuccess["data"]>> {
  const result = await call({
    transport: input.transport,
    path: "/api/v1/trainer/courses",
    method: "POST",
    payload: input.body,
    signal: input.signal,
    isCurrent: input.isCurrent,
  });
  if (result.status === 400) return { kind: "invalid" };
  if (result.status === 403 || result.status === 404) return { kind: "denied" };
  if (result.status !== 201) return { kind: "unknown" };
  const parsed = createdSchema.safeParse(result.body);
  if (!parsed.success) return { kind: "unknown" };
  const data = parsed.data.data satisfies TrainerCourseFormCreateWireSuccess["data"];
  return { kind: "success", data };
}

export async function mockUpdateCourse(input: {
  transport: CourseFormSourceMockTransport;
  courseId: string;
  body: CourseFormUpdateBody;
  signal: AbortSignal;
  isCurrent: () => boolean;
}): Promise<SourceMockWriteResult<TrainerCourseFormUpdateWireSuccess["data"]>> {
  if (!id.test(input.courseId)) return { kind: "invalid" };
  const result = await call({
    transport: input.transport,
    path: `/api/v1/trainer/courses/${encodeURIComponent(input.courseId)}`,
    method: "PUT",
    payload: input.body,
    signal: input.signal,
    isCurrent: input.isCurrent,
  });
  if (result.status === 409) return { kind: "stale" };
  if (result.status === 400) return { kind: "invalid" };
  if (result.status === 403 || result.status === 404) return { kind: "denied" };
  if (result.status !== 200) return { kind: "unknown" };
  const parsed = updatedSchema.safeParse(result.body);
  if (
    !parsed.success ||
    parsed.data.data.id !== input.courseId ||
    parsed.data.data.version !== input.body.expectedVersion + 1
  ) {
    return { kind: "unknown" };
  }
  const data = parsed.data.data satisfies TrainerCourseFormUpdateWireSuccess["data"];
  return { kind: "success", data };
}

export async function mockReadEditorSnapshot(input: {
  transport: CourseFormSourceMockTransport;
  courseId: string;
  signal: AbortSignal;
  isCurrent: () => boolean;
}) {
  if (!id.test(input.courseId)) throw Error("INVALID_COURSE_ID");
  const result = await call({
    transport: input.transport,
    method: "GET",
    path: `/api/v1/trainer/courses/${encodeURIComponent(input.courseId)}/editor-snapshot`,
    signal: input.signal,
    isCurrent: input.isCurrent,
  });
  if (result.status !== 200) throw Error(`HTTP_${result.status}`);
  return parseVersionedCourseEditorSnapshot(result.body, input.courseId);
}
