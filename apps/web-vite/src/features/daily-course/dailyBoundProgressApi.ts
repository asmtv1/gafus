import { ApiError } from "../../shared/api/client";
import { getTodayDailyCourse, type DailyToday } from "./dailyCourseApi";

type Status = "NOT_STARTED" | "IN_PROGRESS" | "PAUSED" | "RESET" | "COMPLETED";
export type DailyAction = "start" | "pause" | "resume" | "reset" | "complete";
export type DailyBoundStep = {
  id: string; bundleStepId: string; stepIndex: number;
  title: string; type: string; status: Status;
  paused: boolean; remainingSec: number | null; durationSec: number;
  timerSnapshot: { remainingSecAtServerNow: number | null; expiresAt: string | null } | null;
};
export type DailyBoundDay = {
  scheduleId: string; mskDate: string; trainingDayId: string;
  bundleId: string; available: boolean; steps: DailyBoundStep[];
  serverNow: string | null; receivedAtMonotonicMs: number;
};
const object = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const id = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const validStatus = (v: unknown): v is Status =>
  ["NOT_STARTED", "IN_PROGRESS", "PAUSED", "RESET", "COMPLETED"].includes(String(v));
const duration = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const serverInstant = (v: unknown): v is string => typeof v === "string" &&
  Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;

/** The only countdown authority is the negotiated original Hono snapshot.
 * Relative server times eliminate user-device wall-clock skew. A paused
 * timer is a fixed persisted duration, not a live ticking interval.
 */
export function boundTimerSeconds(step: DailyBoundStep, day: DailyBoundDay,
  monotonicNowMs: number): number | null {
  // The original daily importer reserves durationSec for TRAINING only;
  // PRACTICE/THEORY/BREAK use estimatedDurationSec, which is not an active
  // timer. Never render their zero-second server snapshot as a countdown.
  if (step.type !== "TRAINING" || step.durationSec <= 0 ||
      step.status !== "IN_PROGRESS" || !step.timerSnapshot) return null;
  const value = step.timerSnapshot.remainingSecAtServerNow;
  if (value === null || !duration(value)) return null;
  if (step.paused || !step.timerSnapshot.expiresAt || !day.serverNow) return value;
  const differenceMs = Date.parse(step.timerSnapshot.expiresAt) - Date.parse(day.serverNow);
  if (!Number.isFinite(differenceMs)) return null;
  const elapsedMs = Math.max(0, monotonicNowMs - day.receivedAtMonotonicMs);
  return Math.max(0, Math.min(value, Math.ceil((differenceMs - elapsedMs) / 1000)));
}

/** Only a scoped, verified occurrence projection reaches the client cache.
 * Raw PDF, S3 URLs, exam answers and UserStep IDs never enter this DTO. */
export function projectDailyBoundDay(raw: unknown, today: DailyToday): DailyBoundDay {
  const d = object(raw);
  if (!today.day || !today.scheduleId || !d || d.scheduleId !== today.scheduleId ||
      d.mskDate !== today.mskDate || d.trainingDayId !== today.day.id ||
      d.bundleId !== today.day.id || !Array.isArray(d.steps) ||
      d.steps.length !== today.day.stepsCount || d.steps.length > 200)
    throw Error("INVALID_DAILY_BOUND_DAY");
  let available = d.onlineStepBinding === "BUNDLE_STEP_ID_V1";
  if (d.serverNow !== undefined && !serverInstant(d.serverNow))
    throw Error("INVALID_DAILY_SERVER_CLOCK");
  const serverNow = serverInstant(d.serverNow) ? d.serverNow : null;
  const receivedAtMonotonicMs = performance.now();
  const occurrences = new Set<string>();
  const steps = d.steps.map((rawStep: unknown, index): DailyBoundStep => {
    const row = object(rawStep), step = object(row?.step);
    if (!row || !step || !id(row.stepId) || step.id !== row.stepId ||
        row.stepIndex !== index || !validStatus(row.status) ||
        typeof row.isPausedOnServer !== "boolean" ||
        typeof step.title !== "string" || !step.title.trim() ||
        typeof step.type !== "string" ||
        !(step.durationSec === null || duration(step.durationSec)))
      throw Error("INVALID_DAILY_BOUND_STEP");
    if (!id(row.bundleStepId) || occurrences.has(row.bundleStepId)) available = false;
    else occurrences.add(row.bundleStepId);
    const remain = row.remainingSecOnServer ?? row.remainingSec;
    const remainingSec = remain === null || remain === undefined ? null :
      duration(remain) ? remain : null;
    const timer = object(row.timerSnapshot);
    let timerSnapshot: DailyBoundStep["timerSnapshot"] = null;
    if (row.timerSnapshot !== undefined) {
      if (!timer ||
          !(timer.remainingSecAtServerNow === null || duration(timer.remainingSecAtServerNow)) ||
          !(timer.expiresAt === null || serverInstant(timer.expiresAt)))
        throw Error("INVALID_DAILY_TIMER_SNAPSHOT");
      timerSnapshot = {
        remainingSecAtServerNow: timer.remainingSecAtServerNow as number | null,
        expiresAt: timer.expiresAt as string | null,
      };
    }
    return { id: row.stepId, bundleStepId: id(row.bundleStepId) ? row.bundleStepId : "",
      stepIndex: index, title: step.title, type: step.type,
      status: row.status, paused: row.isPausedOnServer,
      remainingSec, timerSnapshot,
      durationSec: duration(step.durationSec) ? step.durationSec : 0 };
  });
  return { scheduleId: today.scheduleId, mskDate: today.mskDate,
    trainingDayId: today.day.id, bundleId: today.day.id, available, steps,
    serverNow, receivedAtMonotonicMs };
}

async function jsonRequest<T>(url: string, method: "GET" | "POST", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, credentials: "include", cache: "no-store",
    headers: { Accept: "application/json", "X-Gafus-Auth-Transport": "cookie",
      "X-Gafus-Web-Daily-Binding": "1",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let envelope: Record<string, unknown>;
  try { envelope = await response.json() as Record<string, unknown>; }
  catch { throw new ApiError(response.status, "Некорректный ответ сервера", "INVALID_RESPONSE"); }
  if (!response.ok || envelope.success !== true) {
    throw new ApiError(response.status,
      typeof envelope.error === "string" ? envelope.error : "Запрос не выполнен",
      typeof envelope.code === "string" ? envelope.code : undefined);
  }
  return envelope.data as T;
}
export async function getDailyBoundDay(today: DailyToday): Promise<DailyBoundDay> {
  if (!today.scheduleId || !id(today.scheduleId) || !today.day)
    throw Error("INVALID_DAILY_REQUEST");
  const params = new URLSearchParams({ scheduleId: today.scheduleId, createIfMissing: "false" });
  const raw = await jsonRequest<unknown>("/api/v1/daily-course/day?" + params.toString(), "GET");
  return projectDailyBoundDay(raw, today);
}
export function dailyAvailableActions(s: DailyBoundStep): DailyAction[] {
  if (!s.bundleStepId || s.status === "COMPLETED" ||
      ["EXAMINATION", "SURVEY", "DIARY"].includes(s.type)) return [];
  if (s.status === "NOT_STARTED" || s.status === "RESET") return ["start", "complete"];
  if (s.status === "IN_PROGRESS") return s.paused
    ? ["resume", "complete", "reset"] : ["pause", "complete", "reset"];
  return [];
}
export function verifiedDailyAfter(action: DailyAction, before: DailyBoundStep,
  after: DailyBoundStep): boolean {
  if (before.bundleStepId !== after.bundleStepId || before.id !== after.id ||
      before.stepIndex !== after.stepIndex) return false;
  switch (action) {
    case "start": case "resume": return after.status === "IN_PROGRESS" && !after.paused;
    case "pause": return after.status === "IN_PROGRESS" && after.paused;
    case "complete": return after.status === "COMPLETED" && !after.paused;
    case "reset": return ["RESET", "NOT_STARTED"].includes(after.status) && !after.paused;
  }
}
/** Preflight is mandatory because Moscow's calendar day may change between
 * render and click. Exactly one POST, without retries, ever follows. */
export async function updateDailyBoundStep(today: DailyToday, snapshot: DailyBoundDay,
  step: DailyBoundStep, action: DailyAction,
  stillAuthorized: () => boolean = () => true): Promise<DailyBoundDay> {
  if (!snapshot.available || snapshot.scheduleId !== today.scheduleId ||
      snapshot.mskDate !== today.mskDate || !step.bundleStepId ||
      !dailyAvailableActions(step).includes(action) ||
      snapshot.steps[step.stepIndex]?.bundleStepId !== step.bundleStepId)
    throw Error("UNVERIFIED_DAILY_STEP");
  if (!stillAuthorized()) throw Error("DAILY_ACTOR_CHANGED");
  const actualToday = await getTodayDailyCourse();
  if (!stillAuthorized()) throw Error("DAILY_ACTOR_CHANGED");
  if (actualToday.mskDate !== today.mskDate ||
      actualToday.scheduleId !== today.scheduleId ||
      actualToday.day?.id !== today.day?.id) throw Error("DAILY_SCHEDULE_CHANGED");
  const fresh = await getDailyBoundDay(actualToday);
  if (!stillAuthorized()) throw Error("DAILY_ACTOR_CHANGED");
  const bound = fresh.steps[step.stepIndex];
  if (!fresh.available || !bound || bound.bundleStepId !== step.bundleStepId ||
      bound.id !== step.id || bound.status !== step.status ||
      bound.paused !== step.paused || !dailyAvailableActions(bound).includes(action))
    throw Error("DAILY_STEP_CHANGED");
  const payload = { scheduleId: fresh.scheduleId, stepIndex: bound.stepIndex,
    expectedBundleStepId: bound.bundleStepId, expectedStepId: bound.id,
    ...(action === "start" ? { durationSec: bound.durationSec, status: "IN_PROGRESS" } : {}),
    // Bound GET's serverNow snapshot already deducted wall-clock time from
    // persisted updatedAt. Legacy remainingSec is only the stored START base;
    // sending it on pause would resurrect elapsed seconds.
    ...(action === "pause" ? { timeLeftSec:
      bound.timerSnapshot?.remainingSecAtServerNow ?? bound.remainingSec ?? bound.durationSec,
    } : {}) };
  if (!stillAuthorized()) throw Error("DAILY_ACTOR_CHANGED");
  await jsonRequest<void>("/api/v1/daily-course/step/" + action, "POST", payload);
  // A POST could have committed just before a principal swap. Never issue
  // follow-up GETs with the next account's cookie or apply the old result.
  if (!stillAuthorized()) throw Error("DAILY_ACTOR_CHANGED");
  const checkToday = await getTodayDailyCourse();
  if (!stillAuthorized()) throw Error("DAILY_ACTOR_CHANGED");
  if (checkToday.mskDate !== today.mskDate ||
      checkToday.scheduleId !== today.scheduleId || checkToday.day?.id !== today.day?.id)
    throw Error("DAILY_ACK_DAY_CHANGED");
  const after = await getDailyBoundDay(checkToday);
  if (!stillAuthorized()) throw Error("DAILY_ACTOR_CHANGED");
  if (!after.available || !after.steps[bound.stepIndex] ||
      !verifiedDailyAfter(action, bound, after.steps[bound.stepIndex]))
    throw Error("DAILY_ACK_NOT_CONFIRMED");
  return after;
}
