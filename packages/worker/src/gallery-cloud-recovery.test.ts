import { describe, it, expect, vi } from "vitest";
import { createGalleryCloudRecoveryTick } from "./gallery-cloud-recovery";
const now = new Date("2026-11-02T10:00:00Z");
function setup(due: boolean) {
  const hasDue = vi.fn(async () => due);
  const dispatch = vi.fn(async () => ({ dispatched: 1 }));
  return { hasDue, dispatch,
    tick: createGalleryCloudRecoveryTick({ hasDue, dispatch: dispatch as never, now: () => now }) };
}
describe("Gallery scheduled cloud wake-up", () => {
  it("does not launch an empty paid job", async () => {
    const x = setup(false);
    await expect(x.tick()).resolves.toEqual({ dispatched: 0 });
    expect(x.hasDue).toHaveBeenCalledExactlyOnceWith(now);
    expect(x.dispatch).not.toHaveBeenCalled();
  });
  it("launches a due Gallery job once per tick", async () => {
    const x = setup(true);
    await expect(x.tick()).resolves.toEqual({ dispatched: 1 });
    expect(x.dispatch).toHaveBeenCalledOnce();
  });
  it("retries failure on the next tick and preserves Core eligibility", async () => {
    const x = setup(true);
    x.dispatch.mockRejectedValueOnce(new Error("CLOUDRU_JOB_IAM_NETWORK_EAI_AGAIN"));
    await expect(x.tick()).rejects.toThrow("CLOUDRU_JOB_IAM_NETWORK_EAI_AGAIN");
    await expect(x.tick()).resolves.toEqual({ dispatched: 1 });
    expect(x.dispatch).toHaveBeenCalledTimes(2);
  });
  it("prevents overlapping dispatches", async () => {
    let finish!: (value: boolean) => void;
    const pending = new Promise<boolean>(resolve => { finish = resolve; });
    const hasDue = vi.fn(() => pending);
    const dispatch = vi.fn(async () => ({ dispatched: 1 }));
    const tick = createGalleryCloudRecoveryTick({ hasDue, dispatch: dispatch as never });
    const first = tick();
    await expect(tick()).resolves.toEqual({ skipped: true, dispatched: 0 });
    finish(true);
    await expect(first).resolves.toEqual({ dispatched: 1 });
    expect(dispatch).toHaveBeenCalledOnce();
  });
});
