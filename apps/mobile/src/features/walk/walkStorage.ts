import { readPersistedWalkJournal, writePersistedWalkJournal } from './walkGpsStorage';
import { reportClientError } from "@/shared/lib/tracer";
import { normalizeWalk, type DogWalk, type WalkTimerMode } from "./walkModel";

export interface WalkJournal {
  active: DogWalk | null;
  completed: DogWalk[];
  preference: { mode: WalkTimerMode; countdownMinutes: number };
}

export const emptyWalkJournal = (): WalkJournal => ({
  active: null,
  completed: [],
  preference: { mode: "stopwatch", countdownMinutes: 30 },
});
export async function loadWalkJournal(ownerId: string): Promise<WalkJournal> {
  const saved = await readPersistedWalkJournal(ownerId);
  if (!saved) return emptyWalkJournal();
  try {
    const data = JSON.parse(saved) as Partial<WalkJournal>;
    if (!Array.isArray(data.completed)) return emptyWalkJournal();
    const valid = (walk: unknown): walk is DogWalk => {
      if (typeof walk !== "object" || walk === null) return false;
      const row = walk as Partial<DogWalk>;
      return (
        typeof row.startedAtMs === "number" &&
        Number.isFinite(row.startedAtMs) &&
        (row.finishedAtMs === null ||
          (typeof row.finishedAtMs === "number" && Number.isFinite(row.finishedAtMs))) &&
        typeof row.steps === "number" &&
        Number.isFinite(row.steps) &&
        row.steps >= 0 &&
        typeof row.incompleteSteps === "boolean"
      );
    };
    let migrated = false;
    const withClientId = (walk: DogWalk): DogWalk => {
      if (walk.clientId && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(walk.clientId)) return walk;
      migrated = true;
      // Deterministic migration across concurrent loads, reboots and offline retries.
      // Per-owner uniqueness is enforced by the server's compound key.
      const suffix = Math.max(0, Math.floor(walk.startedAtMs))
        .toString(16)
        .padStart(12, "0")
        .slice(-12);
      return { ...walk, clientId: `00000000-0000-4000-8000-${suffix}` };
    };
    const journal: WalkJournal = {
      active:
        data.active && valid(data.active) && data.active.finishedAtMs === null
          ? withClientId(normalizeWalk(data.active))
          : null,
      completed: data.completed
        .filter(valid)
        .filter((walk) => walk.finishedAtMs !== null)
        .map(normalizeWalk)
        .map(withClientId)
        .slice(0, 2000),
      preference: {
        mode: data.preference?.mode === "countdown" ? "countdown" : "stopwatch",
        countdownMinutes:
          typeof data.preference?.countdownMinutes === "number" &&
          Number.isFinite(data.preference.countdownMinutes)
            ? Math.max(1, Math.min(240, Math.floor(data.preference.countdownMinutes)))
            : 30,
      },
    };
    if (migrated) await writePersistedWalkJournal(ownerId, JSON.stringify(journal));
    return journal;
  } catch (error) {
    reportClientError(error, { issueKey: "DogWalkStoredJournalParse" });
    return emptyWalkJournal();
  }
}

export async function saveWalkJournal(ownerId: string, journal: WalkJournal): Promise<void> {
  await writePersistedWalkJournal(ownerId, JSON.stringify(journal));
}
