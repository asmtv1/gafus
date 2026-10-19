import { afterEach, describe, expect, it, vi } from "vitest";
import { runGalleryOneShot } from "./job-lifecycle.js";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Cloud.ru Gallery one-shot lifecycle", () => {
  it("settles successfully, marks exit 0, and closes lingering handles", async () => {
    vi.useFakeTimers();
    const exit=vi.fn(), code=vi.fn(), report=vi.fn();
    const operation=vi.fn(async()=>({done:true}));
    const run=runGalleryOneShot(operation,{exit,exitCode:code,report});
    expect(await run).toBe(0);
    expect(code).toHaveBeenCalledWith(0);
    expect(report).toHaveBeenCalledWith("gallery_invocation_completed", expect.any(Object));
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(exit).toHaveBeenCalledWith(0);
    await vi.advanceTimersByTimeAsync(110_000);
    expect(exit).toHaveBeenCalledTimes(1);
  });
  it("sets exit 1 on failed maintenance without exposing exception messages", async () => {
    vi.useFakeTimers();
    const exit=vi.fn(), code=vi.fn(), report=vi.fn();
    expect(await runGalleryOneShot(async()=>{
      throw Error("secret S3 URL must not log");
    }, {exit,exitCode:code,report})).toBe(1);
    expect(code).toHaveBeenCalledWith(1);
    expect(JSON.stringify(report.mock.calls)).not.toContain("secret");
    expect(report).toHaveBeenCalledWith("gallery_invocation_failed", expect.any(Object));
    await vi.advanceTimersByTimeAsync(1000);
    expect(exit).toHaveBeenCalledWith(1);
  });
  it("forces exit before 120s Cloud.ru timeout if work never settles", async () => {
    vi.useFakeTimers();
    const exit=vi.fn(), report=vi.fn(), code=vi.fn();
    const run=runGalleryOneShot(()=>new Promise(()=>{}),{exit,report,exitCode:code});
    await vi.advanceTimersByTimeAsync(109_999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(report).toHaveBeenCalledWith("gallery_invocation_hard_timeout", expect.any(Object));
    void run; // Real runtime exits immediately; pending Promise is expected here.
  });
});
