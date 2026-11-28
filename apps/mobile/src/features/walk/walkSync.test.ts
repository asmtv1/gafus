import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  user: { id: "owner", username: "asmtv1", role: "USER" },
  epoch: "epoch-a",
  authenticated: true,
  isLoading: false,
  load: vi.fn(),
  save: vi.fn(),
  api: vi.fn(),
  cursor: null as string | null,
  confirmed: {} as Record<string, string>,
  markers: new Set<string>(),
}));
vi.mock("@/shared/lib/api/client", () => ({ apiClient: mocked.api }));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      user: mocked.user,
      isAuthenticated: mocked.authenticated,
      isLoading: mocked.isLoading,
      verifiedSessionEpoch: mocked.epoch,
    }),
  },
}));
vi.mock("@/shared/lib/error-reporting", () => ({ reportClientError: vi.fn() }));
vi.mock("./walkStorage", async original => ({
  ...await original<typeof import("./walkStorage")>(), loadWalkJournal: mocked.load,
}));
vi.mock('./walkGpsStorage',()=>({
  readWalkSyncCheckpoint: async () => ({cursor: mocked.cursor, confirmed: mocked.confirmed}),
  commitWalkSyncPage: async (owner: string, _previous: unknown, cursor: string | null, current: () => boolean,
    merge: (doc: string, deleted: Set<string>) => { document: string; confirmed: Record<string,string>; result: unknown }) => {
    if (!current()) throw new Error("WALK_SYNC_ACTOR_CHANGED");
    const update = merge(JSON.stringify(await mocked.load(owner)), mocked.markers);
    const journal = JSON.parse(update.document);
    mocked.save(owner, journal);
    mocked.load.mockResolvedValue(journal);
    mocked.cursor = cursor;
    mocked.confirmed = update.confirmed;
    return update.result;
  },
  listPendingGpsWalks: vi.fn(async () => [id1]),
  getGpsSyncCursor:vi.fn(async()=>0),
  markGpsSynced:vi.fn(async()=>{}),
  readGpsPoints:vi.fn(async()=>[]),
  getGpsDeletedWalks:vi.fn(async()=>[]),
  markGpsWalkDeleted:vi.fn(async()=>{}),
  confirmGpsWalkDeleted:vi.fn(async()=>{}),
}));

import { finishWalk, startWalk } from "./walkModel";
import { canUseDogWalkHistory } from "./walkAccess";
import { fromRemoteWalk, mergeWalkHistory, syncDogWalkHistory, toRemoteWalk } from "./walkSync";
import {getGpsDeletedWalks, markGpsWalkDeleted, readGpsPoints, markGpsSynced} from './walkGpsStorage';

const id1 = "028fcf5d-a5e5-445c-9142-766eabde7349";
const id2 = "e0ecbff3-595c-4cec-a9cf-031a91a8d541";
const local = {
  ...finishWalk({ ...startWalk("stopwatch", 0), clientId: id1, steps: 2500 }, 3_600_000),
};
const remoteOnly = {
  clientId: id2,
  startedAt: new Date(5000).toISOString(),
  finishedAt: new Date(65000).toISOString(),
  durationSeconds: 60,
  steps: 75,
  estimatedMeters: 60,
  timerMode: "stopwatch" as const,
  incompleteSteps: false,
};
const conflicting = { ...toRemoteWalk(local)!, steps: 1, estimatedMeters: 1 };

beforeEach(() => {
  mocked.user = { id: "owner", username: "asmtv1", role: "USER" };
  mocked.cursor = null;
  mocked.confirmed = {};
  mocked.markers.clear();
  mocked.epoch = "epoch-a";
  mocked.authenticated = true;
  mocked.isLoading = false;
  mocked.load.mockReset().mockResolvedValue({
    active: null,
    completed: [local],
    preference: { mode: "stopwatch", countdownMinutes: 30 },
  });
  mocked.save.mockReset().mockResolvedValue(undefined);
  vi.mocked(getGpsDeletedWalks).mockReset().mockResolvedValue([]);
  vi.mocked(markGpsWalkDeleted).mockReset().mockImplementation(async (_owner,id) => { mocked.markers.add(id); });
  vi.mocked(readGpsPoints).mockReset().mockResolvedValue([]);
  vi.mocked(markGpsSynced).mockReset().mockResolvedValue(undefined);
  mocked.api.mockReset().mockImplementation(async(path:string)=>({
    success:true, data:path==='/api/v1/walks/deleted' ? [] : [conflicting,remoteOnly],
  }));
});

describe("phone-first dog walk synchronization", () => {
  it("allows any signed-in user, independent of username or role", () => {
    expect(canUseDogWalkHistory({ id: "regular" })).toBe(true);
    expect(canUseDogWalkHistory({ id: "admin-id" })).toBe(true);
    expect(canUseDogWalkHistory({ id: "partner-id" })).toBe(true);
    expect(canUseDogWalkHistory(null)).toBe(false);
    expect(canUseDogWalkHistory({})).toBe(false);
  });

  it("locally overrides stale server copies while adopting server-only walks", () => {
    const merged = mergeWalkHistory([local], [conflicting, remoteOnly]);
    expect(merged.find((w) => w.clientId === id1)?.steps).toBe(2500);
    expect(merged.find((w) => w.clientId === id2)?.steps).toBe(75);
    expect(merged).toHaveLength(2);
    expect(fromRemoteWalk(remoteOnly).finishedAtMs).toBe(65000);
  });

  it("uploads the local completed walk and saves the merge", async () => {
    const merged = await syncDogWalkHistory("owner");
    expect(mocked.api).toHaveBeenCalledWith(
      "/api/v1/walks/sync?response=ack",
      expect.objectContaining({
        method: "PUT",
        body: { walks: [toRemoteWalk(local)] },
        skipAuthRefreshReplay: true,
      }),
    );
    expect(merged.completed.find((w) => w.clientId === id1)?.steps).toBe(2500);
    expect(merged.completed.find((w) => w.clientId === id2)?.steps).toBe(75);
    expect(mocked.save).toHaveBeenCalledWith("owner", merged);
  });

  it("migrates existing walks once, then reads just the next delta", async () => {
    mocked.api.mockImplementation(async (path: string) => {
      if (path.includes("/sync?")) return {success: true, data: {accepted: [id1]}};
      if (path.includes("after=14")) return {success: true, data: {
        walks: [], deleted: [id2], reset: false, cursor: "15", more: false,
      }};
      return {success: true, data: {
        walks: [toRemoteWalk(local), remoteOnly], deleted: [], reset: true, cursor: "14", more: false,
      }};
    });
    await syncDogWalkHistory("owner");
    mocked.api.mockClear();
    const result = await syncDogWalkHistory("owner");
    expect(mocked.api.mock.calls.map(([path]) => path)).toEqual(["/api/v1/walks?view=changes&after=14"]);
    expect(result.completed.map(row => row.clientId)).toEqual([id1]);
    expect(mocked.cursor).toBe("15");
  });

  it("allows ordinary accounts to sync their own history", async () => {
    mocked.user = { id: "owner", username: "other", role: "USER" };
    await expect(syncDogWalkHistory("owner")).resolves.toBeDefined();
    expect(mocked.api).toHaveBeenCalledWith(
      "/api/v1/walks/sync?response=ack",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("does not send history for a signed-out account", async () => {
    mocked.authenticated = false;
    await expect(syncDogWalkHistory("owner")).rejects.toThrow("WALK_SYNC_NOT_AUTHORIZED");
    expect(mocked.api).not.toHaveBeenCalled();
    expect(mocked.save).not.toHaveBeenCalled();
  });

  it("rejects account changes mid-sync before saving", async () => {
    mocked.api.mockImplementationOnce(async () => {
      mocked.user = { id: "other-owner", username: "admin", role: "ADMIN" };
      return { success: true, data: [remoteOnly] };
    });
    await expect(syncDogWalkHistory("owner")).rejects.toThrow("WALK_SYNC_ACTOR_CHANGED");
    expect(mocked.save).not.toHaveBeenCalled();
  });
});

describe('deleted walk tombstones and route sync',()=>{
 it('uploads a local deletion before other walks and never resurrects the removed route',async()=>{
  mocked.markers.add(id1);
  vi.mocked(getGpsDeletedWalks).mockResolvedValue([{walkId:id1,pending:true}]);
  mocked.api.mockImplementation(async(path:string)=>({
    success:true,data:path==='/api/v1/walks/deleted' ? [] :
      path===`/api/v1/walks/${id1}` ? {deleted:true} : [conflicting,remoteOnly],
  }));
  const journal=await syncDogWalkHistory('owner');
  expect(mocked.api).toHaveBeenCalledWith(`/api/v1/walks/${id1}`,
    expect.objectContaining({method:'DELETE'}));
  expect(mocked.api).not.toHaveBeenCalledWith('/api/v1/walks/sync?response=ack',expect.anything());
  expect(journal.completed.some(w=>w.clientId===id1)).toBe(false);
 });
 it('removes a server-deleted walk from the local history on the next sync',async()=>{
  mocked.api.mockImplementation(async(path:string)=>({
    success:true,data:path==='/api/v1/walks/deleted' ? [id1] : [conflicting,remoteOnly],
  }));
  const journal=await syncDogWalkHistory('owner');
  expect(journal.completed.map(w=>w.clientId)).toEqual([id2]);
  expect(markGpsWalkDeleted).toHaveBeenCalledWith('owner',id1,false);
 });
 it('uploads GPS fixes in ordered idempotent batches after the completed walk',async()=>{
  const gpsWalk={...local,gpsEnabled:true,gpsMeters:22};
  mocked.load.mockResolvedValue({active:null,completed:[gpsWalk],preference:{mode:'stopwatch',countdownMinutes:30}});
  const timestamp=Date.parse('2026-11-05T09:05:00.000Z');
  vi.mocked(readGpsPoints).mockResolvedValueOnce([{
    seq:1,segment:1,latitude:53.19,longitude:50.1,timestamp,accuracy:5,speed:1,
    accepted:true,reason:'first',deltaMeters:0,
  }]).mockResolvedValueOnce([]);
  mocked.api.mockImplementation(async(path:string)=>({
    success:true,data:path==='/api/v1/walks/deleted' ? [] : path.endsWith('/track') ? {accepted:1} : [conflicting,remoteOnly],
  }));
  await syncDogWalkHistory('owner');
  expect(mocked.api).toHaveBeenCalledWith(`/api/v1/walks/${id1}/track`,
    expect.objectContaining({method:'PUT',body:{points:[expect.objectContaining({seq:1,segment:1})]}}));
  expect(markGpsSynced).toHaveBeenCalledWith('owner',id1,1);
 });
});
