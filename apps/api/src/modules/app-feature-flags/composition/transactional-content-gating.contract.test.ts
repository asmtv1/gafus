import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ read: vi.fn(async () => false) }));
vi.mock("@gafus/feature-flags-server", () => ({
  APP_FEATURE_APP_SUBSCRIPTION_GATING: "app_subscription_gating_enabled",
  getAppFeatureFlagEnabled: mock.read,
}));
describe("API transactional access binds the authoritative flag", () => {
  it("uses the exact gating flag for a paid public occurrence", async () => {
    const { transactionalContentPolicy } = await import("../../content-access/composition/transactional-policy-instance");
    const result = await transactionalContentPolicy.resolveCourseStepAccessTx({} as never, "owner", {
      type:"COURSE_STEP",targetKey:"course-step:d:s",courseId:"course",dayOnCourseId:"d",stepOnDayId:"s",
      isPrivate:false,isPaid:true,paidOrPrivate:true,monetized:true,isDailyStep:false,
    });
    expect(result).toMatchObject({allowed:true,source:"GATING_DISABLED"});
    expect(mock.read).toHaveBeenCalledWith("app_subscription_gating_enabled",true);
  });
});
