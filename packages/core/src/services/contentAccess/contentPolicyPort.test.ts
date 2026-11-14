import { beforeEach, describe, expect, it, vi } from "vitest";
const flags = vi.hoisted(() => ({ enabled: vi.fn(async () => true) }));
vi.mock("../appFeatureFlags", () => ({
  APP_FEATURE_APP_SUBSCRIPTION_GATING: "app_subscription_gating_enabled",
  getAppFeatureFlagEnabled: flags.enabled,
}));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); flags.enabled.mockResolvedValue(true); });
const privateCourse = { id:"private-course", isPrivate:true, isPaid:false };
const paid = { id:"paid-course", isPrivate:false, isPaid:true };
function adapter() {
  return {
    readAccessActorRole: vi.fn(async (_userId: string) => "ADMIN" as string | null),
    hasCurrentPaidSubscription: vi.fn(async (_userId: string, _now: Date) => false),
    hasAssignedPrivateCourse: vi.fn(async (_userId: string, _courseId: string) => false),
    hasActiveGafusArticleAccess: vi.fn(async (_userId: string, _articleId: string, _now: Date) => false),
  };
}

describe("Content access owner-scoped policy port", () => {
  it("rejects protected access without a SQL reader instead of allowing it", async () => {
    const policy = await import("./policy");
    await expect(policy.resolveCourseEntitlement(privateCourse,"owner-A"))
      .rejects.toThrow("CONTENT_POLICY_READ_PORT_UNBOUND");
    await expect(policy.resolveCourseEntitlement(paid,"owner-A"))
      .rejects.toThrow("CONTENT_POLICY_READ_PORT_UNBOUND");
    await expect(policy.resolveArticleEntitlement("article-A","owner-A","IOS"))
      .rejects.toThrow("CONTENT_POLICY_READ_PORT_UNBOUND");
  });
  it("keeps private assignment binding even if actor is ADMIN", async () => {
    const policy = await import("./policy");
    const p=adapter();policy.registerContentPolicyReadPort(p);
    await expect(policy.resolveCourseEntitlement(privateCourse,"admin-A"))
      .resolves.toEqual({allowed:false,source:"DENIED"});
    expect(p.hasAssignedPrivateCourse).toHaveBeenCalledExactlyOnceWith("admin-A","private-course");
    expect(p.readAccessActorRole).not.toHaveBeenCalled();
    p.hasAssignedPrivateCourse.mockResolvedValueOnce(true);
    await expect(policy.resolveCourseEntitlement(privateCourse,"owner-A"))
      .resolves.toEqual({allowed:true,source:"PRIVATE_ASSIGNMENT"});
  });
  it("passes the current period clock, doesn't trust only active status", async () => {
    const policy=await import("./policy");const p=adapter();
    p.readAccessActorRole.mockResolvedValueOnce("USER");
    policy.registerContentPolicyReadPort(p);
    const now=new Date("2026-11-12T07:00:00Z");
    await expect(policy.resolveCourseEntitlement(paid,"owner-A",now))
      .resolves.toEqual({allowed:false,source:"DENIED"});
    expect(p.hasCurrentPaidSubscription).toHaveBeenCalledExactlyOnceWith("owner-A",now);
    expect(p.readAccessActorRole).toHaveBeenCalledExactlyOnceWith("owner-A");
  });
  it("requires an unexpired grant scoped to exact article when subscription absent", async () => {
    const policy=await import("./policy");const p=adapter();
    p.readAccessActorRole.mockResolvedValue("USER");
    p.hasActiveGafusArticleAccess.mockResolvedValueOnce(true);
    policy.registerContentPolicyReadPort(p);
    const now=new Date("2026-11-12T06:00:00Z");
    await expect(policy.resolveArticleEntitlement("article-A","owner-A","WEB_TOUCH",now))
      .resolves.toEqual({allowed:true,source:"GAFUS"});
    expect(p.hasActiveGafusArticleAccess).toHaveBeenCalledExactlyOnceWith("owner-A","article-A",now);
  });
  it("does not replace the authoritative SQL reader for the active process", async () => {
    const policy=await import("./policy");const p=adapter();
    policy.registerContentPolicyReadPort(p);policy.registerContentPolicyReadPort(p);
    expect(() => policy.registerContentPolicyReadPort(adapter()))
      .toThrow("CONTENT_POLICY_READ_PORT_ALREADY_BOUND");
  });
});
