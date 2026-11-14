/** OFF021 source-review-only: transaction/receipt/CAS invariants. Never mounts v3. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflineVideoPolicyTx } from "./offlineVideoSqlPort";
const access = vi.hoisted(() => ({ authorize: vi.fn(async () => "ALLOWED" as const) }));
vi.mock("./videoPositionOccurrenceV3", () => ({
  MAX_FUTURE_SKEW_MS: 300_000,
  MAX_REVISION: 9007199254740991n,
  authorizeVideoOccurrenceV3: access.authorize,
  canonicalOccurrenceV3: (ownerId: string, raw: Record<string, unknown>) => ({
    value: raw,
    resourceKey: `video:course:${raw.dayOnCourseId}:${raw.stepOnDayId}:${raw.videoId}`,
    recordedAt: raw.recordedAt,
    payloadHash: `owner:${ownerId}:payload:${raw.videoId}`,
  }),
}));
const eventId = "00000000-0000-4000-8000-000000000001";
const recordedAt = "2026-11-12T05:01:00.000Z";
const request = {scope:"COURSE_STEP",operation:"video.position",eventId,videoId:"video-1",
  dayOnCourseId:"day-on-course-1",stepOnDayId:"step-on-day-1",positionSec:42,
  recordedAt,expectedRevision:0};
const tx = { transactionIdentity: "single-PG-client" } as unknown as OfflineVideoPolicyTx;
function adapter() {
  const t = {
    withOfflineVideoSqlTransaction: vi.fn(async <T>(fn:(tx:OfflineVideoPolicyTx)=>Promise<T>)=>fn(tx)),
    claimOfflineVideoReceipt: vi.fn(async()=>[{id:"claim-1"}]),
    findOfflineVideoStoredReceipt: vi.fn(async()=>[]),
    reserveOfflineVideoRevision: vi.fn(async()=>1),
    readOfflineVideoRevision: vi.fn(async()=>[{revision:0n,videoLastPositionSec:null,videoRecordedAt:null}]),
    advanceOfflineVideoRevision: vi.fn(async()=>1),
    commitOfflineVideoReceipt: vi.fn(async()=>1),
  };
  return t;
}
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();access.authorize.mockResolvedValue("ALLOWED");});
describe("offline video v3 proposed SQL port, never active v2",()=>{
  it("denies a valid proposal without the one-transaction SQL binding",async()=>{
    const service=await import("./offlineVideoPositionV3Service");
    await expect(service.submitVideoPositionV2Proposal({authenticatedOwnerId:"owner-1",request}))
      .rejects.toThrow("OFFLINE_VIDEO_SQL_PORT_UNBOUND");
    expect(access.authorize).not.toHaveBeenCalled();
    expect(service.videoPositionV3ErrorEnvelope(new Error("OFFLINE_VIDEO_SQL_PORT_UNBOUND")))
      .toEqual({status:503,body:{success:false,code:"VIDEO_POSITION_JOURNAL_UNAVAILABLE"}});
  });
  it("retains one exact owner Tx for access → unique receipt → revision CAS → persisted ACK",async()=>{
    const port=await import("./offlineVideoSqlPort");const service=await import("./offlineVideoPositionV3Service");
    const db=adapter();port.registerOfflineVideoSqlPort(db);
    const receipt=await service.submitVideoPositionV2Proposal({authenticatedOwnerId:"owner-1",request});
    expect(receipt).toMatchObject({success:true,ack:{protocol:2,eventId,state:"COMMITTED",replayed:false,serverRevision:"1",result:{videoId:"video-1",positionSec:42}}});
    const resourceKey="video:course:day-on-course-1:step-on-day-1:video-1";
    expect(access.authorize).toHaveBeenCalledWith(tx,"owner-1",request,expect.any(Date));
    expect(db.claimOfflineVideoReceipt).toHaveBeenCalledExactlyOnceWith(tx,"owner-1",eventId,resourceKey,"owner:owner-1:payload:video-1");
    expect(db.reserveOfflineVideoRevision).toHaveBeenCalledExactlyOnceWith(tx,"owner-1",resourceKey);
    expect(db.readOfflineVideoRevision).toHaveBeenCalledExactlyOnceWith(tx,"owner-1",resourceKey);
    expect(db.advanceOfflineVideoRevision).toHaveBeenCalledExactlyOnceWith(tx,"owner-1",resourceKey,0n,1n,42,recordedAt);
    expect(db.commitOfflineVideoReceipt).toHaveBeenCalledExactlyOnceWith(tx,"owner-1","claim-1",1n,receipt);
    expect(access.authorize.mock.invocationCallOrder[0]).toBeLessThan(db.claimOfflineVideoReceipt.mock.invocationCallOrder[0]);
    expect(db.claimOfflineVideoReceipt.mock.invocationCallOrder[0]).toBeLessThan(db.advanceOfflineVideoRevision.mock.invocationCallOrder[0]);
    expect(db.advanceOfflineVideoRevision.mock.invocationCallOrder[0]).toBeLessThan(db.commitOfflineVideoReceipt.mock.invocationCallOrder[0]);
  });
  it("rechecks revoked entitlement before looking up previously committed receipt",async()=>{
    const port=await import("./offlineVideoSqlPort");const service=await import("./offlineVideoPositionV3Service");
    const db=adapter();db.claimOfflineVideoReceipt.mockResolvedValueOnce([]);port.registerOfflineVideoSqlPort(db);
    access.authorize.mockResolvedValue("DENIED");
    await expect(service.submitVideoPositionV2Proposal({authenticatedOwnerId:"owner-1",request}))
      .rejects.toMatchObject({code:"VIDEO_ACCESS_DENIED"});
    expect(db.claimOfflineVideoReceipt).not.toHaveBeenCalled();
    expect(db.findOfflineVideoStoredReceipt).not.toHaveBeenCalled();
  });
  it("replays only identical owner/event/resource/payload and never advances revision",async()=>{
    const port=await import("./offlineVideoSqlPort");const service=await import("./offlineVideoPositionV3Service");
    const db=adapter();db.claimOfflineVideoReceipt.mockResolvedValueOnce([]);
    const stored={method:"POST",operation:"video.position",resourceKey:"video:course:day-on-course-1:step-on-day-1:video-1",
      payloadHash:"owner:owner-1:payload:video-1",state:"COMMITTED",responseStatus:200,
      responseBody:{success:true,ack:{protocol:2,eventId,operation:"video.position",state:"COMMITTED",replayed:false,
      serverRevision:"1",result:{videoId:"video-1",positionSec:42,recordedAt}}}};
    db.findOfflineVideoStoredReceipt.mockResolvedValueOnce([stored]);port.registerOfflineVideoSqlPort(db);
    await expect(service.submitVideoPositionV2Proposal({authenticatedOwnerId:"owner-1",request}))
      .resolves.toMatchObject({ack:{eventId,replayed:true,serverRevision:"1"}});
    expect(db.findOfflineVideoStoredReceipt).toHaveBeenCalledExactlyOnceWith(tx,"owner-1",eventId);
    expect(db.advanceOfflineVideoRevision).not.toHaveBeenCalled();
    expect(db.commitOfflineVideoReceipt).not.toHaveBeenCalled();
  });
  it("returns public 409 for conflicting payload and stale committed CAS",async()=>{
    const port=await import("./offlineVideoSqlPort");const service=await import("./offlineVideoPositionV3Service");
    const db=adapter();db.claimOfflineVideoReceipt.mockResolvedValueOnce([]);
    db.findOfflineVideoStoredReceipt.mockResolvedValueOnce([{method:"POST",operation:"video.position",resourceKey:"other-scope",
      payloadHash:"wrong",state:"COMMITTED",responseStatus:200,responseBody:null}]);port.registerOfflineVideoSqlPort(db);
    await expect(service.submitVideoPositionV2Proposal({authenticatedOwnerId:"owner-1",request}))
      .rejects.toMatchObject({code:"IDEMPOTENCY_KEY_CONFLICT"});
    expect(service.videoPositionV3ErrorEnvelope(new service.VideoPositionV3Error("IDEMPOTENCY_KEY_CONFLICT")))
      .toEqual({status:409,body:{success:false,code:"IDEMPOTENCY_KEY_CONFLICT"}});
    db.readOfflineVideoRevision.mockResolvedValueOnce([{revision:1n,videoLastPositionSec:42,videoRecordedAt:null}]);
    await expect(service.submitVideoPositionV2Proposal({authenticatedOwnerId:"owner-1",request}))
      .rejects.toMatchObject({code:"STALE_VIDEO_REVISION"});
    expect(db.commitOfflineVideoReceipt).not.toHaveBeenCalled();
  });
  it("refuses hot-replacing the authoritative transaction provider",async()=>{
    const p=await import("./offlineVideoSqlPort");const db=adapter();p.registerOfflineVideoSqlPort(db);
    p.registerOfflineVideoSqlPort(db);
    expect(()=>p.registerOfflineVideoSqlPort(adapter())).toThrow("OFFLINE_VIDEO_SQL_PORT_ALREADY_BOUND");
  });
});
