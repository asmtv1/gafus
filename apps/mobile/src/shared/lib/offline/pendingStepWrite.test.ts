import { describe, expect, it } from "vitest";
import { hasEarlierStepCommand, hasPendingStepWrite } from "./pendingStepWrite";

const step={courseId:"course",dayOnCourseId:"day",stepIndex:0,expectedStepOnDayId:"occurrence",expectedStepId:"step"};
const event=(payload:Record<string,unknown>)=>({eventId:"event",createdAt:1,kind:"startStep",payload});
describe("progress command ordering",()=>{
  it("matches exact occurrence even when its index changed",()=>{
    expect(hasEarlierStepCommand([event(step)],{...step,stepIndex:3})).toBe(true);
    expect(hasEarlierStepCommand([event(step)],{...step,expectedStepOnDayId:"different"})).toBe(false);
    expect(hasEarlierStepCommand([event(step)],{...step,dayOnCourseId:"different"})).toBe(false);
  });
  it("quarantined historical index can block but is not bound to a new occurrence",()=>{
    expect(hasEarlierStepCommand([event({courseId:"course",dayOnCourseId:"day",stepIndex:0})],step)).toBe(true);
  });
  it("does not dispatch after the binding changes while reading pending entries",async()=>{
    let binding={schemaVersion:2 as const,principalId:"a",authEpoch:"old"};
    await expect(hasPendingStepWrite({
      getVerifiedBinding:()=>binding,
      getPending:async()=>{binding={...binding,principalId:"b",authEpoch:"new"};return [event(step)];},
    },step)).rejects.toThrow("V2_SESSION_CHANGED");
  });
});
