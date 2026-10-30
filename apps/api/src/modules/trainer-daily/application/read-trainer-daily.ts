/** AG1-001/TR014: four approved daily-course READ projections with injected Core ports. */
import type {
  getDailyCourseBundles,
  getDailyCourseBundleStepCandidates,
  getDailyCourseScheduleRange,
  getDailyCourseCandidates,
} from "@gafus/core/services/dailyCourse";
import type {
  TrainerDailyBundleItem,
  TrainerDailyBundleStepCandidateItem,
  TrainerDailyScheduleItem,
  TrainerDailyCandidateItem,
} from "../../../../../../packages/types/src/data/trainer-read-contracts";

type BundlesReader = typeof getDailyCourseBundles;
type BundleStepCandidatesReader = typeof getDailyCourseBundleStepCandidates;
type ScheduleRangeReader = typeof getDailyCourseScheduleRange;
type CandidatesReader = typeof getDailyCourseCandidates;
type Actor = Parameters<BundlesReader>[0];
type Range = Parameters<ScheduleRangeReader>[1];

function badStoredData(): never {
  throw new Error("TR014_INVALID_CORE_BUNDLE");
}
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return badStoredData();
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, required = false): string {
  if (typeof value !== "string" || (required && !value)) return badStoredData();
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return badStoredData();
  return value;
}
/** Strict output whitelist exactly matching AG4 TR014 bundleSchema. */
function projectBundles(source: unknown, actorId: string, role: string): TrainerDailyBundleItem[] {
  if (!Array.isArray(source)) return badStoredData();
  return source.map((raw: unknown) => {
    const bundle = object(raw);
    const authorId = text(bundle.authorId, true);
    // Protect against unexpectedly wrong foreign Core storage projections.
    if (role === "TRAINER" && authorId !== actorId) return badStoredData();
    if (!Array.isArray(bundle.steps)) return badStoredData();
    const steps = bundle.steps.map((rawStep: unknown) => {
      const step = object(rawStep);
      return {
        id: text(step.id, true),
        title: text(step.title),
        type: text(step.type),
        order: integer(step.order),
      };
    });
    for (let i = 1; i < steps.length; i++) {
      if (steps[i - 1]!.order > steps[i]!.order) return badStoredData();
    }
    const count = integer(bundle.stepsCount);
    if (count < 0 || count !== steps.length) return badStoredData();
    return {
      id: text(bundle.id, true),
      title: text(bundle.title),
      type: text(bundle.type),
      stepsCount: count,
      authorId,
      authorUsername: text(bundle.authorUsername),
      equipment: text(bundle.equipment),
      description: text(bundle.description),
      steps,
    };
  });
}

function projectBundleStepCandidates(
  source: unknown, actorId: string, role: string,
): TrainerDailyBundleStepCandidateItem[] {
  if (!Array.isArray(source)) return badStoredData();
  return source.map((raw: unknown) => {
    const step = object(raw);
    const authorId = text(step.authorId, true);
    if (role === "TRAINER" && authorId !== actorId) return badStoredData();
    const duration = step.durationSec;
    if (duration !== null && (
      typeof duration !== "number" || !Number.isSafeInteger(duration)
    )) return badStoredData();
    return {
      id: text(step.id, true),
      title: text(step.title),
      type: text(step.type, true),
      durationSec: duration as number | null,
      authorId,
      authorUsername: text(step.authorUsername),
    };
  });
}

function projectScheduleRange(
  source: unknown, from: string, to: string,
): TrainerDailyScheduleItem[] {
  if (!Array.isArray(source)) return badStoredData();
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const results = source.map((raw: unknown) => {
    const schedule = object(raw);
    const date = text(schedule.date, true);
    if (!datePattern.test(date) || date < from || date > to) return badStoredData();
    if (typeof schedule.isPublished !== "boolean") return badStoredData();
    const bundle = object(schedule.bundle);
    const createdBy = object(schedule.createdBy);
    const stepsCount = integer(bundle.stepsCount);
    if (stepsCount < 0) return badStoredData();
    return {
      id: text(schedule.id, true),
      date,
      isPublished: schedule.isPublished,
      bundle: {
        id: text(bundle.id, true),
        title: text(bundle.title),
        type: text(bundle.type),
        stepsCount,
      },
      createdBy: {
        id: text(createdBy.id, true),
        username: text(createdBy.username),
      },
    };
  });
  for (let i=1; i<results.length; i++) {
    if (results[i-1]!.date > results[i]!.date) return badStoredData();
  }
  return results;
}

function projectCalendarCandidates(
  source: unknown, actorId: string, role: string,
): TrainerDailyCandidateItem[] {
  if (!Array.isArray(source)) return badStoredData();
  return source.map((raw: unknown) => {
    const bundle = object(raw);
    const authorId = text(bundle.authorId, true);
    if (role === "TRAINER" && authorId !== actorId) return badStoredData();
    const stepsCount = integer(bundle.stepsCount);
    if (stepsCount < 2 || stepsCount > 5) return badStoredData();
    return {
      id: text(bundle.id, true),
      title: text(bundle.title),
      type: text(bundle.type, true),
      stepsCount,
      authorId,
      authorUsername: text(bundle.authorUsername),
    };
  });
}

export function createReadTrainerDailyApplication(dependencies: {
  readBundles: BundlesReader;
  readBundleStepCandidates: BundleStepCandidatesReader;
  readScheduleRange: ScheduleRangeReader;
  readCandidates: CandidatesReader;
}) {
  return {
    async bundles(actor: Actor): Promise<TrainerDailyBundleItem[]> {
      const result = await dependencies.readBundles(actor);
      return projectBundles(result, actor.id, actor.role);
    },
    async bundleStepCandidates(actor: Actor): Promise<TrainerDailyBundleStepCandidateItem[]> {
      const result = await dependencies.readBundleStepCandidates(actor);
      return projectBundleStepCandidates(result, actor.id, actor.role);
    },
    async scheduleRange(actor: Actor, range: Range): Promise<TrainerDailyScheduleItem[]> {
      const rows = await dependencies.readScheduleRange(actor, range);
      return projectScheduleRange(rows, range.from, range.to);
    },
    async candidates(actor: Actor): Promise<TrainerDailyCandidateItem[]> {
      const result = await dependencies.readCandidates(actor);
      return projectCalendarCandidates(result, actor.id, actor.role);
    },
  };
}
