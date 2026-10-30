/** Browser-lifetime continuation of a VERIFIED online timer after navigation.
 *
 * No Service Worker, no unauthenticated API and no timer-based optimistic
 * completion: expiry always re-reads the authenticated, exact StepOnDay
 * binding plus Core server clock before issuing a single non-retried POST.
 * Timers remain in sessionStorage so re-opening an app tab can reconcile an
 * expired training step. Browser-closed delivery needs server-side scheduling.
 */
import { getCurrentUser } from "../../shared/auth/authApi";
import { getBoundProgressDay, writeBoundStep } from "./trainingProgressConnectedApi";
import { acquireStepDayMutation, stepDayMutationKey } from "./trainingStepMutationLease";

type TimerRecord = {
  actor: string;
  courseType: string;
  courseId: string;
  dayOnCourseId: string;
  trainingDayId: string;
  stepId: string;
  stepOnDayId: string;
  stepIndex: number;
  expiresAt: string;
};
const storageKey = "gafus-refactor-active-bound-training-timers-v1";
const ids = /^[A-Za-z0-9_-]{1,128}$/;
const records = new Map<string, TimerRecord>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const inFlight = new Set<string>();
let bootedActor: string | null = null;

const recordKey = (record: Pick<TimerRecord,"actor" | "courseId" | "dayOnCourseId" | "stepOnDayId">) =>
  [record.actor,record.courseId,record.dayOnCourseId,record.stepOnDayId]
    .map(encodeURIComponent).join(":");

function valid(value: unknown): value is TimerRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return ["actor","courseType","courseId","dayOnCourseId","trainingDayId",
    "stepId","stepOnDayId"].every(k => ids.test(String(r[k] ?? ""))) &&
    typeof r.stepIndex === "number" && Number.isSafeInteger(r.stepIndex) &&
    r.stepIndex >= 0 && r.stepIndex < 200 &&
    typeof r.expiresAt === "string" && !Number.isNaN(Date.parse(r.expiresAt)) &&
    Date.parse(r.expiresAt) < Date.now() + 7 * 24 * 3600 * 1000;
}

function save() {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify([...records.values()].slice(0,20)));
  } catch { /* Session storage may be unavailable; in-memory timers still run. */ }
}
function clearTimeoutFor(key: string) {
  const timer = timers.get(key);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(key);
}
function forget(key: string) {
  clearTimeoutFor(key);
  records.delete(key);
  inFlight.delete(key);
  save();
}
function schedule(key: string, delay?: number) {
  const record = records.get(key);
  clearTimeoutFor(key);
  if (!record || bootedActor !== record.actor) return;
  const remaining = Math.max(0, Date.parse(record.expiresAt) - Date.now());
  timers.set(key, setTimeout(() => void reconcile(key),
    delay ?? Math.min(remaining, 2_147_000_000)));
}
async function reconcile(key: string) {
  const record = records.get(key);
  if (!record || bootedActor !== record.actor || inFlight.has(key)) return;
  inFlight.add(key);
  let attemptedPost = false;
  let acquired: (() => void) | null = null;
  try {
    const user = await getCurrentUser();
    if (!user || user.id !== record.actor || bootedActor !== record.actor) {
      forget(key);
      return;
    }
    acquired = acquireStepDayMutation(
      stepDayMutationKey(record.actor, record.courseId, record.dayOnCourseId));
    if (!acquired) {
      schedule(key, 1000);
      return;
    }
    const day = { courseId: record.courseId, trainingDayId: record.trainingDayId,
      dayOnCourseId: record.dayOnCourseId, isLocked: false };
    const bound = await getBoundProgressDay(record.courseType, day);
    const step = bound.steps[record.stepIndex];
    if (!bound.available || !step ||
        step.id !== record.stepId || step.stepOnDayId !== record.stepOnDayId ||
        !["TRAINING","BREAK"].includes(step.type) ||
        step.locked || step.status !== "IN_PROGRESS" || step.paused ||
        !step.timerSnapshot?.expiresAt) {
      forget(key);
      return;
    }
    if (step.timerSnapshot.remainingSecAtServerNow !== 0) {
      // A different device may have resumed or restarted the timer. The
      // *server* expiration replaces any stale local deadline.
      records.set(key, { ...record, expiresAt: step.timerSnapshot.expiresAt });
      save();
      schedule(key);
      return;
    }
    attemptedPost = true;
    await writeBoundStep(bound, step, "complete/timer", 0);
    const after = await getBoundProgressDay(record.courseType, day);
    const confirmed = after.available && after.steps[record.stepIndex]?.id === record.stepId &&
      after.steps[record.stepIndex]?.stepOnDayId === record.stepOnDayId &&
      after.steps[record.stepIndex]?.status === "COMPLETED";
    forget(key);
    if (confirmed) {
      window.dispatchEvent(new CustomEvent("gafus:training-step-timer-confirmed", {
        detail: { actor: record.actor, dayOnCourseId: record.dayOnCourseId },
      }));
    }
  } catch {
    // If POST was attempted an ambiguous ACK may already be committed.
    // NEVER replay it automatically. If only a safe GET failed, keep an
    // entry so the next foreground/online event can re-read before a write.
    if (attemptedPost) forget(key);
  } finally {
    acquired?.();
    inFlight.delete(key);
  }
}

export function registerBoundTrainingTimer(record: TimerRecord): void {
  if (!valid(record) || bootedActor !== record.actor) return;
  const key = recordKey(record);
  if (records.get(key)?.expiresAt === record.expiresAt) return;
  records.set(key, record);
  save();
  schedule(key);
}
export function cancelBoundTrainingTimer(record: Pick<TimerRecord,
  "actor" | "courseId" | "dayOnCourseId" | "stepOnDayId">): void {
  forget(recordKey(record));
}
/** Called from authenticated MainView; idempotent on route changes. */
export function bootstrapBoundTrainingTimers(actor: string): void {
  if (!ids.test(actor)) return;
  if (bootedActor === actor) return;
  for (const key of timers.keys()) clearTimeoutFor(key);
  records.clear();
  bootedActor = actor;
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]");
    if (Array.isArray(stored))
      for (const item of stored.slice(0,20)) if (valid(item) && item.actor === actor)
        records.set(recordKey(item), item);
  } catch { /* Discard corrupted/unavailable session storage. */ }
  save();
  for (const key of records.keys()) schedule(key);
  if (typeof window !== "undefined") {
    // Install at most once; handlers only re-read server-owned identities.
    if (!listenersInstalled) {
      window.addEventListener("online", reconcileDueTimers);
      document.addEventListener("visibilitychange", reconcileDueTimers);
      listenersInstalled = true;
    }
  }
}
let listenersInstalled = false;
function reconcileDueTimers() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  for (const [key, record] of records) {
    if (record.actor === bootedActor && Date.parse(record.expiresAt) <= Date.now() &&
        !inFlight.has(key)) schedule(key, 0);
  }
}
