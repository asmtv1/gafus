import { describe, it, expect } from "vitest";
import { reserveChatSendAttempt } from "./sendAttempt";
const base = { actorId: "admin", conversationId: "room-a", text: "hello", replyToId: null, attachmentIds: ["asset-a", "asset-b"] };
let n = 0;
const nextId = () => `id-${++n}`;
describe("one logical Chat2 send attempt shared by web and mobile", () => {
  it("reuses ID after lost response or repeated tap, and keeps successful sequential messages distinct", () => {
    n = 0;
    const first = reserveChatSendAttempt(null, base, nextId);
    const retry = reserveChatSendAttempt(first, { ...base, attachmentIds: [...base.attachmentIds] }, nextId);
    expect(retry.clientMessageId).toBe(first.clientMessageId);
    const afterAck = reserveChatSendAttempt(null, base, nextId);
    expect(afterAck.clientMessageId).not.toBe(first.clientMessageId);
  });
  it("changes ID for edited text, reply, attachment order, room or actor", () => {
    n = 0;
    const first = reserveChatSendAttempt(null, base, nextId);
    for (const changed of [
      { ...base, text: "hello again" }, { ...base, replyToId: "message-c" },
      { ...base, attachmentIds: ["asset-b", "asset-a"] },
      { ...base, attachmentIds: ["asset-a"] },
      { ...base, conversationId: "room-b" }, { ...base, actorId: "other" },
    ]) expect(reserveChatSendAttempt(first, changed, nextId).clientMessageId).not.toBe(first.clientMessageId);
  });
  it("keeps already-uploaded attachment identity stable across retry and protects snapshot from mutations", () => {
    n = 0;
    const ids = ["asset-a", "asset-b"];
    const first = reserveChatSendAttempt(null, { ...base, attachmentIds: ids }, nextId);
    ids.push("asset-c");
    expect(first.draft.attachmentIds).toEqual(["asset-a", "asset-b"]);
    expect(reserveChatSendAttempt(first, base, nextId).clientMessageId).toBe(first.clientMessageId);
  });
});
