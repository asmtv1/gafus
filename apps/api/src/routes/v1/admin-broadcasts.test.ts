import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  verify: vi.fn(), reg: vi.fn(), role: vi.fn(), count: vi.fn(), broadcast: vi.fn(),
  redisSet: vi.fn(), redisGet: vi.fn(),
}));
vi.mock("@gafus/queues", () => ({ connection: { set: f.redisSet, get: f.redisGet } }));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: f.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: f.reg }));
vi.mock("@gafus/core/services/adminUser", () => ({ readAdminActorRole: f.role }));
vi.mock("@gafus/core/services/adminBroadcast", () => ({ sendBroadcastPush: f.broadcast, countBroadcastSubscriptionRows: f.count }));
import { authMiddleware } from "../../middleware/auth";
import { adminBroadcastRoutes } from "./admin-broadcasts";
const base = "/api/v1/admin/broadcasts";
function app() {
  const h = new Hono();
  h.use(base, authMiddleware);
  h.use(`${base}/*`, authMiddleware);
  h.route(base, adminBroadcastRoutes);
  return h;
}
const request = (path: string, method = "GET", body?: object, auth = true) => app().request(
  "http://local.test" + base + path, {
    method, headers: {
      ...(auth ? { authorization: "Bearer token" } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}),
  },
);
const valid = {
  title: "Новости GAFUS", body: "Новый курс открыт", url: "/courses",
  confirmation: "SEND_TO_ALL_SUBSCRIBERS",
  idempotencyKey: "18056ac7-5358-4f48-9c4a-3e23c3baec28",
};
beforeEach(() => {
  vi.clearAllMocks();
  f.verify.mockResolvedValue({ id: "admin1", role: "ADMIN", username: "admin" });
  f.reg.mockResolvedValue(true);
  f.role.mockResolvedValue("ADMIN");
  f.count.mockResolvedValue(42);
  f.redisSet.mockResolvedValue("OK");
  f.redisGet.mockResolvedValue(null);
  f.broadcast.mockResolvedValue({ success: true, totalUsers: 41, sentCount: 40, failedCount: 1 });
});

describe("broadcast workflow", () => {
  it("rejects guests without touching push service", async () => {
    expect((await request("/preview", "GET", undefined, false)).status).toBe(401);
    expect((await request("", "POST", valid, false)).status).toBe(401);
    expect(f.broadcast).not.toHaveBeenCalled();
  });
  it("rejects MODERATOR", async () => {
    f.verify.mockResolvedValue({ id: "mod", role: "MODERATOR", username: "mod" });
    expect((await request("/preview")).status).toBe(403);
    expect((await request("", "POST", valid)).status).toBe(403);
    expect(f.broadcast).not.toHaveBeenCalled();
  });
  it("rejects revoked admin with old JWT", async () => {
    f.role.mockResolvedValue("USER");
    expect((await request("/preview")).status).toBe(403);
    expect((await request("", "POST", valid)).status).toBe(403);
    expect(f.broadcast).not.toHaveBeenCalled();
  });
  it("preview reports raw subscription count and never sends", async () => {
    const response = await request("/preview");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ success: true,
      data: { subscriptions: 42, kind: "raw_subscription_rows" } });
    expect(f.broadcast).not.toHaveBeenCalled();
  });
  it("rejects write without deliberate confirmation", async () => {
    const { confirmation: _ignored, ...unconfirmed } = valid;
    const response = await request("", "POST", unconfirmed);
    expect(response.status).toBe(400);
    expect(f.broadcast).not.toHaveBeenCalled();
  });
  it("rejects external URL instead of directing users away", async () => {
    const response = await request("", "POST", { ...valid, url: "https://phishing.tld" });
    expect(response.status).toBe(400);
    expect(f.broadcast).not.toHaveBeenCalled();
  });
  it("calls existing push Core only once for deliberate confirmed POST", async () => {
    const response = await request("", "POST", valid);
    expect(response.status).toBe(200);
    expect(f.broadcast).toHaveBeenCalledOnce();
    expect(f.broadcast).toHaveBeenCalledWith("Новости GAFUS", "Новый курс открыт", "/courses");
  });
  it("requires an idempotency key before touching the transport", async () => {
    const { idempotencyKey: _omitted, ...input } = valid;
    expect((await request("", "POST", input)).status).toBe(400);
    expect(f.redisSet).not.toHaveBeenCalled();
    expect(f.broadcast).not.toHaveBeenCalled();
  });
  it("returns the cached result on a duplicate request without another send", async () => {
    const first = await request("", "POST", valid);
    expect(first.status).toBe(200);
    const persisted = f.redisSet.mock.calls[1]?.[1] as string;
    expect(JSON.parse(persisted).state).toBe("SUCCEEDED");
    f.redisSet.mockResolvedValueOnce(null);
    f.redisGet.mockResolvedValueOnce(persisted);
    const repeated = await request("", "POST", valid);
    expect(repeated.status).toBe(200);
    expect((await repeated.json()).replayed).toBe(true);
    expect(f.broadcast).toHaveBeenCalledOnce();
  });
  it("serializes concurrent attempts of the same action key", async () => {
    let unblock!: (value: unknown) => void;
    const deferred = new Promise(resolve => { unblock = resolve; });
    f.broadcast.mockReturnValueOnce(deferred);
    f.redisSet.mockResolvedValueOnce("OK").mockResolvedValueOnce(null);
    f.redisGet.mockResolvedValueOnce(JSON.stringify({
      fingerprint: "unverified", state: "IN_PROGRESS",
    }));
    const first = request("", "POST", valid);
    // When the second caller sees the shared Redis NX marker, no new dispatch runs.
    const second = request("", "POST", valid);
    expect((await second).status).toBe(409);
    expect(f.broadcast).toHaveBeenCalledOnce();
    unblock({ success: true, totalUsers: 41, sentCount: 40, failedCount: 1 });
    expect((await first).status).toBe(200);
    expect(f.broadcast).toHaveBeenCalledOnce();
  });
  it("rejects an in-progress request without calling the transport", async () => {
    f.redisSet.mockResolvedValueOnce(null);
    f.redisGet.mockResolvedValueOnce(JSON.stringify({ fingerprint: "placeholder", state: "IN_PROGRESS" }));
    const response = await request("", "POST", valid);
    expect(response.status).toBe(409);
    expect(f.broadcast).not.toHaveBeenCalled();
  });
  it("fails closed when Redis is unavailable", async () => {
    f.redisSet.mockRejectedValueOnce(new Error("redis endpoint secret"));
    const response = await request("", "POST", valid);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("redis endpoint secret");
    expect(f.broadcast).not.toHaveBeenCalled();
  });
  it("retains UNKNOWN outcome and does not send again after partial failure", async () => {
    f.broadcast.mockResolvedValueOnce({ success: false, totalUsers: 5, sentCount: 2, failedCount: 3 });
    expect((await request("", "POST", valid)).status).toBe(503);
    const marker = f.redisSet.mock.calls[1]?.[1] as string;
    expect(JSON.parse(marker).state).toBe("UNKNOWN");
    f.redisSet.mockResolvedValueOnce(null);
    f.redisGet.mockResolvedValueOnce(marker);
    const second = await request("", "POST", valid);
    expect(second.status).toBe(409);
    expect(f.broadcast).toHaveBeenCalledOnce();
  });
  it("rejects reuse of an idempotency key with a different payload", async () => {
    expect((await request("", "POST", valid)).status).toBe(200);
    const persisted = f.redisSet.mock.calls[1]?.[1] as string;
    f.redisSet.mockResolvedValueOnce(null);
    f.redisGet.mockResolvedValueOnce(persisted);
    const second = await request("", "POST", { ...valid, title: "Другое сообщение" });
    expect(second.status).toBe(409);
    expect((await second.json()).code).toBe("IDEMPOTENCY_KEY_CONFLICT");
    expect(f.broadcast).toHaveBeenCalledOnce();
  });
  it("returns aggregate failure count without exposing provider errors", async () => {
    f.broadcast.mockResolvedValue({ success: false, error: "secret-api-key", totalUsers: 1,
      sentCount: 0, failedCount: 1 });
    const response = await request("", "POST", valid);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-api-key");
  });
  it("masks unhandled provider errors", async () => {
    f.broadcast.mockRejectedValue(new Error("secret-expo-token"));
    const response = await request("", "POST", valid);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-expo-token");
  });
});
