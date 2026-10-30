import { ApiError, apiRequest } from "../../shared/api/client";
import type { TrainingDaySummary } from "./trainingDaysApi";

const goodId = (s: unknown): s is string =>
  typeof s === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(s);
const statuses = ["NOT_STARTED", "IN_PROGRESS", "PAUSED", "RESET", "COMPLETED"] as const;
type StepStatus = (typeof statuses)[number];
const types = ["TRAINING", "PRACTICE", "THEORY", "BREAK", "EXAMINATION", "DIARY", "SURVEY"] as const;
type StepType = (typeof types)[number];
const isStatus = (value: unknown): value is StepStatus =>
  statuses.some(status => status === value);
const isType = (value: unknown): value is StepType =>
  types.some(type => type === value);

export type BoundProgressStep = {
  id: string;
  stepOnDayId: string | null;
  title: string;
  type: StepType;
  status: StepStatus;
  locked: boolean;
  durationSec: number;
  remainingSec: number | null;
  paused: boolean;
  index: number;
  /** Validated owner-scoped server clock; never a reason to bypass the
   * occurrence-binding and preflight GET before POST. */
  timerSnapshot?: {
    remainingSecAtServerNow: number | null;
    expiresAt: string | null;
  };
};
export type BoundProgressDay = {
  available: boolean;
  courseId: string;
  trainingDayId: string;
  dayOnCourseId: string;
  steps: BoundProgressStep[];
  serverNow?: string;
};

/** Dedicated minimal projection. No description, signed media, unlocked paid
 * metadata, UserStep DB IDs or monetization payload may enter its Query cache. */
export function projectBoundProgressDay(raw: unknown, expected: Pick<
  TrainingDaySummary, "trainingDayId" | "dayOnCourseId" | "courseId"
>): BoundProgressDay {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw Error("INVALID_BOUND_DAY");
  const row = raw as Record<string, unknown>;
  if (row.courseId !== expected.courseId ||
      row.dayOnCourseId !== expected.dayOnCourseId ||
      // The /days trainingDayId is DayOnCourse.id; the /day ID is Day.id.
      // The owner-safe binding is courseId + dayOnCourseId + each explicit
      // StepOnDay occurrence, never an inferred positional/template match.
      !goodId(row.trainingDayId) ||
      !Array.isArray(row.steps) || row.steps.length > 200)
    throw Error("MISMATCHED_BOUND_DAY");
  const binding = row.onlineStepBinding === "STEP_ON_DAY_ID_V1";
  const validServerNow = typeof row.serverNow === "string" &&
    !Number.isNaN(Date.parse(row.serverNow)) ?
      row.serverNow : undefined;
  if (row.serverNow !== undefined && !validServerNow)
    throw Error("INVALID_BOUND_SERVER_TIME");
  const ids = new Set<string>();
  const occurrenceIds = new Set<string>();
  let unavailable = !binding;
  const steps = row.steps.map((item: unknown, index): BoundProgressStep => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw Error("INVALID_BOUND_STEP");
    const step = item as Record<string, unknown>;
    if (!goodId(step.id) || typeof step.title !== "string" ||
        step.title.trim().length === 0 || !isStatus(step.status) ||
        !isType(step.type) || typeof step.locked !== "boolean" ||
        !Number.isSafeInteger(step.durationSec) || Number(step.durationSec) < 0 ||
        !Number.isSafeInteger(step.order) || Number(step.order) < 0)
      throw Error("INVALID_BOUND_STEP");
    if (binding && !step.locked && typeof step.isPausedOnServer !== "boolean")
      unavailable = true;
    const occurrenceId = goodId(step.stepOnDayId) ? step.stepOnDayId : null;
    if (!step.locked) {
      if (!occurrenceId || occurrenceIds.has(occurrenceId)) unavailable = true;
      else occurrenceIds.add(occurrenceId);
    }
    // If producer did not advertise binding, legacy projection can safely
    // render duplicate steps but MUST NEVER infer occurrences from indices.
    if (!binding && ids.has(step.id)) unavailable = true;
    ids.add(step.id);
    const remaining = step.remainingSecOnServer;
    const remainingSec = Number.isSafeInteger(remaining) && Number(remaining) >= 0
      ? Number(remaining) : null;
    const timer = step.timerSnapshot as Record<string, unknown> | undefined;
    let timerSnapshot: BoundProgressStep["timerSnapshot"] = undefined;
    if (timer !== undefined) {
      if (!timer || typeof timer !== "object" || Array.isArray(timer) ||
          !validServerNow ||
          !(timer.remainingSecAtServerNow === null ||
            Number.isSafeInteger(timer.remainingSecAtServerNow) &&
            Number(timer.remainingSecAtServerNow) >= 0) ||
          !(timer.expiresAt === null ||
            typeof timer.expiresAt === "string" &&
            !Number.isNaN(Date.parse(timer.expiresAt))))
        throw Error("INVALID_BOUND_TIMER_SNAPSHOT");
      timerSnapshot = {
        remainingSecAtServerNow: timer.remainingSecAtServerNow as number | null,
        expiresAt: timer.expiresAt as string | null,
      };
      if (timerSnapshot.expiresAt && (step.status !== "IN_PROGRESS" ||
            step.isPausedOnServer !== false ||
            timerSnapshot.remainingSecAtServerNow === null))
        throw Error("CONFLICTING_BOUND_TIMER_SNAPSHOT");
    }
    return {
      id: step.id, stepOnDayId: step.locked ? null : occurrenceId,
      title: step.title, status: step.status, type: step.type,
      locked: step.locked, durationSec: step.durationSec as number,
      remainingSec, paused: step.isPausedOnServer === true, index,
      ...(timerSnapshot ? { timerSnapshot } : {}),
    };
  });
  return {
    courseId: expected.courseId, trainingDayId: row.trainingDayId as string,
    dayOnCourseId: expected.dayOnCourseId, available: !unavailable,
    ...(validServerNow ? { serverNow: validServerNow } : {}),
    steps,
  };
}

export async function getBoundProgressDay(
  courseType: string, day: Pick<TrainingDaySummary,
    "courseId" | "dayOnCourseId" | "trainingDayId" | "isLocked">,
  signal?: AbortSignal,
): Promise<BoundProgressDay> {
  if (!goodId(courseType) || !goodId(day.courseId) ||
      !goodId(day.dayOnCourseId) || !goodId(day.trainingDayId) || day.isLocked)
    throw Error("INVALID_BOUND_DAY_REQUEST");
  const params = new URLSearchParams({
    courseType, dayOnCourseId: day.dayOnCourseId, createIfMissing: "false",
  });
  const response = await fetch("/api/v1/training/day?" + params.toString(), {
    method: "GET", cache: "no-store", credentials: "include", signal,
    headers: { Accept: "application/json", "X-Gafus-Auth-Transport": "cookie",
      "X-Gafus-Web-Step-Binding": "1" },
  });
  let envelope: { success?: boolean; data?: unknown; error?: string; code?: string };
  try { envelope = await response.json() as typeof envelope; }
  catch { throw new ApiError(response.status, "Некорректный ответ API", "INVALID_RESPONSE"); }
  if (!response.ok || envelope?.success !== true)
    throw new ApiError(response.status, envelope?.error ?? "Ошибка чтения шага", envelope?.code);
  return projectBoundProgressDay(envelope.data, day);
}

export type ProgressOperation = "start" | "pause" | "resume" | "reset" |
  "complete/practice" | "complete/theory" | "complete/timer";

export function effectiveStepState(step: Pick<BoundProgressStep, "status" | "paused">): StepStatus {
  // Core UserStep.pause stores paused=true, while status stays IN_PROGRESS.
  return step.status === "IN_PROGRESS" && step.paused ? "PAUSED" : step.status;
}

export function actionForStep(step: BoundProgressStep): ProgressOperation[] {
  if (step.locked || !step.stepOnDayId) return [];
  // Original Next StepTimerCard always permits reset after completion.
  // Other step types cannot be generically reset from this panel.
  if (step.status === "COMPLETED") return ["TRAINING", "BREAK"].includes(step.type)
    ? ["reset"] : [];
  const state = effectiveStepState(step);
  // Exams, surveys and diary have independent business flows, not generic
  // completion; this UI must not mark them complete without their evidence.
  if (["EXAMINATION", "DIARY", "SURVEY"].includes(step.type)) return [];
  if (step.type === "THEORY")
    return state === "NOT_STARTED" || state === "RESET" ||
      state === "IN_PROGRESS" || state === "PAUSED"
      ? ["complete/theory"] : [];
  // Next StepPracticeBlock has no timer: the only permitted action is
  // explicit "Я выполнил", never start/pause/resume/reset timer controls.
  if (step.type === "PRACTICE") return ["complete/practice"];
  if (state === "NOT_STARTED" || state === "RESET") return ["start"];
  // TRAINING and BREAK finish on timer expiry, never through a visible
  // manual completion button (StepTimerCard only has play/pause/reset).
  if (state === "IN_PROGRESS") return ["pause", "reset"];
  if (state === "PAUSED") return ["resume", "reset"];
  return [];
}

/** Only a validated occurrence-specific snapshot can authorize a mutation.
 * Never retry this POST automatically (notification/timer side effects). */
export async function writeBoundStep(
  day: BoundProgressDay, step: BoundProgressStep, operation: ProgressOperation,
  timeLeftOverride?: number,
): Promise<void> {
  if (!day.available || !step.stepOnDayId ||
      day.steps[step.index]?.stepOnDayId !== step.stepOnDayId ||
      !(operation === "complete/timer"
        ? ["TRAINING", "BREAK"].includes(step.type) &&
          step.status === "IN_PROGRESS" && !step.paused &&
          timeLeftOverride === 0 &&
          (step.durationSec > 0 || step.remainingSec === 0)
        : actionForStep(step).includes(operation)))
    throw Error("UNVERIFIED_STEP_OCCURRENCE");
  if (operation === "pause" && timeLeftOverride !== undefined &&
    (!Number.isSafeInteger(timeLeftOverride) || timeLeftOverride < 0 ||
      timeLeftOverride > (step.remainingSec ?? step.durationSec)))
    throw Error("INVALID_REMAINING_STEP_TIME");
  const extra = operation === "start"
    ? { status: "IN_PROGRESS", durationSec: step.durationSec }
    : operation === "pause"
      ? { timeLeftSec: timeLeftOverride ?? step.remainingSec ?? step.durationSec }
      : {};
  // Timed completion uses the existing transactional Core complete
  // operation; do not invent a new endpoint or bypass occurrence guards.
  const endpoint = operation === "complete/timer" ? "complete/practice" : operation;
  await apiRequest<void>("/api/v1/training/step/" + endpoint, {
    method: "POST", browserAuth: true, expectedStatus: 200,
    json: { courseId: day.courseId, dayOnCourseId: day.dayOnCourseId,
      stepIndex: step.index, expectedStepOnDayId: step.stepOnDayId,
      expectedStepId: step.id, ...extra },
  });
}

export function isExpectedStepState(
  previous: Pick<BoundProgressStep, "status" | "paused">,
  next: Pick<BoundProgressStep, "status" | "paused">,
  action: ProgressOperation,
): boolean {
  const state = effectiveStepState(next);
  switch (action) {
    case "start": case "resume": return state === "IN_PROGRESS" && !next.paused;
    case "pause": return state === "PAUSED" && next.paused;
    case "reset": return (state === "RESET" || state === "NOT_STARTED") && !next.paused;
    case "complete/practice": case "complete/theory": case "complete/timer":
      return state === "COMPLETED" && !next.paused;
    default: return state !== effectiveStepState(previous);
  }
}
