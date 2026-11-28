/** OFF021: review-only SQL composition, never a live offline v2 mutation. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
const observed=vi.hoisted(()=>({ register:vi.fn((_value:unknown)=>{}),
 transaction:vi.fn(async <T>(fn:(tx:unknown)=>Promise<T>)=>fn({sameTx:true})),
 receipt:vi.fn(async()=>[{id:"claim-1"}]),
 revision:vi.fn(async()=>[{revision:0n,videoRecordedAt:null,videoLastPositionSec:null}]),
 commit:vi.fn(async()=>1),
}));
vi.mock("@gafus/course-progress-server/offline-video-rows",()=>({
  withOfflineVideoSqlTransaction:observed.transaction,
  claimOfflineVideoReceipt:observed.receipt,
  findOfflineVideoStoredReceipt:vi.fn(async()=>[]),
  reserveOfflineVideoRevision:vi.fn(async()=>1),
  readOfflineVideoRevision:observed.revision,
  advanceOfflineVideoRevision:vi.fn(async()=>1),
  commitOfflineVideoReceipt:observed.commit,
}));
describe("offline video v3 SQL composer remains unmounted",()=>{
  it("is NOT present in active API app or offline v2 Hono routes",()=>{
    const app=readFileSync(fileURLToPath(new URL("../../../app.ts",import.meta.url)),"utf8");
    const offline=readFileSync(fileURLToPath(new URL("../../../routes/v1/offline.ts",import.meta.url)),"utf8");
    expect(app).not.toContain("video-position-v3-review-instance");
    expect(offline).not.toContain("video-position-v3-review-instance");
    expect(offline).not.toContain("submitVideoPositionV2Proposal");
  });
  it("explicit review-only composer retains a single transaction across SQL writes",async()=>{
    const { offlineVideoSql } = await import("./video-position-v3-review-instance");
    const port = offlineVideoSql as unknown as {
      withOfflineVideoSqlTransaction<T>(cb:(tx:unknown)=>Promise<T>):Promise<T>;
      claimOfflineVideoReceipt(tx:unknown,owner:string,event:string,scope:string,hash:string):Promise<{id:string}[]>;
      commitOfflineVideoReceipt(tx:unknown,owner:string,id:string,next:bigint,ack:unknown):Promise<number>;
    };
    expect(port).toBeDefined();
    await port.withOfflineVideoSqlTransaction(async tx=>{
      await port.claimOfflineVideoReceipt(tx,"owner-1","event-1","video:course:only","hash-1");
      await port.commitOfflineVideoReceipt(tx,"owner-1","claim-1",1n,{ack:{state:"COMMITTED"}});
    });
    expect(observed.receipt).toHaveBeenCalledExactlyOnceWith({sameTx:true},"owner-1","event-1","video:course:only","hash-1");
    expect(observed.commit).toHaveBeenCalledExactlyOnceWith({sameTx:true},"owner-1","claim-1",1n,{ack:{state:"COMMITTED"}});
  });
});
