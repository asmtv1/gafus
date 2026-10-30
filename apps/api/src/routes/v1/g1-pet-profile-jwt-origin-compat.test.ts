/** Actual Hono signed-JWT and Cookie Origin with mock persistence only. */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const { updatePet, updateProfile } = vi.hoisted(() => ({
  updatePet: vi.fn(), updateProfile: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: { user: { findUnique: async () => ({
    sessionsRevokedAt: null, registrationPending: false, role: "USER",
  }) } },
}));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: async () => true }));
vi.mock("@gafus/core/services/pets", async (load) => ({
  ...(await load<object>()), updatePet,
}));
vi.mock("@gafus/core/services/user", async (load) => ({
  ...(await load<object>()), updateUserProfile: updateProfile,
}));
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../../middleware/auth";
import { petsRoutes } from "./pets";
import { userRoutes } from "./user";
const app = new Hono();
app.use("/api/v1/pets/*", authMiddleware);
app.use("/api/v1/user/*", authMiddleware);
app.route("/api/v1/pets", petsRoutes);
app.route("/api/v1/user", userRoutes);
const petPath = "/api/v1/pets/pet-X";
const profilePath = "/api/v1/user/profile";
let a = ""; let b = "";
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  a = await generateAccessToken({ id: "owner-A", username: "a", role: "USER" });
  b = await generateAccessToken({ id: "owner-B", username: "b", role: "USER" });
});
beforeEach(() => {
  vi.clearAllMocks();
  updatePet.mockImplementation(async (_pet: string, id: string, data: object) => ({
    id: "pet-X", ownerId: id, ...data,
  }));
  updateProfile.mockImplementation(async (id: string, data: object) => ({
    userId: id, ...data,
  }));
});
const put = (path: string, data: object, token: string, cookie = false, origin?: string) =>
  app.request(path, { method: "PUT", headers: {
    "content-type": "application/json",
    ...(cookie ? { cookie: `gafus_access=${token}` } : { authorization: `Bearer ${token}` }),
    ...(origin ? { origin } : {}),
  }, body: JSON.stringify(data) });
describe("Pet/profile nullable clear JWT bearer/cookie real Hono contract", () => {
  it("JWT01 Bearer owner A and B write only their server-verified owner", async () => {
    expect((await put(petPath, { neckGirthCm: null, ownerId: "owner-B" }, a)).status)
      .toBe(200);
    expect(updatePet).toHaveBeenCalledWith("pet-X", "owner-A", { neckGirthCm: null });
    expect((await put(petPath, { bellyGirthCm: null, ownerId: "owner-A" }, b)).status)
      .toBe(200);
    expect(updatePet).toHaveBeenLastCalledWith("pet-X", "owner-B", { bellyGirthCm: null });
  });
  it("JWT02 cookie without/wrong Origin 403, trusted Origin 200", async () => {
    expect((await put(profilePath, { city: "" }, a, true)).status).toBe(403);
    expect((await put(profilePath, { city: "" }, a, true, "https://evil.example")).status)
      .toBe(403);
    expect(updateProfile).not.toHaveBeenCalled();
    const trusted = await put(profilePath, { city: "" }, a, true, "https://gafus.ru");
    expect(trusted.status).toBe(200);
    expect(updateProfile).toHaveBeenCalledWith("owner-A", { city: "" });
  });
  it("JWT03 invalid signed token 401, no call to persistence", async () => {
    expect((await put(petPath, { heightCm: null }, "invalid.jwt")).status).toBe(401);
    expect(updatePet).not.toHaveBeenCalled();
  });
});
