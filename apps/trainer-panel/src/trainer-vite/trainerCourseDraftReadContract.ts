/**
 * AG4-TR-012: actual Hono GET is source-mounted and boundary-verified.
 * Browser default remains OFF; authoring mutations are not approved.
 * Source: Core trainerCourse.getCourseDraftWithRelations and Next EditCoursePage.
 */
import { z } from "zod/v3";
import type {
  TrainerCourseDraftRead,
  TrainerCourseEditorSnapshotRead,
} from "../../../../packages/types/src/data/trainer-read-contracts";
import type { PanelActor } from "./consultationContract";

const safeId = /^[A-Za-z0-9_-]{1,128}$/;
const text = z.string();
const courseLevel = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]);
const dayLink = z
  .object({
    id: text.min(1),
    dayId: text.min(1),
    order: z.number().int().positive(),
    day: z.object({ id: text.min(1), title: text }).strict(),
  })
  .strict();
const allowedUser = z
  .object({
    userId: text.min(1),
    user: z.object({ id: text.min(1), username: text }).strict(),
  })
  .strict();
/** Exact fields from Core CourseDraftDto (never include author email/reviews/progress). */
export const trainerCourseDraftSchema = z
  .object({
    id: text.min(1),
    name: text.min(1),
    guideContent: text.nullable(),
    shortDesc: text,
    description: text,
    duration: text.min(1),
    videoUrl: text.nullable(),
    logoImg: text,
    isPrivate: z.boolean(),
    isPaid: z.boolean(),
    showInProfile: z.boolean(),
    isPersonalized: z.boolean(),
    equipment: text,
    trainingLevel: courseLevel,
    dayLinks: z.array(dayLink),
    access: z.array(allowedUser),
  })
  .strict();
export type TrainerCourseDraft = z.infer<typeof trainerCourseDraftSchema>;

/** Future full-form editor MUST obtain fields + version in ONE server snapshot.
 * Do not merge independent GET /draft and GET /version (TOCTOU risk).
 * This is a strict contract/parser ONLY, not a registered producer or HTTP fetch. */
export const versionedCourseEditorSnapshotSchema = trainerCourseDraftSchema
  .extend({
    version: z.number().int().min(1).max(2147483647),
  })
  .strict();
export type VersionedCourseEditorSnapshot = z.infer<typeof versionedCourseEditorSnapshotSchema>;
export function parseVersionedCourseEditorSnapshot(
  raw: unknown,
  courseId: string,
): VersionedCourseEditorSnapshot {
  const envelope = z
    .object({ success: z.literal(true), data: versionedCourseEditorSnapshotSchema })
    .strict()
    .parse(raw) satisfies TrainerCourseEditorSnapshotRead;
  const dto = envelope.data;
  if (dto.id !== courseId) throw Error("FOREIGN_SNAPSHOT");
  if (
    dto.dayLinks.some((link) => link.dayId !== link.day.id) ||
    dto.access.some((item) => item.userId !== item.user.id)
  )
    throw Error("INVALID_SNAPSHOT_REFERENCES");
  return dto;
}

/** Returns a route param, not an authorization scope or owner override. */
export function extractCourseDraftId(pathname: string): string | null {
  const route = /^\/main-panel\/courses\/([^/?#]+)\/edit\/?$/.exec(pathname);
  if (!route) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(route[1]!);
  } catch {
    return null;
  }
  return safeId.test(decoded) ? decoded : null;
}
export function trainerCourseDraftPath(courseId: string, actor: PanelActor): string {
  if (
    !safeId.test(courseId) ||
    !safeId.test(actor.id) ||
    (actor.role !== "TRAINER" && actor.role !== "ADMIN")
  ) {
    throw Error("INVALID_OR_UNAUTHORIZED_COURSE_DRAFT");
  }
  return `/api/v1/trainer/courses/${encodeURIComponent(courseId)}/draft`;
}
export function parseTrainerCourseDraftEnvelope(
  raw: unknown,
  courseId: string,
): TrainerCourseDraft {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("BAD_DRAFT_ENVELOPE");
  const envelope = raw as Record<string, unknown>;
  if (
    Object.keys(envelope).length !== 2 ||
    envelope.success !== true ||
    !Object.hasOwn(envelope, "data")
  )
    throw Error("BAD_DRAFT_ENVELOPE");
  const dto = trainerCourseDraftSchema.parse(
    envelope.data,
  ) satisfies TrainerCourseDraftRead["data"];
  if (dto.id !== courseId) throw Error("FOREIGN_COURSE_DTO");
  if (dto.dayLinks.some((link) => link.dayId !== link.day.id)) throw Error("INVALID_DAY_REFERENCE");
  if (dto.access.some((access) => access.userId !== access.user.id))
    throw Error("INVALID_USER_REFERENCE");
  return dto;
}

/** Read-only adapter for mounted Hono GET; default browser remains disabled. */
export async function readTrainerCourseDraft(input: {
  actor: PanelActor;
  courseId: string;
  token: string;
  signal: AbortSignal;
  fetchImpl: typeof fetch;
  isCurrent: () => boolean;
}): Promise<TrainerCourseDraft> {
  const path = trainerCourseDraftPath(input.courseId, input.actor);
  if (!input.token || input.signal.aborted || !input.isCurrent()) throw Error("SESSION_RETIRED");
  const res = await input.fetchImpl(path, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.token}` },
    cache: "no-store",
    referrerPolicy: "no-referrer",
    signal: input.signal,
  });
  if (!input.isCurrent() || input.signal.aborted) throw Error("SESSION_RETIRED");
  const cache =
    res.headers
      .get("cache-control")
      ?.toLowerCase()
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean) ?? [];
  if (
    !cache.includes("private") ||
    !cache.includes("no-store") ||
    cache.includes("public") ||
    res.headers.get("referrer-policy")?.toLowerCase() !== "no-referrer"
  )
    throw Error("UNSAFE_PRIVATE_RESPONSE");
  if (res.status !== 200) throw Error(`HTTP_${res.status}`);
  let raw: unknown;
  try {
    raw = JSON.parse(await res.text());
  } catch {
    throw Error("BAD_DRAFT_JSON");
  }
  if (!input.isCurrent() || input.signal.aborted) throw Error("SESSION_RETIRED");
  return parseTrainerCourseDraftEnvelope(raw, input.courseId);
}
