import { describe, expect, it } from "vitest";
import { dto } from "./messageDto";
const base = {
  id: "message_1", conversationId: "room_1", sequence: 124n,
  authorId: "synthetic_author", clientMessageId: "synthetic_request",
  text: "Synthetic original message", replyToId: null,
  createdAt: new Date("2026-11-03T12:00:00Z"),
  editedAt: null, deletedAt: null,
};
const attachments = [
  { id: "ready_1", kind: "image", mime: "image/webp", name: "one.webp", bytes: 200, status: "READY" },
  { id: "processing_1", kind: "video", mime: "video/mp4", name: "pending.mp4", bytes: 500, status: "PROCESSING" },
  { id: "failed_1", kind: "image", mime: "image/webp", name: "failed.webp", bytes: 0, status: "FAILED" },
];
describe("Chat2 pure message wire projection", () => {
  it("serializes bigint and dates without leaking nonready attachments", () => {
    expect(dto({ ...base, attachments })).toEqual({
      id: base.id, conversationId: base.conversationId, sequence: "124",
      authorId: base.authorId, clientMessageId: base.clientMessageId,
      text: base.text, replyToId: null,
      createdAt: "2026-11-03T12:00:00.000Z", editedAt: null, deletedAt: null,
      attachments: [{ id: "ready_1", kind: "image", mime: "image/webp", name: "one.webp", bytes: 200 }],
    });
  });
  it("deleted messages never disclose text or media, including previously READY media", () => {
    const projected = dto({ ...base, deletedAt: new Date("2026-11-03T12:05:00Z"), attachments });
    expect(projected.text).toBe("");
    expect(projected.attachments).toEqual([]);
    expect(projected.deletedAt).toBe("2026-11-03T12:05:00.000Z");
  });
  it("edits serialize ISO dates and absent attachment array becomes empty", () => {
    const projected = dto({ ...base, editedAt: new Date("2026-11-03T12:03:00Z") });
    expect(projected.editedAt).toBe("2026-11-03T12:03:00.000Z");
    expect(projected.attachments).toEqual([]);
  });
});
