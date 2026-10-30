/** AG1-USER-020: Core must not spread ORM relation internals into PublicProfile. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), displayRole: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: { user: { findFirst: m.find } },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));
vi.mock("../cynologistChat/authorRole", () => ({
  getChatDisplayRole: m.displayRole,
}));
import { getPublicProfile } from "./profileService";

const CANARY = "PRIVATE_CORE_PROFILE_FIELD_NOT_FOR_PUBLIC";
const mockUser = () => ({
  id: "user-A", username: "A", role: "TRAINER", email: CANARY,
  phone: CANARY, entitlement: CANARY, hasAppPassword: true,
  profile: {
    fullName: "Visible", city: "Samara", birthDate: null, about: "Open",
    telegram: null, instagram: null, website: null, avatarUrl: null,
    privateNotes: CANARY, medicalInfo: CANARY,
  },
  diplomas: [{
    id: "d1", title: "Visible", issuedBy: "Org", issuedAt: new Date("2026-01-02"),
    url: null, token: CANARY,
  }],
  pets: [{
    id: "p1", name: "Dog", type: "DOG", breed: null, birthDate: null, photoUrl: null,
    medicalHistory: CANARY,
  }],
  authoredCourses: [{
    id: "c1", name: "Public", type: "TRAINING", logoImg: "", shortDesc: "",
    duration: "", isPrivate: false, isPaid: false, avgRating: null,
    updatedAt: new Date("2026-01-02"), trainingLevel: "BEGINNER",
    purchaseReceipt: CANARY,
  }],
});
beforeEach(() => {
  vi.resetAllMocks();
  m.displayRole.mockResolvedValue("trainer");
});
describe("Core public projection: no raw Prisma relations or private identifiers", () => {
  it("public trainer retains exact DTO shape while omitting raw authoredCourses", async () => {
    m.find.mockResolvedValueOnce(mockUser());
    const result = await getPublicProfile("A");
    expect(result).not.toBeNull();
    expect(Object.keys(result!).sort()).toEqual([
      "chatRole", "courses", "diplomas", "pets", "profile", "role", "username",
    ]);
    expect(Object.keys(result!.profile!).sort()).toEqual([
      "about", "avatarUrl", "birthDate", "city", "fullName",
      "instagram", "telegram", "website",
    ]);
    expect(Object.keys(result!.courses![0]).sort()).toEqual([
      "avgRating", "duration", "id", "isPaid", "isPrivate", "logoImg",
      "name", "shortDesc", "trainingLevel", "type", "updatedAt",
    ]);
    expect(JSON.stringify(result)).not.toContain(CANARY);
    expect(result?.username).toBe("A");
    expect(result?.courses?.[0].name).toBe("Public");
  });

  it("non-trainer excludes authoredCourse data and never exposes hidden pets", async () => {
    const u = mockUser();
    m.find.mockResolvedValueOnce({ ...u, role: "USER", pets: [], authoredCourses: u.authoredCourses });
    m.displayRole.mockResolvedValueOnce(null);
    const result = await getPublicProfile("A");
    expect(result?.courses).toBeUndefined();
    expect(result?.pets).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(CANARY);
    expect(m.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ username: "A" }, { id: "A" }] },
      select: expect.objectContaining({
        pets: expect.objectContaining({
          where: { showInProfile: true },
          select: {
            id: true, name: true, type: true, breed: true,
            birthDate: true, photoUrl: true,
          },
        }),
        authoredCourses: expect.objectContaining({ where: { showInProfile: true } }),
      }),
    }));
  });

  it("notfound returns null without subscription role lookup", async () => {
    m.find.mockResolvedValueOnce(null);
    expect(await getPublicProfile("missing")).toBeNull();
    expect(m.displayRole).not.toHaveBeenCalled();
  });

  it("Prisma failure never turns into fallback public data", async () => {
    m.find.mockRejectedValueOnce(new Error(CANARY));
    await expect(getPublicProfile("A")).rejects.toThrow(CANARY);
    expect(m.displayRole).not.toHaveBeenCalled();
  });
});
