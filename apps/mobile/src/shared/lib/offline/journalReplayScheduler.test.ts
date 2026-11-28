import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJournalReplayScheduler, isTransientJournalResult } from "./journalReplayScheduler";
const done = { pending: false, madeProgress: false, transient: false };
const retry = { pending: true, madeProgress: false, transient: true };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("journal lifecycle", () => {
  it("retries a transport failure while active, and stops after success", async () => {
    const drain = vi.fn().mockResolvedValueOnce(retry).mockResolvedValueOnce(done);
    const scheduler = createJournalReplayScheduler(() => true, drain);
    scheduler.trigger();
    await vi.advanceTimersByTimeAsync(1000);
    expect(drain).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(drain).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(120000);
    expect(drain).toHaveBeenCalledTimes(2);
  });
  it("coalesces writes during a drain and continues only after it settles", async () => {
    let resolve!: (v: typeof done) => void;
    const drain = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue(done);
    const scheduler = createJournalReplayScheduler(() => true, drain);
    scheduler.trigger();
    await vi.advanceTimersByTimeAsync(1000);
    scheduler.trigger();
    scheduler.trigger();
    await vi.advanceTimersByTimeAsync(20000);
    expect(drain).toHaveBeenCalledTimes(1);
    resolve(done);
    await vi.advanceTimersByTimeAsync(1000);
    expect(drain).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });
  it("stops on a permanent conflict and on an owner fence", async () => {
    let current = true;
    const drain = vi.fn().mockResolvedValue({ pending: true, madeProgress: false, transient: false });
    const scheduler = createJournalReplayScheduler(() => current, drain);
    scheduler.trigger();
    await vi.advanceTimersByTimeAsync(60000);
    expect(drain).toHaveBeenCalledTimes(1);
    scheduler.trigger();
    current = false;
    await vi.advanceTimersByTimeAsync(60000);
    expect(drain).toHaveBeenCalledTimes(1);
    expect(isTransientJournalResult({success:false,code:"STALE_PROGRESS_VERSION"})).toBe(false);
    expect(isTransientJournalResult({success:false,code:"JOURNAL_UNAVAILABLE"})).toBe(true);
  });
  it("limits repeated transient retries and cancels timers on dispose", async () => {
    const drain = vi.fn().mockResolvedValue(retry);
    const scheduler = createJournalReplayScheduler(() => true, drain);
    scheduler.trigger();
    await vi.advanceTimersByTimeAsync(600000);
    expect(drain).toHaveBeenCalledTimes(6);
    scheduler.trigger();
    scheduler.dispose();
    await vi.advanceTimersByTimeAsync(60000);
    expect(drain).toHaveBeenCalledTimes(6);
  });
});
