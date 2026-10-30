import { describe,expect,it,vi } from "vitest";
// Do not connect to the app-wide Redis/client in an isolated unit test.
vi.mock("@gafus/queues",()=>({connection:{},
  QUESTIONS_MEDIA_PROCESSING_QUEUE_NAME:"questions-photo-local-test"}));
vi.mock("@gafus/logger",()=>({createWorkerLogger:()=>({error:vi.fn(),success:vi.fn()})}));
import { createQuestionsPhotoWakeHandler } from "./questions-photo-trigger-worker";
const now=new Date("2026-10-28T12:00:00.000Z");
const uuid="550e8400-e29b-41d4-a716-446655440000";
function make(status="QUEUED",active=0){
  const findUnique=vi.fn(async()=>({status,attempts:0,
    nextAttemptAt:new Date(now.getTime()-1000),leaseUntil:new Date(now.getTime()-1000)}));
  const count=vi.fn(async()=>active);
  const dispatch=vi.fn(async()=>({dispatched:1}));
  const handler=createQuestionsPhotoWakeHandler({
    database:{questionV2MediaTask:{findUnique,count}} as never,
    dispatch:dispatch as never,now:()=>now,
  });
  return {findUnique,count,dispatch,handler};
}
describe("Questions Photo V2 immediate wake avoids unnecessary Cloud starts",()=>{
  it("rejects malformed media ID before any database or Cloud operation",async()=>{
    const t=make();
    await expect(t.handler("../foreign")).rejects.toThrow("INVALID_ID");
    expect(t.findUnique).not.toHaveBeenCalled();
    expect(t.dispatch).not.toHaveBeenCalled();
  });
  it("does not dispatch for READY, even when no leases are occupied",async()=>{
    const t=make("READY");
    await expect(t.handler(uuid)).resolves.toEqual({dispatched:0});
    expect(t.count).not.toHaveBeenCalled();
    expect(t.dispatch).not.toHaveBeenCalled();
  });
  it("does not dispatch when both PostgreSQL processing slots are occupied",async()=>{
    const t=make("QUEUED",2);
    await expect(t.handler(uuid)).resolves.toEqual({dispatched:0});
    expect(t.count).toHaveBeenCalledWith({where:{status:"PROCESSING",
      leaseUntil:{gt:now}}});
    expect(t.dispatch).not.toHaveBeenCalled();
  });
  it("dispatches a due QUEUED photo with a free slot",async()=>{
    const t=make("QUEUED",1);
    await expect(t.handler(uuid)).resolves.toEqual({dispatched:1});
    expect(t.dispatch).toHaveBeenCalledOnce();
  });
  it("retries a lease-expired PROCESSING photo if pool has room",async()=>{
    const t=make("PROCESSING",1);
    await expect(t.handler(uuid)).resolves.toEqual({dispatched:1});
    expect(t.dispatch).toHaveBeenCalledOnce();
  });
  it("preserves Cloud launch failures for durable PG recovery",async()=>{
    const t=make("QUEUED",0);
    t.dispatch.mockRejectedValueOnce(Error("CLOUD_UNAVAILABLE"));
    await expect(t.handler(uuid)).rejects.toThrow("CLOUD_UNAVAILABLE");
  });
});
