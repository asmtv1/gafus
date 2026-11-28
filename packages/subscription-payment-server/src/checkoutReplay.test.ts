import {describe,it,expect} from "vitest";
import {canReplayInitialCheckout, frozenCheckoutIntervalDays} from "./checkoutReplay";
const now = new Date("2026-11-27T12:00:00Z");
const input = {idempotenceKey:"appsub-init:stable",returnUrl:"https://example.test/subscription?paid=1",
  createdAt:new Date(now.getTime()-120_000),lastAttemptAt:new Date(now.getTime()-30_000),attemptCount:1,now};
describe("frozen checkout retry",()=>{
  it("allows bounded replay of an exact persisted request after cooldown",()=>{
    expect(canReplayInitialCheckout(input)).toBe(true);
    expect(canReplayInitialCheckout({...input,attemptCount:2})).toBe(true);
  });
  it("rejects legacy/unrelated/overdue/in-flight/exhausted attempts",()=>{
    for(const change of [{returnUrl:null},{idempotenceKey:"renewal:x"},{attemptCount:3},
      {createdAt:new Date(now.getTime()-600_000)},{lastAttemptAt:new Date(now.getTime()-29_999)},
      {createdAt:new Date(now.getTime()+1)}]) expect(canReplayInitialCheckout({...input,...change})).toBe(false);
  });
  it("uses frozen historical duration, not current tariff name",()=>{
    expect(frozenCheckoutIntervalDays(now,new Date(now.getTime()+90*86_400_000))).toBe(90);
    expect(frozenCheckoutIntervalDays(now,new Date(now.getTime()+30*86_400_000))).toBe(30);
    expect(frozenCheckoutIntervalDays(now,new Date(now.getTime()+1))).toBeNull();
    expect(frozenCheckoutIntervalDays(null,now)).toBeNull();
  });
});
