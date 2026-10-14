import { describe, expect, it, vi } from "vitest";
import { processOneMediaCdnPurge, type EdgePurgeDeps, type EdgePurgeJob } from "./media-cdn-purge-worker";
const path = "/posts/owner/post/attachments/m/full.webp";
const makeJob = (): EdgePurgeJob => ({
  id: "feed:job123", scope: "feed", paths: [path], purgeOperations: [],
  attemptToken: "01234567-0123-4123-8123-0123456789ab", attempts: 1,
});
function fixture(job = makeJob()) {
  const claim = vi.fn().mockResolvedValue(job);
  const checkpoint = vi.fn().mockImplementation(async (_job: EdgePurgeJob, ops: string[]) => { job.purgeOperations = ops; });
  const complete = vi.fn();
  const retry = vi.fn();
  const begin = vi.fn().mockImplementation(async (_scope: string, _paths: string[], ops: string[], cb?: (ops: string[]) => Promise<void>) => {
    if (ops.length) return ops;
    const created = ["beget:accepted-batch"];
    await cb?.(created);
    return created;
  });
  const done = vi.fn().mockResolvedValue(true);
  const deps: EdgePurgeDeps = { claim, checkpoint, complete, retry, begin: begin as never, done: done as never, now: () => 0 };
  return { deps, claim, checkpoint, complete, retry, begin, done, job };
}
describe("separately leased Beget purge worker", () => {
  it("checkpoints provider submission before acknowledging a completed S3 deletion", async () => {
    const x = fixture();
    expect(await processOneMediaCdnPurge(x.deps)).toBe("done");
    expect(x.checkpoint).toHaveBeenCalledOnce();
    expect(x.done).toHaveBeenCalledWith("beget:accepted-batch");
    expect(x.complete).toHaveBeenCalledOnce();
    expect(x.retry).not.toHaveBeenCalled();
  });
  it("never confirms revocation before a real edge proof", async () => {
    const x = fixture();
    x.done.mockResolvedValue(false);
    expect(await processOneMediaCdnPurge(x.deps)).toBe("pending");
    expect(x.complete).not.toHaveBeenCalled();
    expect(x.retry).toHaveBeenCalledWith(x.job, "MEDIA_PURGE_PENDING", 60_000);
    // Exactly-once batch checkpoint prevents API replay on the next attempt.
    expect(await processOneMediaCdnPurge(x.deps)).toBe("pending");
    expect(x.begin).toHaveBeenLastCalledWith("feed", [path], ["beget:accepted-batch"], expect.any(Function));
  });
  it("rejects malformed/foreign keys without contacting Beget and retries", async () => {
    const x = fixture({ ...makeJob(), paths: ["/albums/foreign/album/photos/p/full.webp"] });
    expect(await processOneMediaCdnPurge(x.deps)).toBe("pending");
    expect(x.begin).not.toHaveBeenCalled();
    expect(x.retry).toHaveBeenCalledOnce();
    expect(x.complete).not.toHaveBeenCalled();
  });
  it("handles provider failure without losing durable progress", async () => {
    const x = fixture();
    x.done.mockRejectedValue(new Error("connection closed"));
    expect(await processOneMediaCdnPurge(x.deps)).toBe("pending");
    expect(x.checkpoint).toHaveBeenCalledOnce();
    expect(x.complete).not.toHaveBeenCalled();
    expect(x.retry).toHaveBeenCalledWith(x.job, "MEDIA_PURGE_RETRY", expect.any(Number));
  });
  it("does nothing when no due jobs exist", async () => {
    const x = fixture();
    x.claim.mockResolvedValue(undefined);
    expect(await processOneMediaCdnPurge(x.deps)).toBe("empty");
    expect(x.begin).not.toHaveBeenCalled();
  });
});
