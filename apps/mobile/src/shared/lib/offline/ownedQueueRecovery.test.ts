import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { createNewOnlyV2Queues } from "./newOnlyV2Queues";

function fixture() {
  const disk = new Map<string,string>();
  const secure = new Map<string,string>();
  const reads: string[] = [];
  let fail: string | undefined;
  const deps = {
    storage: {
      getAllKeys: async () => [...disk.keys()],
      getItem: async (key:string) => { reads.push(key); return disk.get(key) ?? null; },
      setItem: async (key:string,value:string) => {
        if (key === fail) throw new Error("disk unavailable");
        disk.set(key,value);
      },
    },
    secure: {
      getItemAsync: async (key:string) => secure.get(key) ?? null,
      setItemAsync: async (key:string,value:string) => { secure.set(key,value); },
      deleteItemAsync: async (key:string) => { secure.delete(key); },
    },
    makeId: randomUUID,
    now: Date.now,
  };
  return { disk, reads, deps, failAt: (key?:string) => { fail=key; }, create:()=>createNewOnlyV2Queues(deps) };
}
describe("verified owner queue recovery",()=>{
  it("rotates the session epoch and migrates only the returning owner's immutable entries",async()=>{
    const f=fixture(), q=f.create();
    f.disk.set("progress-sync-storage","ownerless");
    const first=await q.beginVerifiedLogin("owner-a");
    const a=await q.enqueue("progress","completePracticeStep",{courseId:"a",stepIndex:0});
    await q.endSession();
    const b=await q.beginVerifiedLogin("owner-b");
    const other=await q.enqueue("progress","startStep",{courseId:"b",stepIndex:0});
    await q.endSession();
    f.reads.length=0;
    const next=await q.beginVerifiedLogin("owner-a");
    expect(next.authEpoch).not.toBe(first.authEpoch);
    expect((await q.getPending("progress")).map(e=>e.eventId)).toEqual([a.eventId]);
    expect(JSON.parse(f.disk.get("gafus-progress-v2:owner-a:"+first.authEpoch)!).entries).toEqual([]);
    expect(f.disk.get("gafus-progress-v2:owner-b:"+b.authEpoch)).toContain(other.eventId);
    expect(f.reads.every(key=>key.includes(":owner-a:"))).toBe(true);
    expect(f.disk.get("progress-sync-storage")).toBe("ownerless");
  });
  it("recovers a crash after copy and before source clear without duplicate events",async()=>{
    const f=fixture(), q=f.create();
    const old=await q.beginVerifiedLogin("owner-a");
    const entry=await q.enqueue("progress","completePracticeStep",{courseId:"a",stepIndex:0});
    await q.endSession();
    f.failAt("gafus-progress-v2:owner-a:"+old.authEpoch);
    await expect(q.beginVerifiedLogin("owner-a")).rejects.toThrow("disk unavailable");
    expect(q.getVerifiedBinding()).toBeNull();
    expect(await q.getPending("progress")).toEqual([]);
    f.failAt();
    const restart=f.create();
    expect(await restart.restoreVerifiedSession("owner-a")).toBe(true);
    expect((await restart.getPending("progress")).map(e=>e.eventId)).toEqual([entry.eventId]);
    expect(JSON.parse(f.disk.get("gafus-progress-v2:owner-a:"+old.authEpoch)!).entries).toEqual([]);
  });
  it("does not fabricate order between unrelated old progress histories",async()=>{
    const f=fixture();
    // Simulate versions before owner recovery, which created a new epoch on login.
    const legacy=createNewOnlyV2Queues({...f.deps,storage:{getItem:f.deps.storage.getItem,setItem:f.deps.storage.setItem}});
    const one=await legacy.beginVerifiedLogin("owner-a");
    await legacy.enqueue("progress","resetStep",{courseId:"a",stepIndex:0});
    await legacy.endSession();
    const two=await legacy.beginVerifiedLogin("owner-a");
    await legacy.enqueue("progress","startStep",{courseId:"a",stepIndex:0});
    await legacy.endSession();
    const snapshot=new Map(f.disk);
    const q=f.create();
    await expect(q.beginVerifiedLogin("owner-a")).rejects.toMatchObject({code:"V2_QUARANTINED"});
    expect(q.getVerifiedBinding()).toBeNull();
    expect(f.disk).toEqual(snapshot);
    expect(one.authEpoch).not.toBe(two.authEpoch);
  });
});
