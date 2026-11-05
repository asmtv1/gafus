import { apiClient } from "@/shared/lib/api/client";
import { useAuthStore } from "@/shared/stores/authStore";
import { reportClientError } from "@/shared/lib/tracer";
import { canUseDogWalkHistory } from "./walkAccess";
import { estimatedWalkMeters, normalizeWalk, walkDurationSeconds, type DogWalk } from "./walkModel";
import { loadWalkJournal, saveWalkJournal, type WalkJournal } from "./walkStorage";

export interface RemoteDogWalk {
  clientId: string;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  steps: number;
  estimatedMeters: number;
  timerMode: "stopwatch" | "countdown";
  incompleteSteps: boolean;
}

export function toRemoteWalk(walk: DogWalk): RemoteDogWalk | null {
  if (!walk.clientId || walk.finishedAtMs === null) return null;
  const completed = normalizeWalk(walk);
  return {
    clientId: walk.clientId,
    startedAt: new Date(completed.startedAtMs).toISOString(),
    finishedAt: new Date(completed.finishedAtMs!).toISOString(),
    durationSeconds: walkDurationSeconds(completed, completed.finishedAtMs!),
    steps: Math.floor(completed.steps),
    estimatedMeters: estimatedWalkMeters(completed.steps),
    timerMode: completed.mode!,
    incompleteSteps: completed.incompleteSteps,
  };
}

export function fromRemoteWalk(remote: RemoteDogWalk): DogWalk {
  return {
    clientId: remote.clientId,
    startedAtMs: Date.parse(remote.startedAt),
    finishedAtMs: Date.parse(remote.finishedAt),
    steps: remote.steps,
    incompleteSteps: remote.incompleteSteps,
    mode: remote.timerMode,
    elapsedBeforePauseMs: remote.durationSeconds * 1000,
    runningSinceMs: null,
  };
}

/** All shared identifiers are overridden by the phone; server-only records survive. */
export function mergeWalkHistory(local: DogWalk[], remote: RemoteDogWalk[]): DogWalk[] {
  const merged = new Map<string, DogWalk>();
  for (const row of remote) {
    if (
      row.clientId &&
      Number.isFinite(Date.parse(row.startedAt)) &&
      Number.isFinite(Date.parse(row.finishedAt))
    ) {
      merged.set(row.clientId, fromRemoteWalk(row));
    }
  }
  for (const row of local) {
    if (row.finishedAtMs !== null && row.clientId) merged.set(row.clientId, row);
  }
  return [...merged.values()].sort((a, b) => b.startedAtMs - a.startedAtMs).slice(0, 2000);
}

const inFlight = new Map<string, Promise<WalkJournal>>();

/**
 * Phone-first: upload its complete local snapshot in idempotent batches, then
 * merge server-only records. No retry should write into another actor's journal.
 */
export async function syncDogWalkHistory(ownerId: string): Promise<WalkJournal> {
  const existing = inFlight.get(ownerId);
  if (existing) return existing;
  const task = doSync(ownerId);
  inFlight.set(ownerId, task);
  try {
    return await task;
  } finally {
    if (inFlight.get(ownerId) === task) inFlight.delete(ownerId);
  }
}

async function doSync(ownerId: string): Promise<WalkJournal> {
  const state = useAuthStore.getState();
  const capturedEpoch = state.verifiedSessionEpoch;
  const eligible =
    state.isAuthenticated &&
    !state.isLoading &&
    state.user?.id === ownerId &&
    Boolean(capturedEpoch) &&
    canUseDogWalkHistory(state.user);
  if (!eligible) throw new Error("WALK_SYNC_NOT_AUTHORIZED");
  const current = () => {
    const s = useAuthStore.getState();
    return (
      s.isAuthenticated &&
      !s.isLoading &&
      s.user?.id === ownerId &&
      s.verifiedSessionEpoch === capturedEpoch &&
      canUseDogWalkHistory(s.user)
    );
  };
  const request = async (path: string, options: { method?: "GET" | "PUT"; body?: unknown }) => {
    const response = await apiClient<RemoteDogWalk[]>(`/api/v1/walks${path}`, {
      ...options,
      requestGuard: () => current(),
      skipAuthRefreshReplay: true,
      suppressSubscriptionPaywall: true,
    });
    if (!response.success || !response.data)
      throw new Error(response.code ?? response.error ?? "WALK_SYNC_UNAVAILABLE");
    return response.data;
  };
  const initial = await loadWalkJournal(ownerId);
  const localSnapshot = initial.completed
    .map(toRemoteWalk)
    .filter((walk): walk is RemoteDogWalk => walk !== null);
  let server: RemoteDogWalk[] = [];
  if (localSnapshot.length === 0) {
    server = await request("", { method: "GET" });
  } else {
    // Each batch is capped by the server; local rows always have final authority.
    for (let i = 0; i < localSnapshot.length; i += 100) {
      server = await request("/sync", {
        method: "PUT",
        body: { walks: localSnapshot.slice(i, i + 100) },
      });
      if (!current()) throw new Error("WALK_SYNC_ACTOR_CHANGED");
    }
  }
  if (!current()) throw new Error("WALK_SYNC_ACTOR_CHANGED");
  // Re-read after network awaits: a walk may have finished while syncing.
  const latest = await loadWalkJournal(ownerId);
  if (!current()) throw new Error("WALK_SYNC_ACTOR_CHANGED");
  const initiallyUploaded = new Set(localSnapshot.map((walk) => walk.clientId));
  const newRows = latest.completed
    .map(toRemoteWalk)
    .filter(
      (walk): walk is RemoteDogWalk => walk !== null && !initiallyUploaded.has(walk.clientId),
    );
  for (let i = 0; i < newRows.length; i += 100) {
    server = await request("/sync", { method: "PUT", body: { walks: newRows.slice(i, i + 100) } });
    if (!current()) throw new Error("WALK_SYNC_ACTOR_CHANGED");
  }
  const merged = { ...latest, completed: mergeWalkHistory(latest.completed, server) };
  await saveWalkJournal(ownerId, merged);
  return merged;
}

export function reportWalkSyncIssue(error: unknown): void {
  reportClientError(error, { issueKey: "DogWalkServerSync" });
}
