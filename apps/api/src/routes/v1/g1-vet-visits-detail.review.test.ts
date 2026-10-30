/** Actual JWT/Hono, source-only typed detail read; DB synthetic stub. */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const { detail } = vi.hoisted(() => ({ detail: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: { user: { findUnique: async () => ({
  sessionsRevokedAt: null, registrationPending: false, role: "USER",
}) } } }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: async () => true }));
vi.mock("../../../../../packages/core/src/services/pets/g1VetVisitDetailRead.review.js", () => ({
  getOwnVetVisitDetail: detail,
  VetVisitDetailNotFoundError: class VetVisitDetailNotFoundError extends Error { status = 404; },
}));
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../../middleware/auth";
import { vetVisitDetailReviewRoutes } from "./g1-vet-visits-detail.review";
const origin = "http://local.test";
const path = "/api/v1/pets/pet-A/vet-visits/visit-A";
const h = new Hono();
h.use("/api/v1/pets/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store"); await next();
});
h.use("/api/v1/pets/*", authMiddleware);
h.route("/api/v1/pets", vetVisitDetailReviewRoutes);
let a = ""; let b = "";
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  a = await generateAccessToken({ id: "owner-A", username: "a", role: "USER" });
  b = await generateAccessToken({ id: "owner-B", username: "b", role: "USER" });
});
beforeEach(() => {
  vi.clearAllMocks();
  detail.mockImplementation(async (id: string) => {
    if (id === "owner-A") return { id: "visit-A", petId: "pet-A", attachments: [] };
    const { VetVisitDetailNotFoundError } = await import(
      "../../../../../packages/core/src/services/pets/g1VetVisitDetailRead.review.js"
    );
    throw new VetVisitDetailNotFoundError();
  });
});
const get = (token: string, url = path, cookie = false) => h.request(origin + url, {
  headers: cookie ? { cookie: `gafus_access=${token}` } : { authorization: `Bearer ${token}` },
});
describe("AG1 Hono private VetVisits detail GET review", () => {
  it("H01 signed owner DTO response no-store, no medical keys/URLs", async () => {
    const res = await get(a);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.json()).toEqual({ success: true, data: {
      id: "visit-A", petId: "pet-A", attachments: [],
    } });
    expect(detail).toHaveBeenCalledWith("owner-A", "pet-A", "visit-A");
  });
  it("H02 other owner same path gets masked 404, no target medical fields", async () => {
    const res = await get(b);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ success: false, code: "VET_VISIT_NOT_FOUND" });
    expect(detail).toHaveBeenCalledWith("owner-B", "pet-A", "visit-A");
  });
  it("H03 missing/bad JWT 401 before Core; cookie GET allowed read-only", async () => {
    expect((await h.request(origin + path)).status).toBe(401);
    expect((await get("bad.jwt")).status).toBe(401);
    expect(detail).not.toHaveBeenCalled();
    expect((await get(a, path, true)).status).toBe(200);
  });
  it("H04 forged ownerId query, invalid ID masked before Core", async () => {
    const query = await get(a, path + "?ownerId=owner-B");
    expect(query.status).toBe(404);
    const other = await get(a, "/api/v1/pets/pet-A/vet-visits/invalid%25id");
    expect(other.status).toBe(404);
    expect(detail).not.toHaveBeenCalled();
  });
  it("H05 Core exception returns sanitized 500, no diagnosis/keys", async () => {
    detail.mockRejectedValueOnce(new Error("PHI_SECRET_S3_KEY_DIAGNOSIS"));
    const res = await get(a);
    expect(res.status).toBe(500);
    const json = await res.text();
    expect(json).not.toContain("PHI_SECRET");
    expect(json).toContain("VET_VISIT_READ_FAILED");
  });
});
