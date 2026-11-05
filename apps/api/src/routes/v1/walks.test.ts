import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const mocked = vi.hoisted(() => ({
  list: vi.fn(),
  sync: vi.fn(),
  syncPoints:vi.fn(),
  listPoints:vi.fn(),
  listDeleted:vi.fn(),
  deleteWalk:vi.fn(),
}));
vi.mock("@gafus/core/services/walks", () => ({
  listCompletedDogWalks: mocked.list,
  syncCompletedDogWalks: mocked.sync,
  syncDogWalkTrackPoints: mocked.syncPoints,
  listDogWalkTrackPoints: mocked.listPoints,
  listDeletedDogWalkIds:mocked.listDeleted,
  deleteDogWalk:mocked.deleteWalk,
}));

import { walksRoutes } from "./walks.js";

const app = new Hono();
app.use("*", async (c, next) => {
  c.set("user", { id: "owner-from-jwt", username: "asmtv1", role: "USER" });
  await next();
});
app.route("/api/v1/walks", walksRoutes);
const valid = {
  clientId: "203e78bf-e7f0-4ed6-bec4-b48b0ad85068",
  startedAt: "2026-11-05T09:00:00.000Z",
  finishedAt: "2026-11-05T10:00:00.000Z",
  durationSeconds: 1800,
  steps: 2500,
  estimatedMeters: 2000,
  timerMode: "stopwatch",
  incompleteSteps: false,
};

beforeEach(() => {
  mocked.list.mockReset().mockResolvedValue([valid]);
  mocked.sync.mockReset().mockResolvedValue([valid]);
  mocked.syncPoints.mockReset().mockResolvedValue({accepted:1});
  mocked.listPoints.mockReset().mockResolvedValue([]);
  mocked.listDeleted.mockReset().mockResolvedValue([]);
  mocked.deleteWalk.mockReset().mockResolvedValue(undefined);
});

describe("private dog walk HTTP contract", () => {
  it("lists only the authenticated owner and returns no-store", async () => {
    const res = await app.request("http://test/api/v1/walks");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(mocked.list).toHaveBeenCalledWith("owner-from-jwt");
    expect((await res.json()).data).toEqual([valid]);
  });

  it("rejects malformed / duplicate walks without touching persistence", async () => {
    for (const payload of [
      { walks: [valid, valid] },
      { walks: [{ ...valid, durationSeconds: 6000 }] },
      { walks: [{ ...valid, clientId: "bad" }] },
      { walks: [{ ...valid, userId: "victim" }] },
    ]) {
      const response = await app.request("http://test/api/v1/walks/sync", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(response.status).toBe(400);
    }
    expect(mocked.sync).not.toHaveBeenCalled();
  });

  it("syncs as the JWT owner, never as a client supplied identity", async () => {
    const res = await app.request("http://test/api/v1/walks/sync", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ walks: [valid] }),
    });
    expect(res.status).toBe(200);
    expect(mocked.sync).toHaveBeenCalledWith("owner-from-jwt", [valid]);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("returns forbidden without leaking other accounts' history", async () => {
    mocked.list.mockRejectedValueOnce(new Error("WALKS_FORBIDDEN"));
    const res = await app.request("http://test/api/v1/walks");
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });
});

const gpsPoint = {
  seq:1,segment:1,latitude:53.195,longitude:50.1,
  timestamp:'2026-11-05T09:05:00.000Z',accuracy:4,speed:1.1,
  accepted:true,reason:'first',deltaMeters:0,
};
describe('owner-scoped GPS route API',()=>{
  it('appends raw GPS fixes idempotently for the JWT owner',async()=>{
    const response=await app.request(`http://test/api/v1/walks/${valid.clientId}/track`,{
      method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({points:[gpsPoint]}),
    });
    expect(response.status).toBe(200);
    expect(mocked.syncPoints).toHaveBeenCalledWith('owner-from-jwt',valid.clientId,[gpsPoint]);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('rejects spoofed identity and impossible coordinates',async()=>{
    for(const point of [{...gpsPoint,userId:'victim'},{...gpsPoint,latitude:100}]) {
      const response=await app.request(`http://test/api/v1/walks/${valid.clientId}/track`,{
        method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({points:[point]}),
      });
      expect(response.status).toBe(400);
    }
    expect(mocked.syncPoints).not.toHaveBeenCalled();
  });
  it('reads points only under the JWT owner',async()=>{
    const response=await app.request(`http://test/api/v1/walks/${valid.clientId}/track?afterSeq=8`);
    expect(response.status).toBe(200);
    expect(mocked.listPoints).toHaveBeenCalledWith('owner-from-jwt',valid.clientId,8);
  });
  it('never reveals another owner walk presence or route',async()=>{
    mocked.listPoints.mockRejectedValueOnce(new Error('WALK_NOT_FOUND'));
    const response=await app.request(`http://test/api/v1/walks/${valid.clientId}/track`);
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('NOT_FOUND');
  });
});

describe('privacy: permanent walk deletion',()=>{
 it('returns only the authenticated owner tombstones',async()=>{
   mocked.listDeleted.mockResolvedValueOnce([valid.clientId]);
   const response=await app.request('http://test/api/v1/walks/deleted');
   expect(response.status).toBe(200);
   expect(mocked.listDeleted).toHaveBeenCalledWith('owner-from-jwt');
   expect((await response.json()).data).toEqual([valid.clientId]);
 });
 it('removes only the JWT-owned walk, not any supplied owner',async()=>{
   const response=await app.request(`http://test/api/v1/walks/${valid.clientId}`,{method:'DELETE'});
   expect(response.status).toBe(200);
   expect(mocked.deleteWalk).toHaveBeenCalledWith('owner-from-jwt',valid.clientId);
   expect((await response.json()).data.deleted).toBe(true);
 });
 it('rejects malformed deletion IDs before touching persistence',async()=>{
   const response=await app.request('http://test/api/v1/walks/bad',{method:'DELETE'});
   expect(response.status).toBe(400);
   expect(mocked.deleteWalk).not.toHaveBeenCalled();
 });
});
