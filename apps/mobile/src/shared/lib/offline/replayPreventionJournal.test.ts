import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createNewOnlyV2Queues } from "./newOnlyV2Queues";
import { replayPreventionJournal, type PreventionReplayTransport } from "./replayPreventionJournal";

async function fixture() {
  const disk = new Map<string, string>();
  const secure = new Map<string, string>();
  const deps = {
    storage: {
      getItem: async (k: string) => disk.get(k) ?? null,
      setItem: async (k: string, v: string) => { disk.set(k,v); },
    },
    secure: {
      getItemAsync: async (k: string) => secure.get(k) ?? null,
      setItemAsync: async (k: string,v: string) => { secure.set(k,v); },
      deleteItemAsync: async (k: string) => { secure.delete(k); },
    },
    makeId: randomUUID,
    now: Date.now,
  };
  const queue = createNewOnlyV2Queues(deps);
  const binding = await queue.beginVerifiedLogin("owner-a");
  const enqueue = () => queue.enqueue("prevention", "prevention.upsert", {
    petId: "pet-a", entries: [{eventId:randomUUID(),clientId:randomUUID(),type:"VACCINATION",
      performedAt:"2026-11-27T00:00:00.000Z",reminderEnabled:false}],
  });
  return {queue,binding,enqueue,deps,disk,secure};
}
const ack = (r: Parameters<PreventionReplayTransport>[0], replayed = false) => ({
  success: true, ack: {protocol:2,eventId:r.body.eventId,operation:"prevention.batch",
    state:"COMMITTED",replayed,serverRevision:"1",
    items:r.body.entries.map(e=>({eventId:e.eventId,clientId:e.clientId,state:"COMMITTED",result:"CREATED",serverRowId:"row"}))},
});
describe("prevention durable replay", () => {
  it("repeats identical body and idempotency key after lost ACK and restart, then removes exactly one event",async()=>{
    const f=await fixture();await f.enqueue();
    let sent: unknown;
    const lost: PreventionReplayTransport=async r=>{sent=r;return {success:false,code:"REQUEST_TIMEOUT"}};
    expect(await replayPreventionJournal(f.queue,f.binding,()=>true,lost,vi.fn())).toEqual({committed:0,pending:true});
    const restart=createNewOnlyV2Queues(f.deps);
    expect(await restart.restoreVerifiedSession("owner-a")).toBe(true);
    const notify=vi.fn();
    const send: PreventionReplayTransport=async r=>{expect(r).toEqual(sent);return ack(r,true)};
    expect(await replayPreventionJournal(restart,f.binding,()=>true,send,notify)).toEqual({committed:1,pending:false});
    expect(await restart.getPending("prevention")).toEqual([]);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith("pet-a");
  });
  it("keeps data on malformed ACK, conflict or unsupported old server",async()=>{
    const f=await fixture();const saved=await f.enqueue();
    for(const response of [{success:false,code:"NOT_FOUND"},{success:false,code:"IDEMPOTENCY_KEY_CONFLICT"},{success:true,ack:{protocol:2,eventId:saved.eventId,state:"COMMITTED"}}]){
      expect(await replayPreventionJournal(f.queue,f.binding,()=>true,async()=>response,vi.fn())).toEqual({committed:0,pending:true});
      expect(await f.queue.getPending("prevention")).toHaveLength(1);
    }
  });
  it("does not ACK old owner after a new login during the request",async()=>{
    const f=await fixture();const saved=await f.enqueue();
    const notify=vi.fn();
    expect(await replayPreventionJournal(f.queue,f.binding,()=>true,async r=>{
      await f.queue.beginVerifiedLogin("owner-b");return ack(r);
    },notify)).toEqual({committed:0,pending:true});
    expect(notify).not.toHaveBeenCalled();
    expect(await f.queue.getPending("prevention")).toEqual([]);
    expect(f.disk.get("gafus-prevention-v2:owner-a:"+f.binding.authEpoch)).toContain(saved.eventId);
  });
  it("retains later enqueue and rejects duplicate drain deletion",async()=>{
    const f=await fixture();await f.enqueue();
    const notify=vi.fn();
    const res=await replayPreventionJournal(f.queue,f.binding,()=>true,async r=>{await f.enqueue();return ack(r)},notify);
    expect(res.committed).toBe(1);
    expect(await f.queue.getPending("prevention")).toHaveLength(1);
    expect(notify).toHaveBeenCalledOnce();
  });
});
