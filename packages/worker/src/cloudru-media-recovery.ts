/**
 * Demand-driven recovery for missed BullMQ wake-ups and expired media leases.
 * Runs once per minute but NEVER starts Cloud.ru Jobs without due durable work.
 * Bounded batches + local in-flight reservations protect against paying twice
 * while an accepted Cloud.ru execution waits to claim its work in Core.
 */
import { inspectCoreDueMediaWork } from "@gafus/core/services/systemHealth";
import { listPendingQuestionCloudWorkKeys } from "@gafus/cdn-upload";
import { createCloudruFeedPoolDispatcher, createCloudruMediaDispatcher } from "./cloudru-media-dispatcher";
import { createFeedPhotoDemandDispatcher } from "./feed-photo-demand";
import { createGalleryDemandDispatcher } from "./gallery-demand";

export type RecoveryKind = "gallery" | "feed-photo" | "feed-video" | "questions";
export interface RecoverySnapshot { dueIds: string[]; active: number }
type Inspect = (kind: RecoveryKind) => Promise<RecoverySnapshot>;
type Recover = () => Promise<{ dispatched?: number; disabled?: boolean; skipped?: boolean }>;
const KINDS: readonly RecoveryKind[] = ["gallery", "feed-photo", "feed-video", "questions"];
const MAX_PER_KIND_TICK = 4;
const MAX_TOTAL_TICK = 8;
const MAX_HTTP_IN_FLIGHT = 2;
const MAX_POLL_ROUNDS = 8;
const POLL_INTERVAL_MS = 4000;
const ACCEPTED_CLAIM_GRACE_MS = 180_000;
const CAPACITY: Record<RecoveryKind, number> = {
  gallery: 1, "feed-photo": 2, "feed-video": 2, questions: 1,
};

export function enabledRecoveryKind(kind: RecoveryKind, env: NodeJS.ProcessEnv): boolean {
  if (env.CLOUDRU_MEDIA_JOBS_ENABLED !== "true") return false;
  switch (kind) {
    case "gallery": return env.GALLERY_PROCESSOR_READY === "true";
    case "feed-photo":
    case "feed-video": return env.FEED_PROCESSOR_READY === "true";
    case "questions":
      return env.QUESTIONS_PROCESSOR_READY === "true" &&
        env.QUESTIONS_CLOUD_JOB_ENABLED === "true" &&
        env.QUESTIONS_PUBLIC_S3_ENABLED === "true";
  }
}

/** Core owns all durable DB inspection; private S3 Question markers stay in
 * the storage adapter. Failure propagates and never means an empty queue. */
export async function inspectDueCloudruWork(kind: RecoveryKind): Promise<RecoverySnapshot> {
  if (kind === "questions") {
    const keys = await listPendingQuestionCloudWorkKeys();
    return { dueIds: keys, active: 0 };
  }
  return inspectCoreDueMediaWork(kind);
}

/** Compatibility for callers requiring only a boolean. */
export async function hasDueCloudruWork(kind: RecoveryKind): Promise<boolean> {
  return (await inspectDueCloudruWork(kind)).dueIds.length > 0;
}

/** Reserves at most two simultaneous HTTP :execute requests across all kinds.
 * A reservation is made BEFORE awaiting an asynchronous dispatch, so overlapping
 * successes/failures never exceed the configured budgets.
 */
function createExecutionGate(limit = MAX_HTTP_IN_FLIGHT) {
  let available = limit;
  const pending: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (available > 0) available--;
    else await new Promise<void>(resolve => pending.push(resolve));
    try { return await fn(); }
    finally {
      const next = pending.shift();
      if (next) next();
      else available++;
    }
  };
}

export function createCloudruMediaRecovery({
  env = process.env,
  inspect = inspectDueCloudruWork,
  now = () => Date.now(),
  pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
  dispatch,
  report = (_kind: RecoveryKind, _stage: "check" | "execute") => {},
}: {
  env?: NodeJS.ProcessEnv;
  inspect?: Inspect;
  now?: () => number;
  pause?: (ms: number) => Promise<void>;
  dispatch?: (kind: RecoveryKind) => Promise<{ dispatched?: number; disabled?: boolean; skipped?: boolean }>;
  report?: (kind: RecoveryKind, stage: "check" | "execute") => void;
} = {}) {
  const failures = new Map<RecoveryKind, number>();
  const nextAt = new Map<RecoveryKind, number>();
  const reservations = new Map<RecoveryKind, Map<string, number>>();
  const lazy = new Map<RecoveryKind, Recover>();
  let feedPhotoDemand: ReturnType<typeof createFeedPhotoDemandDispatcher> | undefined;
  let galleryDemand: ReturnType<typeof createGalleryDemandDispatcher> | undefined;
  const withExecutionSlot = createExecutionGate();
  let running = false;
  let availableThisTick = MAX_TOTAL_TICK;
  const runKind = async (kind: RecoveryKind): Promise<number> => {
    if (!enabledRecoveryKind(kind, env)) return 0;
    // Gallery immediate and minute recovery share one distributed admission.
    if (kind === "gallery" && !dispatch) {
      try {
        galleryDemand ??= createGalleryDemandDispatcher({env});
        return (await galleryDemand()).dispatched;
      } catch {
        report(kind, "execute");
        return 0;
      }
    }
    // Immediate and periodic recovery use the same distributed photo admission.
    if (kind === "feed-photo" && !dispatch) {
      try {
        feedPhotoDemand ??= createFeedPhotoDemandDispatcher({env});
        return (await feedPhotoDemand()).dispatched;
      } catch {
        report(kind, "execute");
        return 0;
      }
    }
    let accepted = 0;
    const ghost = reservations.get(kind) ?? new Map<string, number>();
    reservations.set(kind, ghost);
    const fail = (stage: "check" | "execute") => {
      const n = Math.min(6, (failures.get(kind) ?? 0) + 1);
      failures.set(kind, n);
      nextAt.set(kind, now() + Math.min(3_600_000, 60_000 * 2 ** (n - 1)));
      // Do not log DB IDs, private S3 keys, request data or provider errors.
      report(kind, stage);
    };
    for (let round = 0; round < MAX_POLL_ROUNDS; round++) {
      let snapshot: RecoverySnapshot;
      try { snapshot = await inspect(kind); }
      catch {
        fail("check");
        break; // Never interpret a failed DB/S3 read as an empty queue.
      }
      const ids = new Set(snapshot.dueIds);
      // Once a job is claimed, its durable lease (active) becomes authoritative.
      // A rejected/expired no-claim launch becomes retryable only after grace.
      for (const [id, acceptedAt] of ghost) {
        if (!ids.has(id) || now() - acceptedAt >= ACCEPTED_CLAIM_GRACE_MS)
          ghost.delete(id);
      }
      if (!ids.size) {
        failures.delete(kind);
        nextAt.delete(kind);
        ghost.clear();
        break; // Stop immediately: never launch a container for an empty queue.
      }
      if (now() < (nextAt.get(kind) ?? 0)) break;
      const free = Math.max(0, CAPACITY[kind] - snapshot.active - ghost.size);
      const freshIds = snapshot.dueIds.filter(id => !ghost.has(id));
      const permits = Math.min(
        free, freshIds.length, MAX_PER_KIND_TICK - accepted, availableThisTick,
      );
      if (permits > 0) {
        const selected = freshIds.slice(0, permits);
        for (const id of selected) ghost.set(id, now());
        availableThisTick -= selected.length;
        const execute = (() => {
          if (dispatch) return () => dispatch(kind);
          let cached = lazy.get(kind);
          if (!cached) {
            cached = kind === "feed-photo" || kind === "feed-video"
              ? createCloudruFeedPoolDispatcher(kind === "feed-photo" ? "photo" : "video", env)
              : createCloudruMediaDispatcher(env, fetch,
                [kind === "gallery" ? "gafus-gallery-process" : "gafus-questions-photo"]);
            lazy.set(kind, cached);
          }
          return cached;
        })();
        const result = await Promise.allSettled(selected.map(() => withExecutionSlot(execute)));
        let rejected = false;
        for (let i = 0; i < result.length; i++) {
          const attempt = result[i]!;
          if (attempt.status === "fulfilled" && attempt.value.dispatched === 1) {
            accepted++;
          } else {
            ghost.delete(selected[i]!);
            rejected = true;
          }
        }
        if (rejected) {
          fail("execute");
          break; // Other independent media queues continue.
        }
      }
      if (accepted >= MAX_PER_KIND_TICK || availableThisTick <= 0) break;
      // Do not spin on still-unclaimed data: wait for a lease/ack and re-read.
      // A quick worker completion immediately frees a slot for another batch.
      if (round + 1 < MAX_POLL_ROUNDS) await pause(POLL_INTERVAL_MS);
    }
    return accepted;
  };
  return async () => {
    if (env.CLOUDRU_MEDIA_JOBS_ENABLED !== "true")
      return { disabled: true, dispatched: 0 };
    if (running) return { skipped: true, dispatched: 0 };
    running = true;
    availableThisTick = MAX_TOTAL_TICK;
    try {
      const counts = await Promise.all(KINDS.map(runKind));
      return { dispatched: counts.reduce((sum, count) => sum + count, 0) };
    } finally { running = false; }
  };
}
