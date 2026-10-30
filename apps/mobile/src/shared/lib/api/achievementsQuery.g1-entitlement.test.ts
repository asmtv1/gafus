import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  auth: true,
  loading: false,
  api: vi.fn(),
  courses: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      isAuthenticated: m.auth,
      isLoading: m.loading,
      user: m.auth ? { id: m.owner } : null,
    }),
  },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
vi.mock("./achievements", () => ({ achievementsApi: { getAchievements: m.api } }));
vi.mock("./courses", () => ({ coursesApi: { getAll: m.courses } }));
import {
  achievementResultForResponse,
  achievementsForActor,
  achievementsCoursesForActor,
  sameAchievementActor,
  verifiedAchievementActor,
} from "./achievementsQuery";
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.auth = true;
  m.loading = false;
});
describe("Achievements entitlement source/mock actor guards", () => {
  it("maps only positive success to private data; 401,403,503,pending network to fixed kinds", () => {
    const data = { achievements: [], totalCourses: 9 };
    expect(achievementResultForResponse({ success: true, data: data as never })).toEqual({
      kind: "granted",
      data,
    });
    expect(achievementResultForResponse({ success: false, code: "UNAUTHORIZED" })).toEqual({
      kind: "unauthorized",
    });
    expect(achievementResultForResponse({ success: false, code: "SUBSCRIPTION_REQUIRED" })).toEqual(
      { kind: "subscription_required" },
    );
    expect(
      achievementResultForResponse({ success: false, code: "ACHIEVEMENTS_ACCESS_CHECK_FAILED" }),
    ).toEqual({ kind: "unknown" });
    expect(achievementResultForResponse({ success: false, code: "REQUEST_TIMEOUT" })).toEqual({
      kind: "unknown",
    });
    expect(achievementResultForResponse({ success: true })).toEqual({ kind: "unknown" });
  });
  it("guarded get and stable owner/epoch key", async () => {
    const actor = verifiedAchievementActor();
    expect(actor).toEqual({ ownerId: "A", authEpoch: "E1" });
    m.api.mockResolvedValue({ success: false, code: "SUBSCRIPTION_REQUIRED" });
    const query = achievementsForActor(actor);
    expect(query.enabled).toBe(true);
    expect(query.queryKey).toEqual(["achievements", "owner", "A", "E1"]);
    expect(await query.queryFn()).toEqual({ kind: "subscription_required" });
    expect(m.api).toHaveBeenCalledWith(expect.any(Function));
    expect(m.api.mock.calls[0][0]()).toBe(true);
  });
  it("A→B→A new authEpoch after pending GET discards old success, never caches it", async () => {
    const actor = verifiedAchievementActor();
    let resolve!: (r: unknown) => void;
    m.api.mockReturnValue(new Promise((done) => (resolve = done)));
    const req = achievementsForActor(actor).queryFn();
    expect(m.api).toHaveBeenCalledOnce();
    m.owner = "B";
    m.epoch = "B1";
    m.owner = "A";
    m.epoch = "E2";
    expect(m.api.mock.calls[0][0]()).toBe(false);
    resolve({ success: true, data: { totalCourses: 77, achievements: [] } });
    expect(await req).toEqual({ kind: "stale" });
    expect(achievementsForActor(verifiedAchievementActor()).queryKey).toEqual([
      "achievements",
      "owner",
      "A",
      "E2",
    ]);
  });
  it("logout before request prevents GET, loading/unverified owner disables", async () => {
    const actor = verifiedAchievementActor();
    m.auth = false;
    expect(sameAchievementActor(actor)).toBe(false);
    expect(await achievementsForActor(actor).queryFn()).toEqual({ kind: "stale" });
    expect(m.api).not.toHaveBeenCalled();
    expect(achievementsForActor(verifiedAchievementActor()).enabled).toBe(false);
    m.auth = true;
    m.loading = true;
    expect(verifiedAchievementActor()).toBeNull();
  });
  it("private course progress is owned and never reuses global courses key", async () => {
    const actor = verifiedAchievementActor();
    m.courses.mockResolvedValue({
      success: true,
      data: [
        { type: "a", userStatus: "NOT_STARTED" },
        { type: "b", userStatus: "COMPLETED" },
      ],
    });
    const query = achievementsCoursesForActor(actor, true);
    expect(query.queryKey).toEqual(["achievements", "courses", "owner", "A", "E1"]);
    expect(await query.queryFn()).toEqual([{ type: "b", userStatus: "COMPLETED" }]);
    expect(m.courses).toHaveBeenCalledWith(undefined, expect.any(Function));
    m.epoch = "E2";
    expect(await query.queryFn()).toEqual([]);
    expect(m.courses).toHaveBeenCalledOnce();
  });
});
