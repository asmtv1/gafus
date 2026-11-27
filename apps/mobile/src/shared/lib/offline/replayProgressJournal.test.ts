import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createNewOnlyV2Queues } from "./newOnlyV2Queues";
import { replayProgressJournal, type ProgressReplayTransport } from "./replayProgressJournal";

const payload = {
  courseId:"clwcourse00000000000000001",dayOnCourseId:"clwdayoc0000000000000001",stepIndex:0,
  expectedStepOnDayId:"clwlink00000000000000001",expectedStepId:"clwstep00000000000000001",
};
async function fixture() {
  const disk = new Map<string,string>(), secure = new Map<string,string>();
  const queue = createNewOnlyV2Queues({
    storage:{getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>{disk.set(k,v)}},
    secure:{getItemAsync:async k=>secure.get(k)??null,setItemAsync:async(k,v)=>{secure.set(k,v)},deleteItemAsync:async k=>{secure.delete(k)}},
    makeId:randomUUID,now:Date.now,
  });
  const binding=await queue.beginVerifiedLogin("owner-a");
  return {queue,binding,disk};
}
const ack=(r: Parameters<ProgressReplayTransport>[0])=>({success:true,ack:{protocol:2,
  eventId:r.body.eventId,operation:"training.complete.practice",state:"COMMITTED",replayed:true,serverRevision:"1",
  result:{...("courseId" in r.body ? {courseId:r.body.courseId} : "scheduleId" in r.body ? {scheduleId:r.body.scheduleId} : {}),allCompleted:false,stepJustCompleted:true}}});
describe("stable practice replay",()=>{
  it("sends exact bound IDs and removes only after a correlated committed receipt",async()=>{
    const {queue,binding}=await fixture();
    const saved=await queue.enqueue("progress","completePracticeStep",payload);
    const send:ProgressReplayTransport=async r=>{
      expect(r.body).toMatchObject({...payload,eventId:saved.eventId});
      expect(r.headers["Idempotency-Key"]).toBe(saved.eventId);
      return ack(r);
    };
    expect(await replayProgressJournal(queue,binding,()=>true,send,vi.fn())).toEqual({committed:1,pending:false});
    expect(await queue.getPending("progress")).toEqual([]);
    expect(queue.wasPracticeAcknowledged(saved.eventId,binding)).toBe(true);
  });
  it("replays a bound theory completion using its own operation and rejects a practice ACK", async () => {
    const {queue,binding}=await fixture();
    const saved=await queue.enqueue("progress","completeTheoryStep",payload);
    const wrong:ProgressReplayTransport=async r=>{
      expect(r.body.operation).toBe("training.complete.theory");
      expect(r.body.eventId).toBe(saved.eventId);
      return ack(r);
    };
    expect(await replayProgressJournal(queue,binding,()=>true,wrong,vi.fn())).toEqual({committed:0,pending:true});
    const right:ProgressReplayTransport=async r=>({...ack(r),ack:{...ack(r).ack,operation:r.body.operation}});
    expect(await replayProgressJournal(queue,binding,()=>true,right,vi.fn())).toEqual({committed:1,pending:false});
    expect(await queue.getPending("progress")).toEqual([]);
  });
  it("processes a daily completion through the same FIFO and binds the schedule in its ACK", async () => {
    const {queue,binding}=await fixture();
    await queue.enqueue("progress","dailyCourseCompleteStep",{
      scheduleId: "clwschedule000000000000001",stepIndex:0,
      expectedBundleStepId: "clwbundle0000000000000001",expectedStepId:payload.expectedStepId,
    });
    await queue.enqueue("progress","completePracticeStep",payload);
    const order:string[]=[];
    const send:ProgressReplayTransport=async r=>{
      order.push(r.body.operation);
      return {...ack(r),ack:{...ack(r).ack,operation:r.body.operation}};
    };
    expect(await replayProgressJournal(queue,binding,()=>true,send,vi.fn())).toEqual({committed:2,pending:false});
    expect(order).toEqual(["daily.complete","training.complete.practice"]);
  });
  it.each(["startStep","completePracticeStep"])("never skips an earlier unsupported %s",async kind=>{
    const {queue,binding}=await fixture();
    await queue.enqueue("progress",kind,{courseId:payload.courseId,dayOnCourseId:payload.dayOnCourseId,stepIndex:0});
    await queue.enqueue("progress","completePracticeStep",payload);
    const send=vi.fn();
    expect(await replayProgressJournal(queue,binding,()=>true,send,vi.fn())).toEqual({committed:0,pending:true});
    expect(send).not.toHaveBeenCalled();
    expect(await queue.getPending("progress")).toHaveLength(2);
  });
  it("keeps an event after stale occurrence rejection or wrong ACK",async()=>{
    const {queue,binding}=await fixture();
    await queue.enqueue("progress","completePracticeStep",payload);
    await replayProgressJournal(queue,binding,()=>true,async()=>({success:false,code:"INVALID_STATE"}),vi.fn());
    await replayProgressJournal(queue,binding,()=>true,async r=>({...ack(r),ack:{...ack(r).ack,eventId:randomUUID()}}),vi.fn());
    expect(await queue.getPending("progress")).toHaveLength(1);
  });
});

describe("versioned progress replay",()=>{
  it("chains timer commands without rewriting event IDs",async()=>{
    const {queue,binding}=await fixture();
    const start=await queue.enqueue("progress","startStep",{...payload,durationSec:90,status:"IN_PROGRESS",offlineProgressVersion:"none"});
    await queue.enqueue("progress","pauseStep",{...payload,timeLeftSec:70,offlineProgressVersion:"none"});
    const send:ProgressReplayTransport=async r=>{
      expect(r.body.operation).toBe("training.timer");
      if(r.body.operation!=="training.timer")throw Error("wrong operation");
      if(r.body.action==="start")expect(r.body.expectedVersion).toBe("none");
      else expect(r.body.previousEventId).toBe(start.eventId);
      return {success:true,ack:{protocol:2,eventId:r.body.eventId,operation:r.body.operation,state:"COMMITTED",
        replayed:false,serverRevision:"1",result:{courseId:payload.courseId,progressVersion:"a".repeat(64),allCompleted:false,stepJustCompleted:false}}};
    };
    expect(await replayProgressJournal(queue,binding,()=>true,send,vi.fn())).toEqual({committed:2,pending:false});
  });
  it("persists acknowledged video snapshot and uses it as next baseline",async()=>{
    const {queue,binding}=await fixture();
    await queue.videoSnapshot("video-1",binding,{lastPositionSec:0,progressVersion:"none"});
    await queue.enqueue("progress","saveVideoProgress",{videoId:"video-1",positionSec:42,updatedAt:Date.now()});
    const send:ProgressReplayTransport=async r=>{
      if(r.body.operation!=="video.progress")throw Error("wrong operation");
      expect(r.body.expectedVersion).toBe("none");
      return {success:true,ack:{protocol:2,eventId:r.body.eventId,operation:r.body.operation,state:"COMMITTED",
        replayed:false,serverRevision:"1",result:{videoId:"video-1",lastPositionSec:42,progressVersion:"a".repeat(64)}}};
    };
    expect(await replayProgressJournal(queue,binding,()=>true,send,vi.fn())).toEqual({committed:1,pending:false});
    expect(await queue.videoSnapshot("video-1",binding)).toEqual({lastPositionSec:42,progressVersion:"a".repeat(64)});
    const next=await queue.enqueue("progress","saveVideoProgress",{videoId:"video-1",positionSec:45,updatedAt:Date.now()});
    expect(next.payload.expectedVersion).toBe("a".repeat(64));
    await queue.endSession();
    expect(await queue.videoSnapshot("video-1",binding)).toBeNull();
  });
});
