import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const mock = vi.hoisted(() => ({
  lookupUsername: vi.fn(),
  openDirect: vi.fn(),
}));
vi.mock("./service.js", () => ({
  Chat2Error: class Chat2Error extends Error {
    constructor(public code: string, public status: number, message: string) {
      super(message);
    }
  },
  openDirect: mock.openDirect,
  findChatUserIdByUsername: mock.lookupUsername,
}));
vi.mock("./realtime.js", () => ({
  connectToken: vi.fn(),
}));

import { chatsRoutes } from "../../routes/v1/chats";

const app = new Hono();
app.use("*", async (c, next) => {
  c.set("user", { id: "sender", username: "sender", role: "USER" });
  await next();
});
app.route("/api/v1/chats", chatsRoutes);
const post = (payload: unknown) => app.request("http://localhost/api/v1/chats/direct", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

beforeEach(() => {
  vi.clearAllMocks();
  mock.lookupUsername.mockResolvedValue("target");
  mock.openDirect.mockResolvedValue({ conversationId: "personal-room" });
});

describe("Chat2 direct-profile HTTP contract", () => {
  it("resolves the exact public username server-side and opens the sender-owned room", async () => {
    const res = await post({ username: "TeAmB" });
    expect(res.status).toBe(201);
    expect(mock.lookupUsername).toHaveBeenCalledExactlyOnceWith("TeAmB");
    expect(mock.openDirect).toHaveBeenCalledExactlyOnceWith("sender", "target");
    expect(await res.json()).toEqual({
      success: true, data: { conversationId: "personal-room" },
    });
  });

  it("preserves existing direct-by-user-id clients", async () => {
    expect((await post({ userId: "target" })).status).toBe(201);
    expect(mock.lookupUsername).not.toHaveBeenCalled();
    expect(mock.openDirect).toHaveBeenCalledExactlyOnceWith("sender", "target");
  });

  it.each([
    { username: "../teamb" },
    { username: "teamb", userId: "target" },
    { username: "teamb", role: "OWNER" },
    { username: "" },
    { userId: "" },
  ])("rejects malformed or privilege-injected targets: %j", async (payload) => {
    const res = await post(payload);
    expect(res.status).toBe(400);
    expect(mock.lookupUsername).not.toHaveBeenCalled();
    expect(mock.openDirect).not.toHaveBeenCalled();
  });

  it("does not create a DM for an unknown/deleted user", async () => {
    mock.lookupUsername.mockResolvedValue(null);
    expect((await post({ username: "missing" })).status).toBe(404);
    expect(mock.openDirect).not.toHaveBeenCalled();
  });
});
