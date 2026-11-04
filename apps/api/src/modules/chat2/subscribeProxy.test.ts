import { describe, expect, it, vi } from "vitest";
import { createChat2SubscribeProxyRoutes, CHAT2_PROXY_SECRET_HEADER } from "./subscribeProxy";
const secret = "synthetic-gafus-only-subscribe-proxy-test-secret-32plus";
const payload = { user: "actor", channel: "chat2:room-1" };
function make() {
  const checkCurrentMembership = vi.fn().mockResolvedValue({ role: "MEMBER" });
  const app = createChat2SubscribeProxyRoutes({ brokerSharedSecret: secret, checkCurrentMembership });
  const post = (body: string, header = secret, type = "application/json") => app.request(
    "http://127.0.0.1/chat2-subscribe", {
      method: "POST", headers: { [CHAT2_PROXY_SECRET_HEADER]: header, "content-type": type },
      body,
    });
  return { checkCurrentMembership, app, post };
}
describe("private Centrifugo server-to-Hono subscription proxy (not public mounted)", () => {
  it("rejects missing short secret at route construction", () => {
    expect(() => createChat2SubscribeProxyRoutes({ brokerSharedSecret: "x",
      checkCurrentMembership: vi.fn() })).toThrow("CHAT2_SUBSCRIBE_PROXY_SECRET_MISSING");
  });
  it("allows a broker-authenticated actor only after live readGate verifies room", async () => {
    const { post, checkCurrentMembership } = make();
    const response = await post(JSON.stringify(payload));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: {} });
    expect(checkCurrentMembership).toHaveBeenCalledExactlyOnceWith("actor", "room-1");
  });
  it.each(["", "bad", "client-forged-room-jwt", "x".repeat(300)])(
    "rejects forged or absent broker headers before any Prisma query (%s)", async header => {
      const { post, checkCurrentMembership } = make();
      const response = await post(JSON.stringify(payload), header);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: { code: 403, message: "permission denied" } });
      expect(checkCurrentMembership).not.toHaveBeenCalled();
    });
  it("denies invalid JSON, wrong MIME, and oversized inputs before the current ACL gate", async () => {
    const { post, checkCurrentMembership } = make();
    expect((await post("{invalid")).status).toBe(400);
    expect((await post(JSON.stringify(payload), secret, "text/plain")).status).toBe(400);
    expect((await post(JSON.stringify({ ...payload, padding:"x".repeat(9000) }))).status)
      .toBe(413);
    expect(checkCurrentMembership).not.toHaveBeenCalled();
  });
  it("fails closed if membership, course or database query rejects", async () => {
    const { post, checkCurrentMembership } = make();
    checkCurrentMembership.mockRejectedValueOnce(Error("PRIVATE_DB_OUTAGE"));
    const response = await post(JSON.stringify(payload));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ error: { code: 403, message: "permission denied" } });
  });
  it("does not accidentally accept browser GET or arbitrary pathname", async () => {
    const { app, checkCurrentMembership } = make();
    expect((await app.request("http://127.0.0.1/chat2-subscribe")).status).toBe(404);
    expect((await app.request("http://127.0.0.1/other", { method: "POST" })).status).toBe(404);
    expect(checkCurrentMembership).not.toHaveBeenCalled();
  });
});
