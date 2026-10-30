/**
 * AG4 TR018: scoped GETs registered in Hono source; default Vite remains OFF.
 * Accepted proposal original SHA256 2e3064f7cc07127fa5d964aff58657478afa8f07ad6a34ca4dd0206e8a2ca7c1.
 * Keep it separate from API source and fail closed if the accepted DTO drifts.
 */
import { z } from "zod/v3";
import type {TrainerCourseStatisticsData,TrainerStepStatisticsData} from "@gafus/types";
import type { PanelActor } from "./consultationContract";

export type StatisticsKind = "courses" | "steps";
export type StatisticsScope = { kind: "own" } | { kind: "all" } | {
  kind: "trainer"; trainerUserId: string;
};
const nonnegative = z.number().int().nonnegative();
const course = z.object({
  id: z.string().min(1), name: z.string(), logoImg: z.string(),
  avgRating: z.number().finite().nullable(),
  isPrivate: z.boolean(), isPaid: z.boolean(), isPersonalized: z.boolean(),
  trainingLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]),
  totalUsers: nonnegative, completedUsers: nonnegative,
  inProgressUsers: nonnegative, notStartedUsers: nonnegative,
  author: z.object({
    username: z.string(), fullName: z.string().nullable().optional(),
  }).strict().optional(),
}).strict();
const courses = z.object({
  courses: z.array(course), totalCourses: nonnegative, totalDays: nonnegative,
}).strict();
const step = z.object({
  id: z.string().min(1), title: z.string(), durationSec: nonnegative.nullable(),
  usedInDaysCount: nonnegative, usedInCoursesCount: nonnegative,
}).strict();
const steps = z.object({
  steps: z.array(step), totalSteps: nonnegative,
  progressMetrics: z.literal("NOT_COMPUTED"),
}).strict();
export type CourseStatistics = TrainerCourseStatisticsData;
export type StepStatistics = TrainerStepStatisticsData;
export type TrainerStatisticsDto = CourseStatistics | StepStatistics;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const root = "/api/v1/trainer/statistics/";

export function proposedTrainerStatisticsPath(
  actor: PanelActor, kind: StatisticsKind, scope: StatisticsScope,
): string {
  if (!idPattern.test(actor.id) || (actor.role !== "TRAINER" && actor.role !== "ADMIN")) {
    throw Error("STAFF_DENIED");
  }
  const path = root + kind;
  if (actor.role === "TRAINER") {
    if (scope.kind !== "own") throw Error("FOREIGN_SCOPE_DENIED");
    return path;
  }
  if (scope.kind === "all") return path + "?scope=all";
  if (scope.kind !== "trainer" || !idPattern.test(scope.trainerUserId)) {
    throw Error("INVALID_ADMIN_SCOPE");
  }
  return path + "?" + new URLSearchParams({
    scope: "trainer", trainerUserId: scope.trainerUserId,
  }).toString();
}

/** Never cast unknown envelopes or show private API errors to a user. */
export function parseProposedStatistics(kind: StatisticsKind, raw: unknown): TrainerStatisticsDto {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("BAD_ENVELOPE");
  const payload = raw as Record<string, unknown>;
  if (payload.success !== true || !Object.hasOwn(payload, "data")) throw Error("BAD_ENVELOPE");
  if (kind === "courses") {
    const data = courses.parse(payload.data);
    if (data.courses.length !== data.totalCourses || data.courses.some(
      item => item.completedUsers + item.inProgressUsers + item.notStartedUsers > item.totalUsers,
    )) throw Error("BAD_COURSE_TOTALS");
    return data;
  }
  const data = steps.parse(payload.data);
  if (data.steps.length !== data.totalSteps) throw Error("BAD_STEP_TOTALS");
  return data;
}

export async function fetchProposedTrainerStatistics(input: {
  actor: PanelActor; kind: StatisticsKind; scope: StatisticsScope;
  token: string; fetchImpl: typeof fetch; isCurrent: () => boolean;
  signal: AbortSignal;
}): Promise<TrainerStatisticsDto> {
  if (!input.token || !input.isCurrent() || input.signal.aborted) throw Error("SESSION_RETIRED");
  const path = proposedTrainerStatisticsPath(input.actor, input.kind, input.scope);
  const res = await input.fetchImpl(path, {
    method: "GET", headers: { Authorization: `Bearer ${input.token}` },
    cache: "no-store", referrerPolicy: "no-referrer", signal: input.signal,
  });
  if (!input.isCurrent() || input.signal.aborted) throw Error("SESSION_RETIRED");
  if (!res.headers.get("cache-control")?.includes("private") ||
      !res.headers.get("cache-control")?.includes("no-store") ||
      res.headers.get("referrer-policy") !== "no-referrer") throw Error("UNSAFE_CACHE");
  if (res.status !== 200) throw Error("HTTP_" + res.status);
  let decoded: unknown;
  try { decoded = JSON.parse(await res.text()); }
  catch { throw Error("INVALID_JSON"); }
  if (!input.isCurrent() || input.signal.aborted) throw Error("SESSION_RETIRED");
  return parseProposedStatistics(input.kind, decoded);
}
