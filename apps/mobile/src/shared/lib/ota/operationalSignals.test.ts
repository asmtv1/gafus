import { afterEach, describe, expect, it, vi } from "vitest";
import { createMandatoryOtaAttemptMonitor, detectOtaSignatureRejection,
  hasOtaSignatureRejection, retireMandatoryOtaAttemptMarker, MANDATORY_OTA_INCOMPLETE_MS } from "./operationalSignals";

afterEach(() => vi.useRealTimers());
describe("native OTA signature evidence", () => {
  it("accepts exact signature codes inside the active attempt only", () => {
    const entry = {code:"UpdateHasInvalidSignature",timestamp:1500,updateId:"update-a"};
    expect(hasOtaSignatureRejection([entry],1000,2000,"UPDATE-A")).toBe(true);
    expect(hasOtaSignatureRejection([{...entry,code:"UpdateCodeSigningError"}],1000,2000)).toBe(true);
    expect(hasOtaSignatureRejection([entry],1600,2000)).toBe(false);
    expect(hasOtaSignatureRejection([entry],1000,1400)).toBe(false);
    expect(hasOtaSignatureRejection([entry],1000,2000,"update-b")).toBe(false);
    expect(hasOtaSignatureRejection([{...entry,code:"UpdateServerUnreachable"}],1000,2000)).toBe(false);
    expect(hasOtaSignatureRejection([{...entry,code:"Unknown"}],1000,2000)).toBe(false);
  });
  it("does not report unreadable logs or an old session after native await", async () => {
    const report=vi.fn();
    await detectOtaSignatureRejection({startedAt:1000,endedAt:2000,readLogs:async()=>{throw Error("unknown");},isCurrent:()=>true,report});
    await detectOtaSignatureRejection({startedAt:1000,endedAt:2000,readLogs:async()=>[{code:"UpdateCodeSigningError",timestamp:1500}],isCurrent:vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false),report});
    expect(report).not.toHaveBeenCalled();
    await detectOtaSignatureRejection({startedAt:1000,endedAt:2000,readLogs:async()=>[{code:"UpdateCodeSigningError",timestamp:1500}],isCurrent:()=>true,report});
    expect(report).toHaveBeenCalledOnce();
  });
});

function fixture(initial: string | null = null) {
  let stored=initial;
  const storage={getItem:vi.fn(async()=>stored),setItem:vi.fn(async(_key:string,value:string)=>{stored=value;})};
  const emit=vi.fn(),reportIncomplete=vi.fn();
  let current=true;
  const create=(target="1.7.5-ota.6")=>createMandatoryOtaAttemptMonitor({key:"target",target,storage,isCurrent:()=>current,emit,reportIncomplete});
  return {storage,emit,reportIncomplete,create,stale:()=>{current=false;},stored:()=>stored};
}
describe("mandatory OTA attempt diagnostics", () => {
  it("reports immediate failure once even after timeout, then marks it reported", async () => {
    vi.useFakeTimers();
    const f=fixture(),monitor=f.create();
    await monitor.start();
    monitor.incomplete();
    await vi.advanceTimersByTimeAsync(MANDATORY_OTA_INCOMPLETE_MS);
    expect(f.emit.mock.calls).toEqual([["MANDATORY_ATTEMPT"],["MANDATORY_INCOMPLETE"]]);
    expect(f.reportIncomplete).toHaveBeenCalledOnce();
    expect(f.stored()).toBe("reported:1.7.5-ota.6");
    monitor.dispose();
  });
  it("reports a hung check once without unlocking or reloading", async () => {
    vi.useFakeTimers();
    const f=fixture(),monitor=f.create();
    await monitor.start();
    await vi.advanceTimersByTimeAsync(MANDATORY_OTA_INCOMPLETE_MS-1);
    expect(f.reportIncomplete).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.reportIncomplete).toHaveBeenCalledOnce();
    monitor.incomplete();
    expect(f.reportIncomplete).toHaveBeenCalledOnce();
    monitor.dispose();
  });
  it("detects an interrupted same-target attempt on a later verified check", async () => {
    const f=fixture(),first=f.create();
    await first.start();first.dispose();
    const second=f.create();await second.start();
    expect(f.emit.mock.calls).toEqual([["MANDATORY_ATTEMPT"],["MANDATORY_INCOMPLETE"],["MANDATORY_ATTEMPT"]]);
    second.incomplete();second.dispose();
    const third=f.create();await third.start();third.dispose();
    expect(f.emit.mock.calls.at(-1)).toEqual(["MANDATORY_ATTEMPT"]);
    expect(f.reportIncomplete).toHaveBeenCalledTimes(2);
  });
  it("does not report a superseded revision or an already satisfied policy", async () => {
    const f=fixture("pending:1.7.5-ota.5");
    const m=f.create();await m.start();m.dispose();
    expect(f.reportIncomplete).not.toHaveBeenCalled();
    await retireMandatoryOtaAttemptMarker(f.storage,"target",()=>true);
    expect(f.stored()).toBe("idle");
    const next=f.create();await next.start();next.dispose();
    expect(f.reportIncomplete).not.toHaveBeenCalled();
  });
  it("does not report after a session switch and stops the timeout on dispose", async () => {
    vi.useFakeTimers();
    const f=fixture(),monitor=f.create();await monitor.start();f.stale();
    await vi.advanceTimersByTimeAsync(MANDATORY_OTA_INCOMPLETE_MS);
    expect(f.emit.mock.calls).toEqual([["MANDATORY_ATTEMPT"]]);
    monitor.dispose();
    const g=fixture(),disposed=g.create();await disposed.start();disposed.dispose();
    await vi.advanceTimersByTimeAsync(MANDATORY_OTA_INCOMPLETE_MS);
    expect(g.reportIncomplete).not.toHaveBeenCalled();
  });
  it("does not block the update on a storage error", async () => {
    const f=fixture();f.storage.getItem.mockRejectedValueOnce(Error("disk"));f.storage.setItem.mockRejectedValueOnce(Error("disk"));
    const m=f.create();await m.start();m.incomplete();m.dispose();
    expect(f.emit.mock.calls).toEqual([["MANDATORY_ATTEMPT"],["MANDATORY_INCOMPLETE"]]);
  });
});
