/** AG1-USER-020: anonymous public profile must expose only public DTO fields. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ publicProfile: vi.fn(), verify: vi.fn() }));
vi.mock("@gafus/core/services/user", async () => {
  const { z } = await import("zod/v3");
  return {
    getPublicProfile: m.publicProfile,
    // User profile composition imports these even though this anonymous test never calls them.
    getUserProfileForApi: vi.fn(),
    updateUserProfile: vi.fn(),
    deleteUserAccountBodySchema: z.object({ code: z.string() }),
  };
});
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: m.verify }));
vi.mock("@gafus/core/services/auth", () => ({
  isRegistrationCompleted: async () => true,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));
import { authMiddleware } from "../../middleware/auth";
import { userRoutes } from "./user";

const PRIVATE = "NEVER_EXPOSE_PRIVATE_PROFILE_20261021";
const publicProfile = (username: string) => ({
  username, role: "USER", chatRole: "subscriber",
  profile: {
    fullName: username, city: "Samara", birthDate: null, about: "Visible",
    telegram: null, instagram: null, website: null, avatarUrl: null,
    email: PRIVATE, phone: PRIVATE, privateMedicalNotes: PRIVATE,
  },
  diplomas: [{
    id: "diploma-public", title: "Visible", issuedBy: "Instructor",
    issuedAt: new Date("2026-10-01"), url: "https://example.test/diploma",
    privateMedicalNotes: PRIVATE,
  }],
  pets: [{
    id: "pet-public", name: "Dog", type: "DOG", breed: "", birthDate: null,
    photoUrl: null, veterinarianNotes: PRIVATE, medicalHistory: PRIVATE,
  }],
  courses: [{
    id: "course-public", name: "Visible", type: "TRAINING",
    logoImg: "", shortDesc: "", duration: "", isPrivate: false,
    isPaid: false, avgRating: null, updatedAt: new Date("2026-10-01"),
    trainingLevel: "BEGINNER", purchaseReceipt: PRIVATE,
  }],
  authoredCourses: [{ id: "course-private", privateEntitlement: PRIVATE }],
  id: PRIVATE, email: PRIVATE, phone: PRIVATE, subscription: PRIVATE,
  customerToken: PRIVATE, petsMedicalInfo: PRIVATE,
});
function app() {
  const h = new Hono();
  h.use("/api/v1/user/*", authMiddleware);
  h.route("/api/v1/user", userRoutes);
  return h;
}
beforeEach(() => vi.clearAllMocks());

describe("AG1-USER-020 exact public GET boundary: guest/A/B, no PII or entitlement", () => {
  it.each([
    ["guest", undefined],
    ["A", "Bearer SYNTHETIC_A"],
    ["B", "Bearer SYNTHETIC_B"],
  ])("%s caller cannot obtain unexpected private fields for target", async (_, auth) => {
    m.publicProfile.mockResolvedValueOnce(publicProfile("target"));
    const response = await app().request("/api/v1/user/profile/public?username=target", {
      headers: auth ? { Authorization: auth } : {},
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { data, success } = await response.json();
    expect(success).toBe(true);
    expect(Object.keys(data).sort()).toEqual([
      "chatRole", "courses", "diplomas", "pets", "profile", "role", "username",
    ]);
    expect(Object.keys(data.profile).sort()).toEqual([
      "about", "avatarUrl", "birthDate", "city", "fullName",
      "instagram", "telegram", "website",
    ]);
    expect(Object.keys(data.pets[0]).sort()).toEqual([
      "birthDate", "breed", "id", "name", "photoUrl", "type",
    ]);
    expect(Object.keys(data.courses[0]).sort()).toEqual([
      "avgRating", "duration", "id", "isPaid", "isPrivate", "logoImg",
      "name", "shortDesc", "trainingLevel", "type", "updatedAt",
    ]);
    expect(Object.keys(data.diplomas[0]).sort()).toEqual([
      "id", "issuedAt", "issuedBy", "title", "url",
    ]);
    expect(JSON.stringify(data)).not.toContain(PRIVATE);
    expect(m.publicProfile).toHaveBeenCalledExactlyOnceWith("target");
    expect(m.verify).not.toHaveBeenCalled();
  });

  it("A asking for B returns B public details and never caller's private info", async () => {
    m.publicProfile.mockImplementation(async (name: string) => publicProfile(name));
    const res = await app().request("/api/v1/user/profile/public?username=B", {
      headers: { Authorization: "Bearer SYNTHETIC_A" },
    });
    expect(res.status).toBe(200);
    const response = await res.json();
    expect(response.data.username).toBe("B");
    expect(JSON.stringify(response)).not.toContain(PRIVATE);
    expect(m.publicProfile).toHaveBeenCalledWith("B");
  });

  it("not found 404 preserves existing anonymous contract", async () => {
    m.publicProfile.mockResolvedValueOnce(null);
    const res = await app().request("/api/v1/user/profile/public?username=unknown");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: "Профиль не найден" });
  });

  it("invalid username 400 never calls Core", async () => {
    const res = await app().request("/api/v1/user/profile/public");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: "Требуется username" });
    expect(m.publicProfile).not.toHaveBeenCalled();
  });

  it("Core rejection returns fixed 500 and never raw private content", async () => {
    m.publicProfile.mockRejectedValueOnce(new Error(PRIVATE));
    const res = await app().request("/api/v1/user/profile/public?username=target");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false, error: "Внутренняя ошибка сервера",
    });
  });
});
