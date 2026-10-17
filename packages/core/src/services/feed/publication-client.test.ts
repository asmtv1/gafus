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
  it("uses Mobile's 2-second status check without reporting published early", async () => {
    vi.useFakeTimers();
    try {
      let reads = 0;
      const client = api(() => false, () => undefined);
      client.getEditor.mockImplementation(async () => post(++reads === 1 ? "pending" : "published"));
      const manager = createFeedPublicationManager({
        api: client, upload: vi.fn().mockResolvedValue("media-1"),
        makeId: () => crypto.randomUUID(), pollIntervalMs: 2000,
      });
      manager.enqueue({ ownerId: "me", text: "Фото", files: [{ requestId: "photo-1", bytes: 200_000 }], albumPhotoIds: [] });
      await vi.advanceTimersByTimeAsync(0);
      expect(reads).toBe(1);
      expect(manager.getSnapshot()[0]?.phase).toBe("processing");
      await vi.advanceTimersByTimeAsync(1999);
      expect(reads).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(reads).toBe(2);
      expect(manager.getSnapshot()[0]?.phase).toBe("published");
    } finally {
      vi.useRealTimers();
    }
  });
  it("rejects unsafe poll intervals", () => {
    expect(() => createFeedPublicationManager({
      api: api(() => false, () => undefined), upload: vi.fn(),
      makeId: () => crypto.randomUUID(), pollIntervalMs: 0,
    })).toThrow("INVALID_PUBLICATION_POLL_INTERVAL");
  });

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

  it("persists a poll before saving an empty-text post, including idempotent retries", async () => {
    let published = false;
    let failures = 0;
    const client = { ...api(() => published, () => { published = true; }),
      savePoll: vi.fn().mockResolvedValue({ id: "poll-1" }),
    };
    client.publishPost.mockImplementation(async () => {
      if (++failures === 1) throw new Error("Сбой подключения");
      published = true;
      return post("published");
    });
    const manager = createFeedPublicationManager({
      api: client, upload: vi.fn(), makeId: () => crypto.randomUUID(),
    });
    const jobId = manager.enqueue({ ownerId: "me", text: "", files: [], albumPhotoIds: [],
      poll: { question: "Какой ответ?", options: [{ text: "Первый" }, { text: "Второй" }] },
    });
    await vi.waitFor(() => expect(manager.getSnapshot()[0]?.phase).toBe("failed"));
    expect(client.savePoll).toHaveBeenCalledWith("post-1", expect.objectContaining({
      expectedVersion: 0, question: "Какой ответ?",
    }));
    expect(client.saveRevision).toHaveBeenCalledWith("post-1", expect.objectContaining({
      text: "", attachmentIds: [], pollOnly: true,
    }));
    expect(client.savePoll.mock.invocationCallOrder[0]).toBeLessThan(client.saveRevision.mock.invocationCallOrder[0]!);
    manager.retry(jobId);
    await vi.waitFor(() => expect(manager.getSnapshot()[0]?.phase).toBe("published"));
    expect(client.savePoll).toHaveBeenCalledTimes(1);
    expect(client.saveRevision).toHaveBeenCalledTimes(1);
    expect(client.publishPost).toHaveBeenCalledTimes(2);
  });

  it("uploads poll option photos separately and retries without duplicating media", async () => {
    let published = false;
    const client = { ...api(() => published, () => { published = true; }),
      savePoll: vi.fn().mockRejectedValueOnce(new Error("Temporary connection error"))
        .mockResolvedValue({ id: "poll1" }),
    };
    const asset = { requestId: "poll-image-1", bytes: 100, previewUri: "blob:preview" };
    const uploaded = vi.fn().mockResolvedValue("poll-media-id");
    const pollImageStatus = vi.fn().mockResolvedValue("ready" as const);
    const manager = createFeedPublicationManager({ api: client, upload: uploaded,
      pollImageStatus, makeId: () => crypto.randomUUID(),
    });
    const jobId = manager.enqueue({ ownerId: "me", text: "", files: [], albumPhotoIds: [],
      poll: { question: "Что за собака?", options: [{ text: "Шпиц" }, { text: "Корги" }] },
      pollOptionImages: [{ optionIndex: 1, asset }],
    });
    await vi.waitFor(() => expect(manager.getSnapshot()[0]?.phase).toBe("failed"));
    expect(uploaded).toHaveBeenCalledWith("post-1", asset, expect.any(Function));
    expect(pollImageStatus).toHaveBeenCalledWith("post-1", asset, "poll-media-id");
    expect(client.saveRevision).not.toHaveBeenCalled();
    manager.retry(jobId);
    await vi.waitFor(() => expect(manager.getSnapshot()[0]?.phase).toBe("published"));
    expect(uploaded).toHaveBeenCalledTimes(1);
    expect(client.savePoll).toHaveBeenCalledTimes(2);
    expect(client.savePoll).toHaveBeenLastCalledWith("post-1", expect.objectContaining({
      expectedVersion: 0,
      options: [{ text: "Шпиц" }, { text: "Корги", imageMediaId: "poll-media-id" }],
    }));
    expect(client.saveRevision).toHaveBeenCalledWith("post-1", expect.objectContaining({
      text: "", attachmentIds: [], pollOnly: true,
    }));
    expect(client.publishPost).toHaveBeenCalledTimes(1);
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
