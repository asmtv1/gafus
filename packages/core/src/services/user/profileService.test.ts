import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsert, userFindFirst, userFindUnique } = vi.hoisted(() => ({
  upsert: vi.fn(),
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    userProfile: { upsert },
    user: { findFirst: userFindFirst, findUnique: userFindUnique },
  },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));
vi.mock("../cynologistChat/authorRole", () => ({
  getChatDisplayRole: async () => null,
}));

import { getPublicProfile, getUserProfileForApi, updateUserProfile } from "./profileService";

describe("core profile city ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsert.mockResolvedValue({ userId: "user-1", city: "Москва" });
  });

  it("creates and updates the city in the same upsert", async () => {
    await updateUserProfile("user-1", { city: "  Казань  " });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1" },
      create: expect.objectContaining({ city: "Казань" }),
      update: expect.objectContaining({ city: "Казань" }),
    }));
  });

  it("clears the city with empty input", async () => {
    await updateUserProfile("user-1", { city: "  " });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ city: null }),
      update: expect.objectContaining({ city: null }),
    }));
  });

  it("does not overwrite the city when field is omitted", async () => {
    await updateUserProfile("user-1", { about: "текст" });
    const args = upsert.mock.calls[0][0];
    expect(args.update).not.toHaveProperty("city");
    expect(args.create).not.toHaveProperty("city");
  });

  it("returns city on the public profile", async () => {
    userFindFirst.mockResolvedValue({
      id: "user-1", username: "tester", role: "USER",
      profile: { city: "Самара", fullName: null, birthDate: null, about: null,
        telegram: null, instagram: null, website: null, avatarUrl: null },
      diplomas: [], pets: [], authoredCourses: [],
    });
    const result = await getPublicProfile("tester");
    expect(result?.profile?.city).toBe("Самара");
    expect(userFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        profile: expect.objectContaining({ select: expect.objectContaining({ city: true }) }),
      }),
    }));
  });

  it("returns city in the API profile DTO", async () => {
    userFindUnique.mockResolvedValue({
      id: "user-1", username: "tester", phone: null, email: null, role: "USER",
      passwordSetAt: null, onboardingTourCompletedAt: null, accounts: [],
      profile: { city: "Самара", fullName: null, about: null, telegram: null,
        instagram: null, website: null, birthDate: null, avatarUrl: null },
    });
    const result = await getUserProfileForApi("user-1");
    expect(result?.profile.city).toBe("Самара");
  });
});
