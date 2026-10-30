import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.api }));
import { feedSaveRevisionGuarded, feedPublishPostGuarded } from "./feed";
const revision = {
  clientRequestId: "123e4567-e89b-12d3-a456-426614174000",
  expectedVersion: 2,
  text: "Изменили",
  attachmentIds: ["asset-1"],
};
const publish = { clientRequestId: "123e4567-e89b-12d3-a456-426614174001" };
const ack = {
  id: "post/A",
  version: 3,
  author: { id: "A" },
  pendingRevision: { id: "rev-3", status: "draft", text: "Изменили", attachmentIds: ["asset-1"] },
};
beforeEach(() => {
  m.api.mockReset().mockResolvedValue({ success: true, data: ack });
});
describe("V86 existing Feed edit-only guarded revision/publish API", () => {
  it("uses encoded existing PUT revisions route with exactly expectedVersion/text/attachments/requestId", async () => {
    const guard = vi.fn(() => true);
    await expect(feedSaveRevisionGuarded("post/A", revision, guard)).resolves.toEqual(ack);
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/posts/post%2FA/revisions",
      expect.objectContaining({
        method: "PUT",
        body: revision,
        requestGuard: guard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      }),
    );
  });
  it("uses encoded existing POST publish with exact clientRequestId-only body", async () => {
    const result = { ...ack, pendingRevision: { ...ack.pendingRevision, status: "pending" } };
    m.api.mockResolvedValueOnce({ success: true, data: result });
    await expect(feedPublishPostGuarded("post/A", publish, () => true)).resolves.toEqual(result);
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/feed/posts/post%2FA/publish",
      expect.objectContaining({
        method: "POST",
        body: publish,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      }),
    );
  });
  it("missing verified principal prevents both mutation calls", async () => {
    await expect(feedSaveRevisionGuarded("post-A", revision, () => false)).rejects.toThrow(
      "FEED_EDIT_REVISION_SESSION_CHANGED",
    );
    await expect(feedPublishPostGuarded("post-A", publish, () => false)).rejects.toThrow(
      "FEED_EDIT_PUBLISH_SESSION_CHANGED",
    );
    expect(m.api).not.toHaveBeenCalled();
  });
  it("actor changes during revision PUT: positive response is fenced", async () => {
    let live = true,
      resolve!: (value: unknown) => void;
    m.api.mockImplementationOnce(
      () =>
        new Promise((ok) => {
          resolve = ok;
        }),
    );
    const pending = feedSaveRevisionGuarded("post-A", revision, () => live);
    await vi.waitFor(() => expect(m.api).toHaveBeenCalledOnce());
    live = false;
    resolve({ success: true, data: ack });
    await expect(pending).rejects.toThrow("FEED_EDIT_REVISION_SESSION_CHANGED");
  });
  it("actor changes during publish POST: positive response is fenced", async () => {
    let live = true,
      resolve!: (value: unknown) => void;
    m.api.mockImplementationOnce(
      () =>
        new Promise((ok) => {
          resolve = ok;
        }),
    );
    const pending = feedPublishPostGuarded("post-A", publish, () => live);
    await vi.waitFor(() => expect(m.api).toHaveBeenCalledOnce());
    live = false;
    resolve({ success: true, data: ack });
    await expect(pending).rejects.toThrow("FEED_EDIT_PUBLISH_SESSION_CHANGED");
  });
  it("negative HTTP or missing data returns only static private-safe unknown error", async () => {
    m.api.mockResolvedValueOnce({
      success: false,
      error: "Bearer secret-provider-url",
      code: "TIMEOUT",
    });
    await expect(feedSaveRevisionGuarded("post-A", revision, () => true)).rejects.toThrow(
      "FEED_EDIT_REVISION_UNCONFIRMED",
    );
    m.api.mockResolvedValueOnce({ success: true, data: undefined });
    await expect(feedPublishPostGuarded("post-A", publish, () => true)).rejects.toThrow(
      "FEED_EDIT_PUBLISH_UNCONFIRMED",
    );
    expect(m.api).toHaveBeenCalledTimes(2);
  });
});
