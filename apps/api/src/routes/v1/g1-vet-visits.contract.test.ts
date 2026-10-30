/** G1 real Hono vet visit wildcard URL routing, Core transport isolated. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(), registration: vi.fn(), handle: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: m.verifyAccessToken }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: m.registration }));
vi.mock("@gafus/core/services/pets", () => ({ handlePetVetVisitRequest: m.handle }));
import { authMiddleware } from "../../middleware/auth";
import { petVetVisitRoutes } from "./pet-vet-visits";
const root = "http://local.test/api/v1/pets/pet-A/vet-visits";
function app() {
  const h = new Hono();
  h.use("/api/v1/pets/*", authMiddleware);
  h.route("/api/v1/pets", petVetVisitRoutes);
  return h;
}
function call(path = "", method = "GET", body?: string) {
  return app().request(root + path, {
    method, headers: { authorization: "Bearer native-token" },
    ...(body ? { body } : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.verifyAccessToken.mockResolvedValue({ id: "actor-A", username: "a", role: "USER" });
  m.registration.mockResolvedValue(true);
  m.handle.mockResolvedValue(Response.json({ success: true, data: [] }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  }));
});
describe("G1 pet vet wildcard to Core transport boundary", () => {
  it("blocks requests without JWT before Core", async () => {
    const r = await app().request(root);
    expect(r.status).toBe(401);
    expect(m.handle).not.toHaveBeenCalled();
  });
  it("rejects invalid JWT before Core", async () => {
    m.verifyAccessToken.mockResolvedValueOnce(null);
    expect((await call()).status).toBe(401);
    expect(m.handle).not.toHaveBeenCalled();
  });
  it("GET list forwards JWT actor and empty suffix", async () => {
    const r = await call("?ownerId=actor-B");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(m.handle).toHaveBeenCalledWith(
      expect.any(Request), "pet-A", "actor-A", [],
    );
  });
  it("POST new visit delegates original method and raw body", async () => {
    const r = await call("", "POST", '{"ownerId":"actor-B"}');
    expect(r.status).toBe(200);
    const [raw, petId, actor, parts] = m.handle.mock.calls[0]!;
    expect((raw as Request).method).toBe("POST");
    expect(await (raw as Request).text()).toContain('"actor-B"');
    expect([petId, actor, parts]).toEqual(["pet-A", "actor-A", []]);
  });
  it("PUT visit passes one suffix segment", async () => {
    await call("/visit-A", "PUT", "{}");
    expect(m.handle).toHaveBeenCalledWith(expect.any(Request), "pet-A", "actor-A", ["visit-A"]);
  });
  it("nested media carries all four path segments and unchanged query", async () => {
    await call("/visit-A/attachments/attachment-B/media?variant=preview&redirect=1");
    const [raw, petId, actor, parts] = m.handle.mock.calls[0]!;
    expect([petId, actor, parts]).toEqual([
      "pet-A", "actor-A", ["visit-A", "attachments", "attachment-B", "media"],
    ]);
    expect(new URL((raw as Request).url).searchParams.get("redirect")).toBe("1");
  });
  it("cookie mutation from untrusted Origin is rejected", async () => {
    const r = await app().request(root, {
      method: "POST", headers: {
        cookie: "gafus_access=token", origin: "https://attacker.invalid",
        "content-type": "application/json",
      }, body: "{}",
    });
    expect(r.status).toBe(403);
    expect(m.handle).not.toHaveBeenCalled();
  });
  it("incomplete registration cannot list private vet visits", async () => {
    m.registration.mockResolvedValueOnce(false);
    const r = await call();
    expect(r.status).toBe(401);
    expect(m.handle).not.toHaveBeenCalled();
  });
});
