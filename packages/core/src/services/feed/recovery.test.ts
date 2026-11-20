import { describe, expect, it, vi } from "vitest";
import { createFeedUploadRecovery, type FeedRecoveryCandidate } from "./recovery";
const at = new Date("2026-10-09T12:00:00Z");
const upload: FeedRecoveryCandidate = {
  id: "upload", ownerId: "owner", postId: "post", mediaId: "media",
  sourceKey: "posts/owner/post/incoming/upload/source.mp4",
  declaredBytes: 100, declaredMime: "video/mp4",
};
function setup(options: { missing?: boolean; mismatch?: boolean; claimed?: boolean; failure?: boolean } = {}) {
  const head = vi.fn(async () => {
    if (options.failure) throw new Error("storage unavailable");
    return options.missing ? null : { etag: "etag", bytes: options.mismatch ? 50 : 100, contentType: "video/mp4" };
  });
  const findReservedUploads = vi.fn(async () => [upload]);
  const rotateReservedUpload = vi.fn(async () => {});
  const confirmVerifiedSource = vi.fn(async () => !options.claimed);
  const recovery = createFeedUploadRecovery({ rows: {
    findReservedUploads, rotateReservedUpload, confirmVerifiedSource,
  }, storage: { head }, now: () => at });
  return { recovery, head, findReservedUploads, rotateReservedUpload, confirmVerifiedSource };
}
describe("feed upload recovery policy separated from SQL", () => {
  it("checks registered source HEAD and creates no process job outside the SQL port", async () => {
    const x = setup();
    expect(await x.recovery.run()).toEqual({ recovered: 1 });
    expect(x.findReservedUploads).toHaveBeenCalledExactlyOnceWith(at, 20);
    expect(x.head).toHaveBeenCalledExactlyOnceWith(upload.sourceKey);
    expect(x.confirmVerifiedSource).toHaveBeenCalledExactlyOnceWith(upload, "etag", expect.any(Function));
  });
  it("does not count a fenced, deleted or already claimed candidate", async () => {
    const x = setup({ claimed: true });
    expect(await x.recovery.run()).toEqual({ recovered: 0 });
    expect(x.rotateReservedUpload).not.toHaveBeenCalled();
  });
  it.each([{ missing: true }, { mismatch: true }])("rotates unverified source %s without claiming", async options => {
    const x = setup(options);
    expect(await x.recovery.run()).toEqual({ recovered: 0 });
    expect(x.rotateReservedUpload).toHaveBeenCalledExactlyOnceWith("upload", at);
    expect(x.confirmVerifiedSource).not.toHaveBeenCalled();
  });
  it("storage failures do not claim or rotate a candidate", async () => {
    const x = setup({ failure: true });
    expect(await x.recovery.run()).toEqual({ recovered: 0 });
    expect(x.confirmVerifiedSource).not.toHaveBeenCalled();
    expect(x.rotateReservedUpload).not.toHaveBeenCalled();
  });
  it.each([0, -1, 21, 1.2])("rejects out-of-range batch %s before reading SQL", async limit => {
    const x = setup();
    await expect(x.recovery.run(limit)).rejects.toThrow("INVALID_FEED_BATCH_SIZE");
    expect(x.findReservedUploads).not.toHaveBeenCalled();
  });
});
