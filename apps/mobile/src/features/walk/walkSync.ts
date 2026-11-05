import { apiClient } from "@/shared/lib/api/client";
import { useAuthStore } from "@/shared/stores/authStore";
import { reportClientError } from "@/shared/lib/tracer";
import { canUseDogWalkHistory } from "./walkAccess";
import { estimatedWalkMeters, normalizeWalk, walkDurationSeconds, type DogWalk } from "./walkModel";
import { loadWalkJournal, saveWalkJournal, type WalkJournal } from "./walkStorage";
import {
  getGpsSyncCursor, markGpsSynced, readGpsPoints,
  getGpsDeletedWalks, markGpsWalkDeleted, confirmGpsWalkDeleted,
} from './walkGpsStorage';

export interface RemoteDogWalk {
  clientId: string;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  steps: number;
  estimatedMeters: number;
  timerMode: "stopwatch" | "countdown";
  incompleteSteps: boolean;
  gpsEnabled?: boolean;
  gpsMeters?: number | null;
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
    estimatedMeters: completed.gpsMeters == null ? estimatedWalkMeters(completed.steps) : Math.round(completed.gpsMeters),
    gpsEnabled: completed.gpsEnabled ?? false,
    gpsMeters: completed.gpsMeters ?? null,
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
    gpsEnabled: remote.gpsEnabled,
    gpsMeters: remote.gpsMeters,
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
  const initialDeleted = await getGpsDeletedWalks(ownerId);
  const locallyDeleted=new Set(initialDeleted.map(row=>row.walkId));
  // DELETE is idempotent; send tombstones before any new walk upserts.
  for(const deletion of initialDeleted.filter(row=>row.pending)) {
    const response=await apiClient<{deleted:boolean}>(`/api/v1/walks/${deletion.walkId}`,{
      method:'DELETE',requestGuard:()=>current(),skipAuthRefreshReplay:true,
      suppressSubscriptionPaywall:true,
    });
    if(!response.success && response.code!=='NOT_FOUND') throw new Error(response.code??'WALK_DELETE_SYNC_FAILED');
    if(!current()) throw new Error('WALK_SYNC_ACTOR_CHANGED');
    await confirmGpsWalkDeleted(ownerId,deletion.walkId);
  }
  const initial = await loadWalkJournal(ownerId);
  const localSnapshot = initial.completed.filter(walk=>!walk.clientId || !locallyDeleted.has(walk.clientId))
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
    .filter(walk=>!walk.clientId || !locallyDeleted.has(walk.clientId))
    .map(toRemoteWalk)
    .filter(
      (walk): walk is RemoteDogWalk => walk !== null && !initiallyUploaded.has(walk.clientId),
    );
  for (let i = 0; i < newRows.length; i += 100) {
    server = await request("/sync", { method: "PUT", body: { walks: newRows.slice(i, i + 100) } });
    if (!current()) throw new Error("WALK_SYNC_ACTOR_CHANGED");
  }
  const deletedResponse=await apiClient<string[]>('/api/v1/walks/deleted',{
    method:'GET',requestGuard:()=>current(),skipAuthRefreshReplay:true,suppressSubscriptionPaywall:true,
  });
  if(!deletedResponse.success || !Array.isArray(deletedResponse.data)) {
    throw new Error(deletedResponse.code??'WALK_DELETION_STATE_UNAVAILABLE');
  }
  if(!current()) throw new Error('WALK_SYNC_ACTOR_CHANGED');
  const deletedIds=new Set([...locallyDeleted,...deletedResponse.data]);
  for(const id of deletedResponse.data) {
    if(!locallyDeleted.has(id)) await markGpsWalkDeleted(ownerId,id,false);
  }
  // The walk row is committed before uploading its route; sequence numbers make retries safe.
  for (const walk of [...localSnapshot,...newRows]) {
    if (!walk.gpsEnabled || deletedIds.has(walk.clientId)) continue;
    let cursor = await getGpsSyncCursor(ownerId,walk.clientId);
    while (true) {
      const batch=await readGpsPoints(ownerId,walk.clientId,cursor,150);
      if (!batch.length) break;
      if (!current()) throw new Error('WALK_SYNC_ACTOR_CHANGED');
      // Invalid GPS payloads remain in SQLite for diagnostics, but cannot block
      // sync of all subsequent valid fixes or be drawn on the map.
      const safe=batch.filter(p=>Number.isFinite(p.latitude) && Math.abs(p.latitude)<=90 &&
        Number.isFinite(p.longitude) && Math.abs(p.longitude)<=180 &&
        Number.isFinite(p.timestamp) && p.timestamp>=Date.UTC(2020,0,1) &&
        p.timestamp<Date.now()+86_400_000 &&
        (p.accuracy==null || (Number.isFinite(p.accuracy) && p.accuracy>=0 && p.accuracy<=100000)) &&
        (p.speed==null || (Number.isFinite(p.speed) && p.speed>=-1 && p.speed<=200)));
      if(safe.length) {
        const payload={points:safe.map(p=>({
          seq:p.seq,segment:p.segment,latitude:p.latitude,longitude:p.longitude,
          timestamp:new Date(p.timestamp).toISOString(),accuracy:p.accuracy,speed:p.speed,
          accepted:p.accepted,reason:p.reason,deltaMeters:p.deltaMeters,
        }))};
        const response=await apiClient<{accepted:number}>(`/api/v1/walks/${walk.clientId}/track`,{
          method:'PUT',body:payload,requestGuard:()=>current(),skipAuthRefreshReplay:true,
          suppressSubscriptionPaywall:true,
        });
        if(!response.success || !response.data) throw new Error(response.code??'WALK_TRACK_SYNC_FAILED');
        if(!current()) throw new Error('WALK_SYNC_ACTOR_CHANGED');
      }
      cursor=batch[batch.length-1]!.seq;
      await markGpsSynced(ownerId,walk.clientId,cursor);
    }
  }
  const merged = { ...latest, completed: mergeWalkHistory(
    latest.completed.filter(walk=>!walk.clientId || !deletedIds.has(walk.clientId)),
    server.filter(walk=>!deletedIds.has(walk.clientId)),
  ) };
  await saveWalkJournal(ownerId, merged);
  return merged;
}

export function reportWalkSyncIssue(error: unknown): void {
  reportClientError(error, { issueKey: "DogWalkServerSync" });
}
