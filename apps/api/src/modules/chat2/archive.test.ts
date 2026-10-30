import { describe, expect, it } from "vitest";
import { importedClientMessageId, validateArchive } from "./archive";
const m = (sourceId: string, authorId = "user1", replyToSourceId?: string) => ({
  sourceId,
  authorId,
  createdAt: "2026-10-20T14:25:00.000Z",
  text: `Message ${sourceId}`,
  ...(replyToSourceId ? { replyToSourceId } : {}),
});
const direct = (messages: ReturnType<typeof m>[]) => ({
  format: "gafus-chat2-archive-v1",
  conversations: [{ kind: "DIRECT", sourceId: "legacy-c1", members: ["user1", "user2"], messages }],
});
describe("Offline Chat2 archive validation and safety", () => {
  it("accepts a strict minimal export and counts records", () => {
    expect(validateArchive(direct([m("a"), m("b", "user2", "a")])).summary).toEqual({
      conversations: 1,
      messages: 2,
    });
  });
  it("generates deterministic scoped UUIDs for replay-safe imports", () => {
    const id = importedClientMessageId("channel1", "external-message-id");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(importedClientMessageId("channel1", "external-message-id")).toBe(id);
    expect(importedClientMessageId("channel2", "external-message-id")).not.toBe(id);
  });
  it("rejects exports containing foreign authors", () => {
    expect(() => validateArchive(direct([m("a", "outsider")]))).toThrow(
      "ARCHIVE_AUTHOR_NOT_MEMBER",
    );
  });
  it("rejects duplicate source message IDs", () => {
    expect(() => validateArchive(direct([m("a"), m("a")]))).toThrow("DUPLICATE_ARCHIVE_MESSAGE");
  });
  it("rejects orphan replies", () => {
    expect(() => validateArchive(direct([m("a", "user1", "lost")]))).toThrow(
      "MISSING_ARCHIVE_REPLY",
    );
  });
  it("rejects extra fields such as unsigned external media links", () => {
    expect(() =>
      validateArchive({ ...direct([m("a")]), externalMedia: ["https://example.invalid"] }),
    ).toThrow();
  });
  it("rejects two archive rooms for the same person pair", () => {
    const source = direct([m("a")]);
    expect(() =>
      validateArchive({
        format: source.format,
        conversations: [
          source.conversations[0],
          { ...source.conversations[0], sourceId: "another" },
        ],
      }),
    ).toThrow("DUPLICATE_ARCHIVE_ROOM");
  });
  it("rejects self-direct chat and non-text attachments that require manual migration", () => {
    const source = direct([m("a")]);
    expect(() =>
      validateArchive({
        format: source.format,
        conversations: [{ ...source.conversations[0], members: ["user1", "user1"] }],
      }),
    ).toThrow();
    expect(() =>
      validateArchive({
        format: source.format,
        conversations: [
          {
            ...source.conversations[0],
            messages: [{ ...m("a"), attachments: ["https://cdn.invalid/file"] }],
          },
        ],
      }),
    ).toThrow();
  });
});
