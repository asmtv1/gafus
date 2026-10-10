import { describe, expect, it, vi } from "vitest";
import type { FeedPostEditorDto } from "@gafus/types";
import { createFeedPublicationManager, publicationPhaseLabel } from "./publication-client";

function post(status: FeedPostEditorDto["status"]): FeedPostEditorDto {
  return { id: "post-1", status, version: 0, attachments: [], pendingRevision: null } as FeedPostEditorDto;
}
function api(published: () => boolean, publish: () => void) {
  return {
    createPost: vi.fn().mockImplementation(async () => post("draft")),
    getEditor: vi.fn().mockImplementation(async () => post(published() ? "published" : "draft")),
    copyAlbumPhoto: vi.fn(),
    saveRevision: vi.fn().mockImplementation(async () => post("draft")),
    publishPost: vi.fn().mockImplementation(async () => { publish(); return post("published"); }),
  };
}
describe("Moments background publication manager", () => {
  it("shows a card immediately, follows real bytes and waits for server confirmation", async () => {
    let published = false;
    const client = api(() => published, () => { published = true; });
    let finish!: (id: string) => void;
    const upload = vi.fn().mockImplementation((_postId: string, _asset: unknown, report: (loaded: number, total: number) => void) => {
      report(25, 100);
      return new Promise<string>(resolve => { finish = resolve; });
    });
    let id = 0;
    const manager = createFeedPublicationManager({
      api: client, upload, makeId: () => String(++id),
    });
    manager.enqueue({
      ownerId: "me", text: "Прогулка", files: [{ requestId: "asset", bytes: 100 }],
      albumPhotoIds: [],
    });
    expect(manager.getSnapshot()[0]?.phase).toBe("uploading");
    await vi.waitFor(() => expect(manager.getSnapshot()[0]?.progress).toBe(25));
    expect(publicationPhaseLabel(manager.getSnapshot()[0]!)).toBe("Загружаем… 25%");
    finish("media-1");
    await vi.waitFor(() => expect(manager.getSnapshot()[0]?.phase).toBe("published"));
    expect(client.createPost).toHaveBeenCalledTimes(1);
    expect(client.saveRevision).toHaveBeenCalledTimes(1);
    expect(client.publishPost).toHaveBeenCalledTimes(1);
    expect(publicationPhaseLabel(manager.getSnapshot()[0]!)).toBe("Опубликовано!");
  });

  it("retries failures against the same draft without duplicate uploads or posts", async () => {
    let published = false;
    const client = api(() => published, () => { published = true; });
    let count = 0;
    const upload = vi.fn().mockImplementation(async () => {
      if (++count === 1) throw new Error("Нет сети");
      return "media-1";
    });
    let id = 0;
    const manager = createFeedPublicationManager({
      api: client, upload, makeId: () => String(++id),
    });
    const jobId = manager.enqueue({
      ownerId: "me", text: "Прогулка", files: [{ requestId: "asset", bytes: 100 }],
      albumPhotoIds: [],
    });
    await vi.waitFor(() => expect(manager.getSnapshot()[0]?.phase).toBe("failed"));
    expect(manager.getSnapshot()[0]?.error).toBe("Нет сети");
    manager.retry(jobId);
    await vi.waitFor(() => expect(manager.getSnapshot()[0]?.phase).toBe("published"));
    expect(client.createPost).toHaveBeenCalledTimes(1);
    expect(client.saveRevision).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(2);
  });
});
