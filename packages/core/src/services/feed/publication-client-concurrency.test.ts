import { describe, expect, it, vi } from "vitest";
import type { FeedPostEditorDto } from "@gafus/types";
import { createFeedPublicationManager } from "./publication-client";

function editor(status: FeedPostEditorDto["status"]): FeedPostEditorDto {
  return { id: "post-1", version: 0, status, attachments: [], pendingRevision: null } as FeedPostEditorDto;
}
function transport() {
  let published = false;
  return {
    createPost: vi.fn().mockImplementation(async () => editor("draft")),
    getEditor: vi.fn().mockImplementation(async () => editor(published ? "published" : "draft")),
    saveRevision: vi.fn().mockResolvedValue(editor("draft")),
    publishPost: vi.fn().mockImplementation(async () => { published = true; return editor("published"); }),
    copyAlbumPhoto: vi.fn(),
  };
}
const input = (owner: string, count: number, prefix = "f") => ({
  ownerId: owner, text: "parallel uploads", albumPhotoIds: [],
  files: Array.from({ length: count }, (_, n) => ({ requestId: `${prefix}${n}`, bytes: 100 })),
});
function deferredTransfers() {
  const waiting = new Map<string, { resolve: (value: string) => void; reject: (error: Error) => void }>();
  let active = 0, peak = 0;
  const upload = vi.fn((_id: string, asset: { requestId: string }, progress: (n: number, total: number) => void) => {
    active++;
    peak = Math.max(peak, active);
    progress(25, 100);
    return new Promise<string>((resolve, reject) => {
      waiting.set(asset.requestId, { resolve, reject });
    }).finally(() => { active--; });
  });
  return { upload, waiting, get active() { return active; }, get peak() { return peak; },
    finish: (id: string) => { const transfer = waiting.get(id); expect(transfer, id).toBeDefined();
      waiting.delete(id); transfer!.resolve(`media-${id}`); },
    fail: (id: string) => { const transfer = waiting.get(id); expect(transfer, id).toBeDefined();
      waiting.delete(id); transfer!.reject(new Error("transient S3 outage")); },
  };
}

describe("Moments source transfers use five concurrent slots across posts", () => {
  it("uploads at most five per post, retains original revision order despite out-of-order finishes", async () => {
    const api = transport(), transfer = deferredTransfers();
    const manager = createFeedPublicationManager({ api, upload: transfer.upload,
      makeId: () => crypto.randomUUID() });
    manager.enqueue(input("one", 8));
    await vi.waitFor(() => expect(transfer.upload).toHaveBeenCalledTimes(5));
    expect(transfer.peak).toBe(5);
    // Five active transfers at 25% each, out of eight equal-size assets.
    expect(manager.getSnapshot()[0]?.progress).toBe(15);
    transfer.finish("f3");
    await vi.waitFor(() => expect(transfer.upload).toHaveBeenCalledTimes(6));
    transfer.finish("f1");
    await vi.waitFor(() => expect(transfer.upload).toHaveBeenCalledTimes(7));
    transfer.finish("f4");
    await vi.waitFor(() => expect(transfer.upload).toHaveBeenCalledTimes(8));
    for (const id of ["f7", "f0", "f6", "f2", "f5"]) transfer.finish(id);
    await vi.waitFor(() => expect(manager.getSnapshot()[0]?.phase).toBe("published"));
    expect(transfer.peak).toBe(5);
    expect(transfer.active).toBe(0);
    expect(api.saveRevision).toHaveBeenCalledWith("post-1", expect.objectContaining({
      attachmentIds: Array.from({ length: 8 }, (_, n) => `media-f${n}`),
    }));
    expect(api.publishPost).toHaveBeenCalledTimes(1);
  });

  it("shares the same five upload slots between two simultaneously publishing posts", async () => {
    const api = transport(), transfer = deferredTransfers();
    const manager = createFeedPublicationManager({ api, upload: transfer.upload,
      makeId: () => crypto.randomUUID() });
    manager.enqueue(input("one", 5, "a"));
    manager.enqueue(input("two", 5, "b"));
    await vi.waitFor(() => expect(transfer.upload).toHaveBeenCalledTimes(5));
    expect(transfer.peak).toBe(5);
    transfer.finish("a4");
    await vi.waitFor(() => expect(transfer.upload).toHaveBeenCalledTimes(6));
    transfer.finish("a3");
    await vi.waitFor(() => expect(transfer.upload).toHaveBeenCalledTimes(7));
    transfer.finish("a2");
    await vi.waitFor(() => expect(transfer.upload).toHaveBeenCalledTimes(8));
    transfer.finish("a1");
    await vi.waitFor(() => expect(transfer.upload).toHaveBeenCalledTimes(9));
    transfer.finish("a0");
    await vi.waitFor(() => expect(transfer.upload).toHaveBeenCalledTimes(10));
    for (let i = 0; i < 5; i++) transfer.finish(`b${i}`);
    await vi.waitFor(() => expect(manager.getSnapshot().every(x => x.phase === "published")).toBe(true));
    expect(transfer.peak).toBe(5);
    expect(transfer.active).toBe(0);
    expect(api.saveRevision).toHaveBeenCalledTimes(2);
    expect(api.publishPost).toHaveBeenCalledTimes(2);
  });

  it("waits for remaining in-flight uploads on failure and retries only missing IDs", async () => {
    const api = transport(), transfer = deferredTransfers();
    const manager = createFeedPublicationManager({ api, upload: transfer.upload,
      makeId: () => crypto.randomUUID() });
    const id = manager.enqueue(input("one", 6));
    await vi.waitFor(() => expect(transfer.upload).toHaveBeenCalledTimes(5));
    transfer.fail("f0");
    await vi.waitFor(() => expect(transfer.active).toBe(4));
    for (let i = 1; i < 5; i++) transfer.finish(`f${i}`);
    await vi.waitFor(() => expect(manager.getSnapshot()[0]?.phase).toBe("failed"));
    expect(transfer.upload).toHaveBeenCalledTimes(5);
    expect(api.saveRevision).not.toHaveBeenCalled();
    manager.retry(id);
    await vi.waitFor(() => expect(transfer.upload).toHaveBeenCalledTimes(7));
    const attempts = transfer.upload.mock.calls.map(([, asset]) => asset.requestId);
    expect(attempts).toEqual(["f0", "f1", "f2", "f3", "f4", "f0", "f5"]);
    transfer.finish("f5"); transfer.finish("f0");
    await vi.waitFor(() => expect(manager.getSnapshot()[0]?.phase).toBe("published"));
    expect(transfer.active).toBe(0);
    expect(api.createPost).toHaveBeenCalledTimes(1);
    expect(api.saveRevision).toHaveBeenCalledWith("post-1", expect.objectContaining({
      attachmentIds: Array.from({ length: 6 }, (_, n) => `media-f${n}`),
    }));
    expect(api.publishPost).toHaveBeenCalledTimes(1);
  });

  it("combines post files and poll-option photos within five slots without mixing attachment IDs", async () => {
    const api = { ...transport(), savePoll: vi.fn().mockResolvedValue({ id: "poll-1" }) };
    const transfer = deferredTransfers();
    const imageReady = vi.fn().mockResolvedValue("ready" as const);
    const manager = createFeedPublicationManager({ api, upload: transfer.upload,
      pollImageStatus: imageReady, makeId: () => crypto.randomUUID() });
    manager.enqueue({ ...input("one", 3),
      poll: { question: "Choose", options: Array.from({ length: 4 }, (_, n) => ({ text: `Answer ${n}` })) },
      pollOptionImages: Array.from({ length: 4 }, (_, n) => ({
        optionIndex: n, asset: { requestId: `p${n}`, bytes: 100 },
      })),
    });
    await vi.waitFor(() => expect(transfer.upload).toHaveBeenCalledTimes(5));
    expect(transfer.peak).toBe(5);
    transfer.finish("f2");
    await vi.waitFor(() => expect(transfer.upload).toHaveBeenCalledTimes(6));
    transfer.finish("p1");
    await vi.waitFor(() => expect(transfer.upload).toHaveBeenCalledTimes(7));
    for (const id of ["p3", "f0", "p2", "f1", "p0"]) transfer.finish(id);
    await vi.waitFor(() => expect(manager.getSnapshot()[0]?.phase).toBe("published"));
    expect(transfer.peak).toBe(5);
    expect(transfer.active).toBe(0);
    expect(api.saveRevision).toHaveBeenCalledWith("post-1", expect.objectContaining({
      attachmentIds: ["media-f0", "media-f1", "media-f2"],
    }));
    expect(api.savePoll).toHaveBeenCalledWith("post-1", expect.objectContaining({
      options: Array.from({ length: 4 }, (_, n) => ({
        text: `Answer ${n}`, imageMediaId: `media-p${n}`,
      })),
    }));
    expect(imageReady).toHaveBeenCalledTimes(4);
    expect(api.publishPost).toHaveBeenCalledTimes(1);
  });
});
