/**
 * One wake-up per upload is a signal, NOT one paid Cloud.ru execution.
 * A Redis leader inspects the authoritative Feed database, starts at most
 * the free photo slots of two existing Cloud.ru Jobs, and coalesces bursts.
 * Recovery uses this exact same controller as the immediate BullMQ path.
 */
import { randomUUID } from "node:crypto";
import { inspectCoreDueMediaWork } from "@gafus/core/services/systemHealth";
import { connection, enqueueFeedPhotoFollowUp } from "@gafus/queues";
import {
  createCloudruMediaDispatcher, type CloudruMediaJobName,
} from "./cloudru-media-dispatcher";

const PHOTO_JOBS = ["gafus-feed-photo", "gafus-feed-photo-2"] as const;
const LOCK_KEY = "gafus:media:feed-photo:demand-lock:v1";
const QUIET_KEY = "gafus:media:feed-photo:demand-coalesce:v1";
const MAX_LAUNCHES_PER_PASS = 10;
const MAX_ELAPSED_MS = 30_000;

type Result = { dispatched: number; coalesced?: boolean; idle?: boolean; blocked?: boolean };
type State = { dueIds: string[]; active: number };
type Dispatch = () => Promise<{dispatched?: number; blocked?: boolean}>;

export function createFeedPhotoDemandDispatcher({
  env = process.env,
  inspect = () => inspectCoreDueMediaWork("feed-photo", new Date(), 0),
  now = () => Date.now(),
  locks = {
    acquire: async (token: string) =>
      (await connection.set(LOCK_KEY, token, "EX", 120, "NX")) === "OK",
    quiet: async () => (await connection.exists(QUIET_KEY)) !== 0,
    markQuiet: async () => { await connection.set(QUIET_KEY, "1", "EX", 2); },
    release: async (token: string) => {
      await connection.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
        1, LOCK_KEY, token,
      );
    },
  },
  providers,
  followUp = enqueueFeedPhotoFollowUp,
}: {
  env?: NodeJS.ProcessEnv;
  inspect?: () => Promise<State>;
  now?: () => number;
  locks?: {
    acquire: (token: string) => Promise<boolean>;
    quiet: () => Promise<boolean>;
    markQuiet: () => Promise<void>;
    release: (token: string) => Promise<void>;
  };
  providers?: Partial<Record<typeof PHOTO_JOBS[number], Dispatch>>;
  followUp?: (delayMs?: number) => Promise<void>;
} = {}) {
  // Provider execution listing may lag a successful :execute for a few
  // seconds. Expire reservations once it has had time to catch up.
  const reservations = new Map<CloudruMediaJobName, number[]>();
  const execute = Object.fromEntries(PHOTO_JOBS.map(name => [name,
    providers?.[name] ?? createCloudruMediaDispatcher(env, fetch, [name], {
      feedPhotoAdmission: true,
      reservedCount: job => {
        const live = (reservations.get(job) ?? [])
          .filter(stamp => now() - stamp < 20_000);
        reservations.set(job, live);
        return live.length;
      },
      onAccepted: job => reservations.set(job, [
        ...(reservations.get(job) ?? []), now(),
      ]),
    }),
  ])) as Record<typeof PHOTO_JOBS[number], Dispatch>;
  let next = 0;
  return async (): Promise<Result> => {
    if (env.CLOUDRU_MEDIA_JOBS_ENABLED !== "true" ||
        env.FEED_PROCESSOR_READY !== "true")
      return {dispatched: 0, blocked: true};
    if (await locks.quiet()) return {dispatched: 0, coalesced: true};
    const token = randomUUID();
    if (!(await locks.acquire(token))) return {dispatched: 0, coalesced: true};
    let started = false;
    try {
      if (await locks.quiet()) return {dispatched: 0, coalesced: true};
      const snapshot = await inspect();
      if (snapshot.dueIds.length === 0) return {dispatched: 0, idle: true};
      let remaining = Math.min(
        MAX_LAUNCHES_PER_PASS,
        snapshot.dueIds.length,
        Math.max(0, 10 - snapshot.active),
      );
      if (remaining === 0) return {dispatched: 0, blocked: true};
      const beganAt = now();
      let dispatched = 0;
      let consecutivelyBlocked = 0;
      let failed = 0;
      // Alternate providers; each has independent Cloud.ru 5-execution capacity.
      // A live read precedes EVERY :execute; local reservations bridge eventual
      // consistency while newly accepted executions appear in provider API.
      while (remaining > 0 && now() - beganAt < MAX_ELAPSED_MS) {
        const name = PHOTO_JOBS[next % PHOTO_JOBS.length]!;
        next++;
        try {
          const result = await execute[name]();
          if (result.dispatched === 1) {
            dispatched++;
            remaining--;
            consecutivelyBlocked = 0;
          } else {
            consecutivelyBlocked++;
          }
        } catch {
          failed++;
          consecutivelyBlocked++;
        }
        if (consecutivelyBlocked >= PHOTO_JOBS.length) break;
      }
      started = dispatched > 0;
      if (!started && failed >= PHOTO_JOBS.length)
        throw Error("FEED_PHOTO_CLOUDRU_UNAVAILABLE");
      if (started || snapshot.dueIds.length > dispatched) {
        // Always check once more after accepted launches: another upload can
        // arrive after our first Core snapshot while its wake is coalesced.
        // No new container starts if the durable queue is empty.
        await followUp(started ? 5000 : 10_000).catch(() => {});
      }
      return {dispatched, ...(started ? {} : {blocked: true})};
    } finally {
      // A late Redis write/release error must never transform a confirmed
      // Cloud.ru launch into a failing BullMQ job (which would retry/duplicate).
      try {
        if (started) await locks.markQuiet();
      } catch { /* lock expiry and the minute recovery remain safe */ }
      try {
        await locks.release(token);
      } catch { /* fenced Redis lease expires automatically */ }
    }
  };
}
