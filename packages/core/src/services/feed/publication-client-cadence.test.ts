import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedPostEditorDto } from "@gafus/types";
import { createFeedPublicationManager } from "./publication-client";

const editor = (status: FeedPostEditorDto["status"]): FeedPostEditorDto =>
  ({ id: "test-post", status, version: 0, attachments: [], pendingRevision: null }) as FeedPostEditorDto;

const draftApi = () => ({
  createPost: vi.fn().mockResolvedValue(editor("draft")),
  getEditor: vi.fn().mockResolvedValue(editor("pending")),
  saveRevision: vi.fn().mockResolvedValue(editor("draft")),
  publishPost: vi.fn().mockResolvedValue(editor("pending")),
  copyAlbumPhoto: vi.fn(),
});

const poll = { question: "Какой ответ?", options: [{ text: "Первый" }, { text: "Второй" }] };

afterEach(() => vi.useRealTimers());

describe("Moments publication polling parity", () => {
  it("uses the requested Mobile 2-second cadence without declaring an HTTP publish response complete", async () => {
    vi.useFakeTimers();
    const api = draftApi();
    api.getEditor.mockResolvedValueOnce(editor("pending")).mockResolvedValueOnce(editor("published"));
    const manager = createFeedPublicationManager({
      api, upload: vi.fn(), makeId: () => crypto.randomUUID(), pollIntervalMs: 2_000,
    });
    manager.enqueue({ ownerId: "me", text: "Прогулка", files: [], albumPhotoIds: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.getEditor).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot()[0]?.phase).toBe("processing");
    await vi.advanceTimersByTimeAsync(1_999);
    expect(api.getEditor).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.getEditor).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot()[0]?.phase).toBe("published");
  });

  it("shares the ten-minute processing budget between poll photos and post activation", async () => {
    vi.useFakeTimers();
    const api = { ...draftApi(), savePoll: vi.fn().mockResolvedValue({ id: "poll" }) };
    const checkPhoto = vi.fn().mockImplementation(async () =>
      checkPhoto.mock.calls.length >= 10 ? "ready" as const : "pending" as const);
    const manager = createFeedPublicationManager({
      api, makeId: () => crypto.randomUUID(), upload: vi.fn().mockResolvedValue("poll-photo"),
      pollImageStatus: checkPhoto, pollIntervalMs: 60_000,
    });
    manager.enqueue({ ownerId: "me", text: "", files: [], albumPhotoIds: [], poll,
      pollOptionImages: [{ optionIndex: 0, asset: { requestId: "photo", bytes: 500 } }],
    });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(checkPhoto).toHaveBeenCalledTimes(10);
    expect(api.savePoll).toHaveBeenCalledTimes(1);
    expect(api.publishPost).toHaveBeenCalledTimes(1);
    expect(api.getEditor).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot()[0]?.phase).toBe("failed");
    expect(manager.getSnapshot()[0]?.error).toMatch(/Обработка занимает/);
  });

  it("rejects invalid polling cadence instead of creating a busy loop", () => {
    expect(() => createFeedPublicationManager({
      api: draftApi(), upload: vi.fn(), makeId: () => "x", pollIntervalMs: 0,
    })).toThrow(RangeError);
  });
});
