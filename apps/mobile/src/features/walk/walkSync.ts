import { apiClient } from "@/shared/lib/api/client";
import { useAuthStore } from "@/shared/stores/authStore";
import { reportClientError } from "@/shared/lib/error-reporting";
import { canUseDogWalkHistory } from "./walkAccess";
import { estimatedWalkMeters, normalizeWalk, walkDurationSeconds, type DogWalk } from "./walkModel";
import { loadWalkJournal, parseWalkJournal, type WalkJournal } from "./walkStorage";
import {
  getGpsSyncCursor, markGpsSynced, readGpsPoints, listPendingGpsWalks,
  readWalkSyncCheckpoint, commitWalkSyncPage,
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
    gpsMeters: completed.gpsMeters == null ? null : Math.round(completed.gpsMeters),
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

interface WalkChangePage {
  reset: boolean;
  walks: RemoteDogWalk[];
  deleted: string[];
  cursor: string;
  more: boolean;
}

function fingerprint(walk: RemoteDogWalk) {
  return JSON.stringify([walk.startedAt, walk.finishedAt, walk.durationSeconds, walk.steps,
    walk.estimatedMeters, walk.timerMode, walk.incompleteSteps, walk.gpsEnabled ?? false, walk.gpsMeters ?? null]);
}

const inFlight = new Map<string, Promise<WalkJournal>>();

/**
 * Synchronize dirty owner-scoped records and commit server pages with their cursor.
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
  const request = async <T>(path: string, options: { method: "GET" | "PUT"; body?: unknown }): Promise<T> => {
    const response = await apiClient<T>(`/api/v1/walks${path}`, {
      ...options, requestGuard: current, skipAuthRefreshReplay: true, suppressSubscriptionPaywall: true,
    });
    if (!current()) throw new Error("WALK_SYNC_ACTOR_CHANGED");
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
  let checkpoint = await readWalkSyncCheckpoint(ownerId);
  const initial = await loadWalkJournal(ownerId);
  const dirty = initial.completed.map(toRemoteWalk).filter((walk): walk is RemoteDogWalk =>
    walk !== null && !locallyDeleted.has(walk.clientId) && checkpoint.confirmed[walk.clientId] !== fingerprint(walk));
  const acknowledged = new Map<string, string>();
  for (let i = 0; i < dirty.length; i += 100) {
    const batch = dirty.slice(i, i + 100);
    const ack = await request<{ accepted: string[] } | RemoteDogWalk[]>("/sync?response=ack", {
      method: "PUT", body: { walks: batch },
    });
    // A legacy API returns the complete committed history on success.
    if (!Array.isArray(ack) && (!Array.isArray(ack.accepted) || ack.accepted.length !== batch.length ||
        batch.some((walk, index) => ack.accepted[index] !== walk.clientId))) throw new Error("WALK_SYNC_INVALID_ACK");
    batch.forEach(walk => acknowledged.set(walk.clientId, fingerprint(walk)));
  }

  let merged: WalkJournal;
  for (;;) {
    const previous = checkpoint;
    const after = previous.cursor === null ? "" : `&after=${previous.cursor}`;
    const response = await request<WalkChangePage | RemoteDogWalk[]>(`?view=changes${after}`, { method: "GET" });
    const legacy = Array.isArray(response);
    const page = legacy ? {
      walks: response, deleted: await request<string[]>("/deleted", { method: "GET" }), more: false, cursor: null, reset: true,
    } : response;
    if (!Array.isArray(page.walks) || !Array.isArray(page.deleted) ||
        !page.deleted.every(id => typeof id === "string") ||
        typeof page.more !== "boolean" || typeof page.reset !== "boolean" ||
        (!legacy && (typeof page.cursor !== "string" || !/^(0|[1-9]\d{0,18})$/.test(page.cursor) ||
          (!page.reset && previous.cursor !== null && (page.more
            ? BigInt(page.cursor) <= BigInt(previous.cursor) : BigInt(page.cursor) < BigInt(previous.cursor)))))) {
      throw new Error("WALK_SYNC_INVALID_PAGE");
    }
    for (const id of page.deleted) {
      if (!locallyDeleted.has(id)) {
        if (!current()) throw new Error("WALK_SYNC_ACTOR_CHANGED");
        await markGpsWalkDeleted(ownerId, id, false);
        locallyDeleted.add(id);
      }
    }
    const committed = await commitWalkSyncPage(ownerId, previous, page.cursor, current, (document, deleted) => {
      const journal = parseWalkJournal(document);
      const local = journal.completed.filter(walk => walk.clientId && !deleted.has(walk.clientId));
      const byId = new Map(local.map(walk => [walk.clientId!, walk]));
      const confirmed = new Map(Object.entries(previous.confirmed));
      acknowledged.forEach((signature, id) => confirmed.set(id, signature));
      for (const remote of page.walks) {
        if (!remote.clientId || deleted.has(remote.clientId)) continue;
        const prior = byId.get(remote.clientId);
        const priorWire = prior && toRemoteWalk(prior);
        const signature = priorWire && fingerprint(priorWire);
        // An edit by a widget or foreground screen during the HTTP round trip
        // stays dirty. Keep local pause/countdown details for identical records.
        if (priorWire && (confirmed.get(remote.clientId) !== signature ||
            (legacy && acknowledged.has(remote.clientId)))) continue;
        if (!prior || signature !== fingerprint(remote)) byId.set(remote.clientId, fromRemoteWalk(remote));
        const persisted = toRemoteWalk(byId.get(remote.clientId)!)!;
        confirmed.set(remote.clientId, fingerprint(persisted));
      }
      const completed = [...byId.values()].sort((a,b) => b.startedAtMs - a.startedAtMs ||
        (a.clientId! < b.clientId! ? 1 : a.clientId === b.clientId ? 0 : -1)).slice(0, 2000);
      const retained = new Set(completed.map(walk => walk.clientId));
      const next = { ...journal, completed };
      const saved = Object.fromEntries([...confirmed].filter(([id]) => retained.has(id)));
      return { document: JSON.stringify(next), confirmed: saved, result: { journal: next, confirmed: saved } };
    });
    acknowledged.clear();
    merged = committed.journal;
    checkpoint = { confirmed: committed.confirmed, cursor: page.cursor };
    if (!page.more) break;
  }
  const gpsWalks = new Set(merged.completed.filter(walk => walk.gpsEnabled).map(walk => walk.clientId));
  for (const clientId of await listPendingGpsWalks(ownerId)) {
    if (!gpsWalks.has(clientId)) continue;
    let cursor = await getGpsSyncCursor(ownerId,clientId);
    while (true) {
      const batch=await readGpsPoints(ownerId,clientId,cursor,150);
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
        const response=await apiClient<{accepted:number}>(`/api/v1/walks/${clientId}/track`,{
          method:'PUT',body:payload,requestGuard:()=>current(),skipAuthRefreshReplay:true,
          suppressSubscriptionPaywall:true,
        });
        if(!response.success || response.data?.accepted !== safe.length) throw new Error(response.code??'WALK_TRACK_SYNC_FAILED');
        if(!current()) throw new Error('WALK_SYNC_ACTOR_CHANGED');
      }
      cursor=batch[batch.length-1]!.seq;
      await markGpsSynced(ownerId,clientId,cursor);
    }
  }
  return merged;
}

export function reportWalkSyncIssue(error: unknown): void {
  reportClientError(error, { issueKey: "DogWalkServerSync" });
}
