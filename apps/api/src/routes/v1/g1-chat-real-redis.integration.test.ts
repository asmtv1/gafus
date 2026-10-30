/** Opt-in only: actual Redis EVAL INCR/EXPIRE used by the real chat dispatcher.
 * Isolated 127.0.0.1:16381 only. Core DB/Stream/media all mocked.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const enabled = process.env.G1_LOCAL_REDIS_INTEGRATION === "1";
const m = vi.hoisted(() => ({ send: vi.fn(), communitySend: vi.fn(), state: vi.fn() }));
vi.unmock("ioredis");
vi.mock("@gafus/queues", async () => {
  if (process.env.G1_LOCAL_REDIS_INTEGRATION !== "1") {
    return { connection: { eval: async () => 1, disconnect: () => undefined, ping: async () => "PONG" } };
  }
  const { default: Redis } = await import("ioredis");
  return { connection: new Redis("redis://127.0.0.1:16381", {
    lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 1,
  }) };
});
vi.mock("@gafus/core/services/cynologistChat", () => ({
  ChatError: class extends Error {
    constructor(public code: string, message: string, public status = 400) { super(message); }
  },
  sendChatMessage: m.send, sendCommunityChatMessage: m.communitySend,
  getChatState: m.state,
  getCommunityChatState: m.state, startChat: vi.fn(), getChatSession: vi.fn(),
  listChatDialogs: vi.fn(), manageChatReaction: vi.fn(), manageOwnChatMessage: vi.fn(),
  communityModerationOverview: vi.fn(), moderateCommunityChat: vi.fn(),
  getCommunityChatSession: vi.fn(),
}));
vi.mock("@gafus/core/services/cynologistChat/upload", () => ({
  deleteChatAttachment: vi.fn(),
}));
vi.mock("../../../../../packages/chat-server/src/upload.js", () => ({
  uploadChatAttachmentRequest: vi.fn(),
}));
import { connection } from "@gafus/queues";
import { dispatchChatRequest } from "../../../../../packages/chat-server/src/index.js";
const suite = enabled ? describe : describe.skip;
async function send(actor: string, community: boolean) {
  return dispatchChatRequest(actor, new Request("http://local.test/api/v1/chat", {
    method: "POST", body: "{}",
  }), "messages", community);
}
suite("G1 real disposable Redis: chat Lua rate limits", () => {
  beforeAll(async () => {
    if (process.env.G1_LOCAL_REDIS_URL !== "redis://127.0.0.1:16381") {
      throw new Error("G1 Redis integration requires exact isolated 16381 URL");
    }
    expect(await connection.ping()).toBe("PONG");
  });
  afterAll(() => connection.disconnect());

  it("allows community message #20, blocks #21, no Core call on denied", async () => {
    m.communitySend.mockClear();
    const actor = `g1-community-${randomUUID()}`;
    for (let i = 0; i < 20; i++) await send(actor, true);
    expect(m.communitySend).toHaveBeenCalledTimes(20);
    await expect(send(actor, true))
      .rejects.toMatchObject({ code: "CHAT_RATE_LIMIT", status: 429 });
    expect(m.communitySend).toHaveBeenCalledTimes(20);
  });

  it("allows private message #60, blocks #61, no Core call on denied", async () => {
    m.send.mockClear();
    const actor = `g1-private-${randomUUID()}`;
    for (let i = 0; i < 60; i++) await send(actor, false);
    expect(m.send).toHaveBeenCalledTimes(60);
    await expect(send(actor, false))
      .rejects.toMatchObject({ code: "CHAT_RATE_LIMIT", status: 429 });
    expect(m.send).toHaveBeenCalledTimes(60);
  });

  it("independent actors do not share quota in community chat", async () => {
    const a = `g1-A-${randomUUID()}`, b = `g1-B-${randomUUID()}`;
    for (let i = 0; i < 20; i++) await send(a, true);
    await expect(send(a, true)).rejects.toMatchObject({ status: 429 });
    await expect(send(b, true)).resolves.toBeUndefined();
  });
});
