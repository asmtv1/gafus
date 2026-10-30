import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPublishedMomentEditor, savePublishedMomentText,
  publishPublishedMomentText,
} from "./momentPublishedEditor";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const rawEditor = {
  id: "post-1", version: 2, status: "published", text: "Оригинал",
  canEdit: true, attachments: [
    { id: "photo-1", fullUrl: "https://signed.example/secret" },
    { id: "video-1", posterUrl: "https://signed.example/other" },
  ],
  pendingRevision: null, author: { id: "private-user", role: "ADMIN" },
};
const input = {
  id: "post-1", version: 2, status: "published" as const,
  text: "Оригинал", canEdit: true,
  attachmentIds: ["photo-1", "video-1"],
  pendingRevision: null,
};
function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200, data, error: "Core unavailable",
  }), { status });
}
afterEach(() => vi.unstubAllGlobals());

describe("published Moment text revisions", () => {
  it("projects owned editor and drops signed media URLs/author identity", async () => {
    const fake = vi.fn().mockResolvedValue(ok(rawEditor));
    vi.stubGlobal("fetch", fake);
    const editor = await getPublishedMomentEditor("post-1");
    expect(editor).toEqual(input);
    expect(JSON.stringify(editor)).not.toMatch(/private-user|signed.example|secret/);
    expect(fake.mock.calls[0][0]).toBe("/api/v1/feed/posts/post-1/editor");
  });

  it("saves exact attachment IDs and version with a stable client UUID", async () => {
    const fake = vi.fn().mockResolvedValue(ok({
      ...rawEditor, version: 3,
      pendingRevision: {
        status: "draft", text: "Новый текст",
        attachmentIds: ["photo-1", "video-1"],
      },
    }));
    vi.stubGlobal("fetch", fake);
    const saved = await savePublishedMomentText({
      editor: input, text: "  Новый текст  ", clientRequestId: UUID,
    });
    expect(saved.version).toBe(3);
    expect(saved.pendingRevision?.attachmentIds).toEqual(["photo-1", "video-1"]);
    expect(fake.mock.calls[0][0]).toBe("/api/v1/feed/posts/post-1/revisions");
    expect(fake.mock.calls[0][1].method).toBe("PUT");
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
      expectedVersion: 2, text: "Новый текст",
      attachmentIds: ["photo-1", "video-1"], clientRequestId: UUID,
    });
  });

  it("reorders and removes existing attachments with server CAS, never writing S3 keys", async () => {
    const ordered = ["video-1"];
    const fake = vi.fn().mockResolvedValue(ok({ ...rawEditor, version: 3,
      pendingRevision: { status: "draft", text: "Новый состав", attachmentIds: ordered },
    }));
    vi.stubGlobal("fetch", fake);
    const saved = await savePublishedMomentText({
      editor: input, text: "Новый состав", attachmentIds: ordered, clientRequestId: UUID,
    });
    expect(saved.pendingRevision?.attachmentIds).toEqual(ordered);
    expect(fake).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
      text: "Новый состав", expectedVersion: 2, attachmentIds: ordered,
      clientRequestId: UUID,
    });
  });

  it("permits removing text from a media-only post and poll-only edits", async () => {
    const media = vi.fn().mockResolvedValueOnce(ok({ ...rawEditor, version: 3,
      pendingRevision: { status: "draft", text: "", attachmentIds: ["photo-1"] },
    })).mockResolvedValueOnce(ok({ ...rawEditor, hasPoll: true, version: 3,
      pendingRevision: { status: "draft", text: "", attachmentIds: [] },
    }));
    vi.stubGlobal("fetch", media);
    await savePublishedMomentText({ editor: input, text: "", clientRequestId: UUID,
      attachmentIds: ["photo-1"] });
    await savePublishedMomentText({ editor: { ...input, hasPoll: true },
      text: "", attachmentIds: [], clientRequestId: UUID });
    expect(JSON.parse(media.mock.calls[0][1].body)).toMatchObject({
      text: "", attachmentIds: ["photo-1"],
    });
    expect(JSON.parse(media.mock.calls[1][1].body)).toMatchObject({
      text: "", attachmentIds: [], pollOnly: true,
    });
  });

  it("rejects injecting a foreign media ID or deleting the last content", async () => {
    const fake = vi.fn(); vi.stubGlobal("fetch", fake);
    await expect(savePublishedMomentText({ editor: input, text: "Привет",
      attachmentIds: ["foreign-media"], clientRequestId: UUID }))
      .rejects.toThrow("Недоступное вложение");
    await expect(savePublishedMomentText({ editor: input, text: "",
      attachmentIds: [], clientRequestId: UUID }))
      .rejects.toThrow("Добавьте текст");
    expect(fake).not.toHaveBeenCalled();
  });

  it("fails closed for altered media IDs, server permission denial and stale version", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(ok({ ...rawEditor, version: 3,
        pendingRevision: {
          status: "draft", text: "Новый текст",
          attachmentIds: ["photo-1"],
        } }))
      .mockResolvedValueOnce(ok(null, 409));
    vi.stubGlobal("fetch", fake);
    const candidate = { editor: input, text: "Новый текст", clientRequestId: UUID };
    await expect(savePublishedMomentText(candidate)).rejects.toThrow("не подтвердил");
    await expect(savePublishedMomentText(candidate)).rejects.toMatchObject({ status: 409 });
    await expect(savePublishedMomentText({
      ...candidate, editor: { ...input, canEdit: false },
    })).rejects.toThrow("недоступно");
    await expect(savePublishedMomentText({
      ...candidate, editor: { ...input, attachmentIds: ["photo-1", "photo-1"] },
    })).rejects.toThrow("недоступно");
    expect(fake).toHaveBeenCalledTimes(2);
  });

  it("publishes new revision but preserves previous active post until Core finishes", async () => {
    const saved = {
      ...input, version: 3,
      pendingRevision: { status: "draft" as const, text: "Новый текст",
        attachmentIds: ["photo-1", "video-1"] },
    };
    const fake = vi.fn().mockResolvedValue(ok({
      ...rawEditor, version: 3,
      pendingRevision: { ...saved.pendingRevision, status: "pending" },
    }));
    vi.stubGlobal("fetch", fake);
    const published = await publishPublishedMomentText(saved, UUID);
    expect(published.status).toBe("published");
    expect(published.pendingRevision?.status).toBe("pending");
    expect(fake.mock.calls[0][0]).toBe("/api/v1/feed/posts/post-1/publish");
    expect(JSON.parse(fake.mock.calls[0][1].body))
      .toEqual({ clientRequestId: UUID });
  });

  it("already-processing or unacknowledged revisions cannot be republished", async () => {
    const fake = vi.fn();
    vi.stubGlobal("fetch", fake);
    await expect(publishPublishedMomentText(input, UUID))
      .rejects.toThrow("Нечего");
    await expect(publishPublishedMomentText({
      ...input, pendingRevision: {
        status: "pending", text: "Новый", attachmentIds: ["photo-1", "video-1"],
      },
    }, UUID)).rejects.toThrow("Нечего");
    expect(fake).not.toHaveBeenCalled();
  });

  it("rejects forged other-post editor and malformed media", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(ok({ ...rawEditor, id: "other" }))
      .mockResolvedValueOnce(ok({ ...rawEditor, attachments: [
        { id: "../bad" },
      ] }));
    vi.stubGlobal("fetch", fake);
    await expect(getPublishedMomentEditor("post-1"))
      .rejects.toThrow("Недоступен");
    await expect(getPublishedMomentEditor("post-1"))
      .rejects.toThrow("Некорректные");
    await expect(getPublishedMomentEditor("../bad"))
      .rejects.toThrow("Некорректная");
  });
});
