import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canEditTextOnlyMoment, createMomentDraft, getMomentEditor, listMomentDrafts,
  saveMomentText, publishMomentDraft, deleteMomentDraft, validateMomentText,
  canAppendMomentMedia, appendMomentMediaRevision,
  canEditMomentDraftText, saveMomentTextWithMedia,
  canReorderMomentMedia, reorderMomentMedia,
} from "./momentComposerApi";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const editor = {
  id: "post-1", status: "draft", text: "", version: 0, canEdit: true,
  attachments: [], pendingRevision: null,
  author: { id: "private-author", avatarUrl: "https://private.example/secret" },
};
function result(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200, data, error: "Core denied",
  }), { status });
}
afterEach(() => vi.unstubAllGlobals());

describe("Moment draft/editor API contract", () => {
  it("creates a draft with one stable idempotency UUID and minimal DTO", async () => {
    const fake = vi.fn().mockResolvedValue(result(editor));
    vi.stubGlobal("fetch", fake);
    const draft = await createMomentDraft(UUID);
    expect(draft).toEqual({
      id: "post-1", status: "draft", text: "", version: 0,
      canEdit: true, attachmentCount: 0, pendingRevision: null,
    });
    expect(fake.mock.calls[0][0]).toBe("/api/v1/feed/posts");
    expect(fake.mock.calls[0][1]).toMatchObject({
      method: "POST", credentials: "include", cache: "no-store",
    });
    expect(JSON.parse(fake.mock.calls[0][1].body))
      .toEqual({ clientRequestId: UUID });
    expect(JSON.stringify(draft)).not.toMatch(/private|secret/);
  });

  it("saves only text-only revision with expected version and never drops media", async () => {
    const fake = vi.fn().mockResolvedValue(result({
      ...editor, version: 1,
      pendingRevision: {
        status: "draft", text: "Как помочь собаке?",
        attachmentIds: [], errorCode: null,
      },
    }));
    vi.stubGlobal("fetch", fake);
    const saved = await saveMomentText({
      postId: "post-1", text: "  Как помочь собаке? ",
      clientRequestId: UUID, expectedVersion: 0,
    });
    expect(saved.pendingRevision?.text).toBe("Как помочь собаке?");
    expect(fake.mock.calls[0][0]).toBe("/api/v1/feed/posts/post-1/revisions");
    expect(fake.mock.calls[0][1].method).toBe("PUT");
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
      text: "Как помочь собаке?", expectedVersion: 0,
      attachmentIds: [], clientRequestId: UUID,
    });
    expect(canEditTextOnlyMoment(saved)).toBe(true);
    expect(canEditTextOnlyMoment({ ...saved, attachmentCount: 1 })).toBe(false);
    expect(canEditTextOnlyMoment({ ...saved, pendingRevision: {
      text: "other", status: "draft", attachmentIds: ["photo-1"],
    } })).toBe(false);
  });

  it("cannot present mismatched or unsafe revision acknowledgements as saved", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(result({ ...editor, version: 0 }))
      .mockResolvedValueOnce(result({ ...editor, version: 1,
        pendingRevision: { text: "Different", status: "draft",
          attachmentIds: [] } }));
    vi.stubGlobal("fetch", fake);
    const input = { postId: "post-1", text: "Actual",
      expectedVersion: 0, clientRequestId: UUID };
    await expect(saveMomentText(input)).rejects.toThrow("не подтвердил");
    await expect(saveMomentText(input)).rejects.toThrow("не подтвердил");
  });

  it("saves text with attached photos and refuses to silently drop IDs or CAS", async () => {
    const linked = {
      id: "post-1", status: "draft" as const, version: 2, canEdit: true,
      text: "", attachmentCount: 2,
      pendingRevision: { status: "draft" as const, text: "Прежний",
        attachmentIds: ["media-A", "media-B"] },
    };
    const responseEditor = (ids: string[], version = 3) => ({
      ...editor, version,
      pendingRevision: { status: "draft", text: "Новый текст",
        attachmentIds: ids },
    });
    const fake = vi.fn()
      .mockResolvedValueOnce(result(responseEditor(["media-A", "media-B"])))
      .mockResolvedValueOnce(result(responseEditor(["media-B", "media-A"])))
      .mockResolvedValueOnce(result(responseEditor(["media-A", "media-B"], 4)))
      .mockResolvedValueOnce(result(null, 409));
    vi.stubGlobal("fetch", fake);
    expect(canEditMomentDraftText(linked)).toBe(true);
    expect(canEditMomentDraftText({ ...linked, attachmentCount: 3 })).toBe(false);
    expect(canEditMomentDraftText({ ...linked, status: "pending" })).toBe(false);
    const input = { editor: linked, text: "Новый текст", clientRequestId: UUID };
    const first = await saveMomentTextWithMedia(input);
    expect(first.pendingRevision?.attachmentIds).toEqual(["media-A", "media-B"]);
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
      clientRequestId: UUID, expectedVersion: 2,
      text: "Новый текст", attachmentIds: ["media-A", "media-B"],
    });
    await expect(saveMomentTextWithMedia(input)).rejects.toThrow("не подтвердил");
    await expect(saveMomentTextWithMedia(input)).rejects.toThrow("не подтвердил");
    await expect(saveMomentTextWithMedia(input)).rejects.toMatchObject({ status: 409 });
    expect(fake.mock.calls).toHaveLength(4);
  });

  it("publish requires exactly the same post and server status, never optimistic ACK", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(result({ ...editor, status: "published",
        text: "Собака учится спокойно", version: 1 }))
      .mockResolvedValueOnce(result({ ...editor, status: "pending",
        version: 1 }))
      .mockResolvedValueOnce(result({ ...editor, status: "draft" }));
    vi.stubGlobal("fetch", fake);
    expect((await publishMomentDraft("post-1", UUID)).status).toBe("published");
    expect((await publishMomentDraft("post-1", UUID)).status).toBe("pending");
    await expect(publishMomentDraft("post-1", UUID)).rejects.toThrow("не подтвердил");
    expect(fake.mock.calls[0][0]).toBe("/api/v1/feed/posts/post-1/publish");
    expect(JSON.parse(fake.mock.calls[0][1].body))
      .toEqual({ clientRequestId: UUID });
  });

  it("pending list is author-scoped Core source and projected without private URLs", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(result({ items: [{ ...editor,
        author: { avatarUrl: "https://signed.example/private" } }],
      nextCursor: null }))
      .mockResolvedValueOnce(result(editor));
    vi.stubGlobal("fetch", fake);
    const drafts = await listMomentDrafts();
    expect(drafts.items).toHaveLength(1);
    expect(fake.mock.calls[0][0]).toBe("/api/v1/feed/me/pending-posts?pageSize=20");
    expect(JSON.stringify(drafts)).not.toContain("signed.example");
    expect((await getMomentEditor("post-1")).id).toBe("post-1");
    expect(fake.mock.calls[1][0]).toBe("/api/v1/feed/posts/post-1/editor");
  });

  it("deletion requires explicit matching Core ID and never clears on errors", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(result({ id: "post-1" }))
      .mockResolvedValueOnce(result({ id: "another" }))
      .mockResolvedValueOnce(result(null, 403));
    vi.stubGlobal("fetch", fake);
    await expect(deleteMomentDraft("post-1")).resolves.toBe("post-1");
    await expect(deleteMomentDraft("post-1")).rejects.toThrow("не подтвердил");
    await expect(deleteMomentDraft("post-1")).rejects.toMatchObject({ status: 403 });
    expect(fake.mock.calls[0][1].method).toBe("DELETE");
    await expect(deleteMomentDraft("../other")).rejects.toThrow("Некорректная");
    expect(fake).toHaveBeenCalledTimes(3);
  });

  it("rejects empty, long, invalid UUID and malformed editor payload", async () => {
    expect(() => validateMomentText(" ")).toThrow("Введите текст");
    expect(() => validateMomentText("x".repeat(5001))).toThrow("Введите текст");
    expect(validateMomentText("  Готово ")).toBe("Готово");
    const fake = vi.fn().mockResolvedValue(result({ ...editor,
      attachments: [{ id: "../private", fullUrl: "https://signed.example" }] }));
    vi.stubGlobal("fetch", fake);
    await expect(createMomentDraft("not-uuid")).rejects.toThrow("Некорректный");
    await expect(getMomentEditor("../other")).rejects.toThrow("Некорректная");
    await expect(getMomentEditor("post-1")).rejects.toThrow("Некорректные вложения");
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("allows a Core-owned empty draft to receive first photo without requiring text", async () => {
    const draft = {
      id: "post-1", status: "draft" as const, version: 0, text: "",
      canEdit: true, attachmentCount: 0, pendingRevision: null,
    };
    const fake = vi.fn().mockResolvedValue(result({
      ...editor, version: 1, pendingRevision: {
        text: "", status: "draft", attachmentIds: ["media-1"],
      },
    }));
    vi.stubGlobal("fetch", fake);
    expect(canAppendMomentMedia(draft)).toBe(true);
    const updated = await appendMomentMediaRevision({
      editor: draft, mediaId: "media-1", clientRequestId: UUID,
    });
    expect(updated.pendingRevision?.attachmentIds).toEqual(["media-1"]);
    expect(updated.pendingRevision?.text).toBe("");
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
      text: "", attachmentIds: ["media-1"], expectedVersion: 0,
      clientRequestId: UUID,
    });
    expect(canAppendMomentMedia({ ...draft, canEdit: false })).toBe(false);
    expect(canAppendMomentMedia({ ...draft, version: 3 })).toBe(false);
  });

  it("reorders exact two media references with Core version and no storage deletion", async () => {
    const draft = {
      id: "post-1", version: 2, status: "draft" as const,
      text: "", canEdit: true, attachmentCount: 0,
      pendingRevision: { text: "Привет", status: "draft" as const,
        attachmentIds: ["media-A", "media-B"],
      },
    };
    const fake = vi.fn().mockResolvedValue(result({
      ...editor, version: 3,
      pendingRevision: {
        ...draft.pendingRevision, attachmentIds: ["media-B", "media-A"],
      },
    }));
    vi.stubGlobal("fetch", fake);
    expect(canReorderMomentMedia(draft)).toBe(true);
    const updated = await reorderMomentMedia({
      editor: draft, from: 0, to: 1, clientRequestId: UUID,
    });
    expect(updated.pendingRevision?.attachmentIds)
      .toEqual(["media-B", "media-A"]);
    expect(fake.mock.calls.map(call => call[0]))
      .toEqual(["/api/v1/feed/posts/post-1/revisions"]);
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
      text: "Привет", expectedVersion: 2,
      attachmentIds: ["media-B", "media-A"], clientRequestId: UUID,
    });
  });

  it("reorder refuses illegal indices, duplicate IDs and mismatched Core response", async () => {
    const draft = {
      id: "post-1", version: 2, status: "draft" as const,
      text: "", canEdit: true, attachmentCount: 0,
      pendingRevision: { text: "Привет", status: "draft" as const,
        attachmentIds: ["media-A", "media-B"] },
    };
    const fake = vi.fn().mockResolvedValue(result({
      ...editor, version: 3, pendingRevision: {
        text: "Привет", status: "draft", attachmentIds: ["media-A", "media-B"],
      },
    }));
    vi.stubGlobal("fetch", fake);
    expect(canReorderMomentMedia({
      ...draft, pendingRevision: {
        ...draft.pendingRevision, attachmentIds: ["media-A", "media-A"],
      },
    })).toBe(false);
    expect(canReorderMomentMedia({ ...draft, status: "pending" })).toBe(false);
    expect(canReorderMomentMedia({ ...draft, canEdit: false })).toBe(false);
    expect(canReorderMomentMedia({ ...draft, attachmentCount: 1 })).toBe(true);
    expect(canReorderMomentMedia({ ...draft, attachmentCount: 3 })).toBe(false);
    await expect(reorderMomentMedia({
      editor: draft, from: -1, to: 1, clientRequestId: UUID,
    })).rejects.toThrow("Некорректная");
    await expect(reorderMomentMedia({
      editor: draft, from: 0, to: 0, clientRequestId: UUID,
    })).rejects.toThrow("Некорректная");
    await expect(reorderMomentMedia({
      editor: draft, from: 0, to: 2, clientRequestId: UUID,
    })).rejects.toThrow("Некорректная");
    expect(fake).not.toHaveBeenCalled();
    await expect(reorderMomentMedia({
      editor: draft, from: 0, to: 1, clientRequestId: UUID,
    })).rejects.toThrow("не подтвердил");
  });

  it("appending photo preserves earlier attachment IDs and exact Core ACK", async () => {
    const current = {
      id: "post-1", status: "draft" as const, version: 2, text: "",
      canEdit: true, attachmentCount: 0,
      pendingRevision: {
        status: "draft" as const, text: "Собаки учатся",
        attachmentIds: ["media-previous"],
      },
    };
    const fake = vi.fn().mockResolvedValue(result({
      ...editor, version: 3, pendingRevision: {
        status: "draft", text: "Собаки учатся",
        attachmentIds: ["media-previous", "media-new"],
      },
    }));
    vi.stubGlobal("fetch", fake);
    expect(canAppendMomentMedia(current)).toBe(true);
    const after = await appendMomentMediaRevision({
      editor: current, mediaId: "media-new", clientRequestId: UUID,
    });
    expect(after.pendingRevision?.attachmentIds)
      .toEqual(["media-previous", "media-new"]);
    expect(fake.mock.calls[0][0]).toBe("/api/v1/feed/posts/post-1/revisions");
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
      clientRequestId: UUID, expectedVersion: 2,
      text: "Собаки учатся", attachmentIds: ["media-previous", "media-new"],
    });
  });

  it("photo append fails closed with malformed ACK, media conflicts, pending status", async () => {
    const current = {
      id: "post-1", status: "draft" as const, version: 1, text: "",
      canEdit: true, attachmentCount: 0,
      pendingRevision: {
        status: "draft" as const, text: "Новая фотография", attachmentIds: [],
      },
    };
    const fake = vi.fn().mockResolvedValue(result({
      ...editor, version: 2, pendingRevision: {
        status: "draft", text: "Новая фотография", attachmentIds: ["wrong-media"],
      },
    }));
    vi.stubGlobal("fetch", fake);
    await expect(appendMomentMediaRevision({
      editor: current, mediaId: "media-1", clientRequestId: UUID,
    })).rejects.toThrow("не подтвердил");
    expect(canAppendMomentMedia({ ...current, status: "pending" })).toBe(false);
    expect(canAppendMomentMedia({ ...current, attachmentCount: 1 })).toBe(false);
    expect(canAppendMomentMedia({ ...current, pendingRevision: {
      status: "pending", text: "Новая фотография", attachmentIds: [],
    } })).toBe(false);
    await expect(appendMomentMediaRevision({
      editor: { ...current, canEdit: false },
      mediaId: "media-1", clientRequestId: UUID,
    })).rejects.toThrow("недоступно");
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("Core 503 must never become a fake successfully created draft", async () => {
    const fake = vi.fn().mockResolvedValue(result(null, 503));
    vi.stubGlobal("fetch", fake);
    await expect(createMomentDraft(UUID)).rejects.toMatchObject({ status: 503 });
    await expect(listMomentDrafts()).rejects.toMatchObject({ status: 503 });
  });
});
