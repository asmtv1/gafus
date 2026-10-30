/**
 * AG1-LEARN/OPS TR018 approved scoped G1 policy and DTO projector.
 * Runtime registration uses the same server-side actor policy.
 * Legacy userId/isElevated are not request parameters: server derives them.
 */
import { z } from "zod/v3";

export const trainerStatisticsG1Proposal = {
  method: "GET",
  coursesPath: "/api/v1/trainer/statistics/courses",
  stepsPath: "/api/v1/trainer/statistics/steps",
  cacheControl: "private, no-store",
  referrerPolicy: "no-referrer",
} as const;

const nonnegativeInt = z.number().int().nonnegative();
const statisticsCourse = z.object({
  id: z.string().min(1),
  name: z.string(),
  logoImg: z.string(),
  avgRating: z.number().finite().nullable(),
  isPrivate: z.boolean(),
  isPaid: z.boolean(),
  isPersonalized: z.boolean(),
  trainingLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]),
  totalUsers: nonnegativeInt,
  completedUsers: nonnegativeInt,
  inProgressUsers: nonnegativeInt,
  notStartedUsers: nonnegativeInt,
  author: z.object({
    username: z.string(),
    fullName: z.string().nullable().optional(),
  }).optional(),
});
const courseSource = z.object({
  courses: z.array(statisticsCourse),
  totalCourses: nonnegativeInt,
  totalDays: nonnegativeInt,
});
const statisticsStep = z.object({
  id: z.string().min(1),
  title: z.string(),
  durationSec: nonnegativeInt.nullable(),
  usedInDaysCount: nonnegativeInt,
  usedInCoursesCount: nonnegativeInt,
});
const stepSource = z.object({
  steps: z.array(statisticsStep),
  totalSteps: nonnegativeInt,
});

export type ProposedCourseStatisticsDto = z.infer<typeof courseSource>;
export type ProposedStepStatisticsDto = z.infer<typeof stepSource> & {
  /** Core getStepStatistics returns placeholder zero user-progress counts. */
  progressMetrics: "NOT_COMPUTED";
};

/**
 * No reviews, userCourses, participant IDs, usernames or avatars are exposed.
 * Invalid source aggregation fails closed; never invent/synthesize real metrics.
 */
export function projectCourseStatisticsForTrainer(raw: unknown): ProposedCourseStatisticsDto {
  const data = courseSource.parse(raw);
  if (
    data.totalCourses !== data.courses.length ||
    data.courses.some((course) =>
      course.completedUsers + course.inProgressUsers + course.notStartedUsers > course.totalUsers
    )
  ) {
    throw new Error("TRAINER_STATISTICS_SOURCE_INVARIANT_FAILED");
  }
  return data;
}

/** Usage counts are genuine link cardinalities; step user progress is not computed. */
export function projectStepStatisticsForTrainer(raw: unknown): ProposedStepStatisticsDto {
  const data = stepSource.parse(raw);
  if (data.totalSteps !== data.steps.length) {
    throw new Error("TRAINER_STEP_STATISTICS_SOURCE_INVARIANT_FAILED");
  }
  return { ...data, progressMetrics: "NOT_COMPUTED" };
}

export type StatisticsActor = { id: string; role: string } | null;
export type ProposedStaffScope = { userId: string; isElevated: boolean };
export type StatsContractError = {
  ok: false;
  status: 400 | 401 | 403 | 404;
  code: "BAD_QUERY" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND";
  error: string;
};
export type ProposedScopeResult = { ok: true; scope: ProposedStaffScope } | StatsContractError;

const fail = (
  status: StatsContractError["status"],
  code: StatsContractError["code"],
  error: string,
): StatsContractError => ({ ok: false, status, code, error });

/**
 * Staff statistics actor/owner policy shared by contract fixtures and Hono.
 * ADMIN explicitly chooses all or trainer; TRAINER is always own-scoped.
 * isElevated, arbitrary userId and unknown query parameters are rejected.
 */
export async function resolveTrainerStatisticsScope(
  actor: StatisticsActor,
  query: Record<string, string | string[] | undefined>,
  isExistingTrainer: (userId: string) => Promise<boolean>,
): Promise<ProposedScopeResult> {
  if (!actor) return fail(401, "UNAUTHORIZED", "Не авторизован");
  if (actor.role !== "TRAINER" && actor.role !== "ADMIN") {
    return fail(403, "FORBIDDEN", "Недостаточно прав");
  }
  // Use Hono req.queries() at the boundary. Duplicate scope or IDs fail closed.
  if (Object.values(query).some((value) => Array.isArray(value) && value.length !== 1)) {
    return fail(400, "BAD_QUERY", "Неоднозначные параметры статистики");
  }
  const scope = Array.isArray(query.scope) ? query.scope[0] : query.scope;
  const rawTrainerUserId = query.trainerUserId;
  const trainerUserId = Array.isArray(rawTrainerUserId)
    ? rawTrainerUserId[0]
    : rawTrainerUserId;
  const keys = Object.keys(query);
  if (actor.role === "TRAINER") {
    if (keys.some((key) => key !== "scope") || (scope !== undefined && scope !== "own")) {
      return fail(403, "FORBIDDEN", "Недостаточно прав");
    }
    if (!actor.id.trim()) return fail(403, "FORBIDDEN", "Недостаточно прав");
    return { ok: true, scope: { userId: actor.id, isElevated: false } };
  }

  if (keys.some((key) => key !== "scope" && key !== "trainerUserId")) {
    return fail(400, "BAD_QUERY", "Неверные параметры области статистики");
  }
  if (scope === "all" && trainerUserId === undefined) {
    return { ok: true, scope: { userId: actor.id, isElevated: true } };
  }
  if (scope === "trainer" && trainerUserId !== undefined) {
    // Validate before role lookup; never trim an invalid ID into another actor.
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(trainerUserId)) {
      return fail(400, "BAD_QUERY", "Неверный идентификатор тренера");
    }
    if (!(await isExistingTrainer(trainerUserId))) {
      return fail(404, "NOT_FOUND", "Тренер не найден");
    }
    return { ok: true, scope: { userId: trainerUserId, isElevated: false } };
  }
  return fail(400, "BAD_QUERY", "Укажите scope=all или scope=trainer с trainerUserId");
}
