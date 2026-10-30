// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrapBoundTrainingTimers, registerBoundTrainingTimer,
  cancelBoundTrainingTimer } from "./trainingGlobalTimer";

const mkEntry=(actor:string,offsetMs:number)=>({
  actor,courseType:"IMPULSE_CONTROL",courseId:"course_01",
  dayOnCourseId:"day_01",trainingDayId:"physical_01",
  stepId:"step_01",stepOnDayId:"occurrence_01",stepIndex:0,
  expiresAt:new Date(Date.now()+offsetMs).toISOString(),
});
function ok(data:unknown) {
  return new Response(JSON.stringify({success:true,data}),{status:200,
    headers:{"Content-Type":"application/json"}});
}
const wait = () => new Promise(resolve=>setTimeout(resolve,65));
afterEach(()=>{vi.unstubAllGlobals();sessionStorage.clear();});
describe("app-lifetime verified timer across navigation",()=>{
  it("does exactly one reauthenticated Hono bound complete after component unmount",async()=>{
    const actor="owner_global_01";
    let completed=false;
    const fetcher=vi.fn(async(url:string,req:RequestInit)=>{
      if(url==="/api/v1/auth/me") return ok({id:actor,username:"fixture",role:"USER"});
      if(url.startsWith("/api/v1/training/day?")) return ok({
        courseId:"course_01",dayOnCourseId:"day_01",trainingDayId:"physical_01",
        onlineStepBinding:"STEP_ON_DAY_ID_V1",serverNow:new Date().toISOString(),
        steps:[{id:"step_01",stepOnDayId:"occurrence_01",title:"Таймер",
          order:0,locked:false,durationSec:1,type:"TRAINING",
          status:completed?"COMPLETED":"IN_PROGRESS",isPausedOnServer:false,
          remainingSecOnServer:completed?null:1,
          timerSnapshot: {remainingSecAtServerNow:completed?null:0,
            expiresAt:completed?null:new Date(Date.now()-1500).toISOString()}}],
      });
      if(url==="/api/v1/training/step/complete/practice") {
        const body=JSON.parse(String(req.body)) as Record<string,unknown>;
        expect(body).toMatchObject({stepIndex:0,
          expectedStepOnDayId:"occurrence_01",expectedStepId:"step_01"});
        completed=true;
        return ok(undefined);
      }
      throw Error("UNEXPECTED_TIMER_REQUEST");
    });
    vi.stubGlobal("fetch",fetcher);
    bootstrapBoundTrainingTimers(actor);
    registerBoundTrainingTimer(mkEntry(actor,-1500));
    await wait();
    expect(completed).toBe(true);
    expect(fetcher.mock.calls.filter(([url])=>
      url==="/api/v1/training/step/complete/practice")).toHaveLength(1);
    cancelBoundTrainingTimer(mkEntry(actor,0));
  });
  it("never writes for an actor different from the verified /auth/me principal",async()=>{
    const actor="owner_global_02";
    const fetcher=vi.fn(async (url:string)=>{
      if(url==="/api/v1/auth/me") return ok({id:"other_actor",username:"other",role:"USER"});
      throw Error("ILLEGAL_PRIVATE_TIMER_REQUEST");
    });
    vi.stubGlobal("fetch",fetcher);
    bootstrapBoundTrainingTimers(actor);
    registerBoundTrainingTimer(mkEntry(actor,-100));
    await wait();
    expect(fetcher.mock.calls.some(([url])=>url.includes("/training/"))).toBe(false);
  });
});
