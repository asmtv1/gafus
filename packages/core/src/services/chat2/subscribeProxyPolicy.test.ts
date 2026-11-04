import { describe, expect, it, vi } from "vitest";
import { authorizeChat2SubscriptionProxy } from "./subscribeProxyPolicy";
const denied = { error: { code: 403, message: "permission denied" } };
describe("Chat2 server-side subscribe proxy (requires trusted broker HTTP layer)", () => {
  it("authorizes an exact actor/room pair only after current persisted gate", async () => {
    const check = vi.fn().mockResolvedValue({ role: "MEMBER" });
    expect(await authorizeChat2SubscriptionProxy({ user: "actor_1", channel: "chat2:room-1",
      transport: "websocket" }, check)).toEqual({ result: {} });
    expect(check).toHaveBeenCalledExactlyOnceWith("actor_1", "room-1");
  });
  it("returns a uniform denial after a ban, expired course access or DB outage", async () => {
    for (const reason of [Error("BANNED_ROOM_ID_PRIVATE"), Error("DB_503_SECRETS"),
      { code: "COURSE_ACCESS_REQUIRED", status: 403 }]) {
      const check = vi.fn().mockRejectedValue(reason);
      expect(await authorizeChat2SubscriptionProxy({ user:"actor",channel:"chat2:room" },
        check)).toEqual(denied);
    }
  });
  it.each([null, {}, [], {user: "",channel:"chat2:room"},
    {user:"user",channel:"room"}, {user:"user",channel:"chat2:"},
    {user:"user",channel:"chat2:room?query=evil"},
    {user:"bad:admin",channel:"chat2:room"},
    {user:"user",channel:"questions:photo"},
  ])("denies invalid client-supplied identities and rooms without hitting persistence", async input => {
    const check = vi.fn();
    expect(await authorizeChat2SubscriptionProxy(input, check)).toEqual(denied);
    expect(check).not.toHaveBeenCalled();
  });
});
