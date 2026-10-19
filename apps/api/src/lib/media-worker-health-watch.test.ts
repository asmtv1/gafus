import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@gafus/core/services/systemHealth",()=>({
  notifyStoppedMediaWorker:vi.fn(),
}));
vi.mock("@gafus/logger",()=>({
  createWebLogger:()=>({warn:vi.fn(),error:vi.fn()}),
}));
import { startMediaWorkerHealthWatch } from "./media-worker-health-watch";

afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
describe("independent API media Worker outage polling",()=>{
  it("does not schedule checks when Cloud.ru media jobs disabled",async()=>{
    vi.useFakeTimers();
    const check=vi.fn();
    startMediaWorkerHealthWatch(false,check);
    await vi.advanceTimersByTimeAsync(30*60_000);
    expect(check).not.toHaveBeenCalled();
  });
  it("gives Worker 12 minutes to publish first heartbeat, repeats at five-minute intervals",async()=>{
    vi.useFakeTimers();
    const check=vi.fn(async()=>({stopped:true,alerted:true}));
    const stop=startMediaWorkerHealthWatch(true,check);
    await vi.advanceTimersByTimeAsync(11*60_000);
    expect(check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5*60_000);
    expect(check).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(20*60_000);
    expect(check).toHaveBeenCalledTimes(2);
  });
});
