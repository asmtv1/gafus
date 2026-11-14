import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  userFind: vi.fn(),
  userLookup: vi.fn(),
  userUpdate: vi.fn(),
  profileFind: vi.fn(),
  profileUpsert: vi.fn(),
  transaction: vi.fn(),
  lock: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: { findUnique: m.userFind, findFirst: m.userLookup, update: m.userUpdate },
    userProfile: { findUnique: m.profileFind, upsert: m.profileUpsert },
    $transaction: m.transaction,
  },
}));
import {
  readUserProfileRow,
  upsertProfileFields,
  readProfileActorExists,
  readUserIdByUsernameRow,
  readPublicProfileRow,
  replaceProfileAvatarRow,
  readUserWithTrainingsRow,
  readUserProfileForApiRow,
  readOnboardingTourStatusRow,
  markOnboardingTourSeenRow,
} from "./profileRows.js";

beforeEach(() => {
  vi.resetAllMocks();
  for (const x of Object.values(m)) x.mockResolvedValue(null);
});
describe("profile DB projection enforces exact principal and sanitized public selection", () => {
  it("limits private profile and identity existence lookups to one exact account", async () => {
    await readUserProfileRow("user-A");
    expect(m.profileFind).toHaveBeenCalledWith({ where: { userId: "user-A" } });
    await readProfileActorExists("user-A");
    expect(m.userFind).toHaveBeenCalledWith({ where: { id: "user-A" }, select: { id: true } });
    await readUserIdByUsernameRow("alice");
    expect(m.userFind).toHaveBeenCalledWith({ where: { username: "alice" }, select: { id: true } });
  });
  it("rejects mismatched upsert owner and retains patch/clear field semantics", async () => {
    expect(() =>
      upsertProfileFields(
        "user-A",
        { city: "A" },
        { user: { connect: { id: "user-B" } }, city: "A" },
      ),
    ).toThrow("PROFILE_OWNER_MISMATCH");
    expect(m.profileUpsert).not.toHaveBeenCalled();
    const birthDate = new Date("2001-01-02T00:00:00Z");
    await upsertProfileFields(
      "user-A",
      { city: "Kazan", about: null, birthDate },
      {
        user: { connect: { id: "user-A" } },
        city: "Kazan",
        about: null,
        birthDate,
      },
    );
    expect(m.profileUpsert).toHaveBeenCalledExactlyOnceWith({
      where: { userId: "user-A" },
      update: { city: "Kazan", about: null, birthDate },
      create: { user: { connect: { id: "user-A" } }, city: "Kazan", about: null, birthDate },
    });
  });
  it("public projection selects visible pets and courses, never email/password/token details", async () => {
    await readPublicProfileRow("alice");
    const q = m.userLookup.mock.calls[0]?.[0];
    expect(q.where).toEqual({ OR: [{ username: "alice" }, { id: "alice" }] });
    expect(q.select.pets.where).toEqual({ showInProfile: true });
    expect(q.select.authoredCourses.where).toEqual({ showInProfile: true });
    expect(q.select.diplomas.orderBy).toEqual({ issuedAt: "desc" });
    const raw = JSON.stringify(q.select);
    for (const key of [
      "password",
      "email",
      "refreshToken",
      "deviceToken",
      "sessionsRevokedAt",
      "apiKey",
    ])
      expect(raw).not.toContain(`"${key}"`);
  });
  it("authenticated projection selects only VK provider existence and passwordSetAt, never password hash", async () => {
    await readUserProfileForApiRow("user-A");
    const q = m.userFind.mock.calls[0]?.[0];
    expect(q.where).toEqual({ id: "user-A" });
    expect(q.select.accounts).toEqual({ where: { provider: "vk" }, select: { id: true } });
    expect(q.select.passwordSetAt).toBe(true);
    expect(q.select.password).toBeUndefined();
    expect(q.select.profile.select.city).toBe(true);
  });
  it("trainer-course projection is scoped to owner and only VK identity is exposed", async () => {
    await readUserWithTrainingsRow("user-A");
    const q = m.userFind.mock.calls[0]?.[0];
    expect(q.where).toEqual({ id: "user-A" });
    expect(q.select.accounts).toEqual({ where: { provider: "vk" }, select: { id: true } });
    expect(q.select.userTrainings.orderBy).toEqual({ dayOnCourse: { order: "asc" } });
    expect(q.select.userCourses.select.course.select.dayLinks).toEqual({ select: { id: true } });
  });
  it("onboarding status reads and writes exactly this actor, not another user's tour", async () => {
    await readOnboardingTourStatusRow("user-A");
    expect(m.userFind).toHaveBeenCalledWith({
      where: { id: "user-A" },
      select: { onboardingTourCompletedAt: true },
    });
    await markOnboardingTourSeenRow("user-A");
    expect(m.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-A" },
      data: { onboardingTourCompletedAt: expect.any(Date) },
      select: { onboardingTourCompletedAt: true },
    });
  });
});

describe("avatar DB transaction does not perform network or expose credentials", () => {
  it("locks the owner before inspecting old URL and atomically writing new URL", async () => {
    const events: string[] = [];
    m.transaction.mockImplementationOnce(async (action: (tx: unknown) => Promise<unknown>) =>
      action({
        $queryRaw: () => {
          events.push("lock");
          return Promise.resolve([{ id: "user-A" }]);
        },
        userProfile: {
          findUnique: () => {
            events.push("read");
            return Promise.resolve({ avatarUrl: "old/avatar.jpg" });
          },
          upsert: () => {
            events.push("write");
            return Promise.resolve({});
          },
        },
      }),
    );
    expect(await replaceProfileAvatarRow("user-A", "new/avatar.jpg")).toBe("old/avatar.jpg");
    expect(events).toEqual(["lock", "read", "write"]);
    expect(m.transaction).toHaveBeenCalledTimes(1);
  });
  it("refuses missing principal before writes and preserves DB failure for CDN compensation in Core", async () => {
    const write = vi.fn();
    m.transaction.mockImplementationOnce(async (action: (tx: unknown) => Promise<unknown>) =>
      action({
        $queryRaw: () => Promise.resolve([]),
        userProfile: { findUnique: vi.fn(), upsert: write },
      }),
    );
    await expect(replaceProfileAvatarRow("missing", "new")).rejects.toThrow(
      "Пользователь не найден",
    );
    expect(write).not.toHaveBeenCalled();
  });
});
