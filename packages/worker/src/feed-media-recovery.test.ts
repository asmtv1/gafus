import { describe, expect, it, vi } from "vitest";
import { createFeedMediaRecoveryTick } from "./feed-media-recovery";

const clock = () => new Date("2026-10-28T00:00:00.000Z");
type Group = { kind: "publish_photo" | "publish_video" | "copy_album" | "delete_keys" | "cleanup_source"; _count: { _all: number } };
function setup(groups: Group[]) {
  const groupBy = vi.fn(async () => groups);
  const video = vi.fn(async () => ({ dispatched: 1 }));
  const run = createFeedMediaRecoveryTick({
    database: { feedStorageJob: { groupBy } } as never,
    video: video as never, now: clock,
  });
  return { run, groupBy, video };
}
describe("Feed recovery only launches a Cloud pool for due durable media tasks", () => {
  it("does not start any Cloud Job when the PostgreSQL queue is empty", async () => {
    const s = setup([]);
    expect(await s.run()).toEqual({ dispatched: 0 });
    expect(s.video).not.toHaveBeenCalled();
    expect(s.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ["kind"],
      where: { OR: [
        { status: "pending", availableAt: { lte: clock() } },
        { status: "processing", leaseUntil: { lt: clock() } },
      ] },
    }));
  });
  it("ignores retired photos and starts at most two video Jobs", async () => {
    const s = setup([
      { kind: "publish_photo", _count: { _all: 3 } },
      { kind: "publish_video", _count: { _all: 5 } },
    ]);
    expect(await s.run()).toEqual({ dispatched: 2 });
    expect(s.video).toHaveBeenCalledTimes(2);
  });
  it("never launches Cloud VIDEO just to delete files or clean sources", async () => {
    const s = setup([
      { kind: "cleanup_source", _count: { _all: 1 } },
      { kind: "delete_keys", _count: { _all: 2 } },
      { kind: "copy_album", _count: { _all: 1 } },
    ]);
    expect(await s.run()).toEqual({ dispatched: 0 });
    expect(s.video).not.toHaveBeenCalled();
  });
  it("does not acknowledge failed provider dispatch or start another replica after error", async () => {
    const s = setup([{ kind: "publish_video", _count: { _all: 2 } }]);
    s.video.mockRejectedValueOnce(new Error("CLOUDRU_503"));
    await expect(s.run()).rejects.toThrow("CLOUDRU_503");
    expect(s.video).toHaveBeenCalledOnce();
  });
  it("suppresses a simultaneous second tick while first database scan is unresolved", async () => {
    let done!: (value: Group[]) => void;
    const groupBy = vi.fn(async () => new Promise<Group[]>(resolve => { done = resolve; }));
      const video = vi.fn(async () => ({ dispatched: 1 }));
    const run = createFeedMediaRecoveryTick({
      database: { feedStorageJob: { groupBy } } as never,
      video: video as never, now: clock,
    });
    const first = run();
    expect(await run()).toEqual({ skipped: true, dispatched: 0 });
    expect(groupBy).toHaveBeenCalledOnce();
    done([{ kind: "publish_video", _count: { _all: 1 } }]);
    expect(await first).toEqual({ dispatched: 1 });
    expect(video).toHaveBeenCalledOnce();
  });
});
