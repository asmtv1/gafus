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
  it("requires dependencies at construction", async () => {
    const { createContentPolicy } = await import("./policy");
    expect(() => createContentPolicy(undefined as never, flags.enabled))
      .toThrow("CONTENT_POLICY_DEPENDENCIES_REQUIRED");
  });
  it("keeps private assignment binding even if actor is ADMIN", async () => {
    const {createContentPolicy}=await import("./policy");
    const p=adapter();const policy=createContentPolicy(p,flags.enabled);
    await expect(policy.resolveCourseEntitlement(privateCourse,"admin-A"))
      .resolves.toEqual({allowed:false,source:"DENIED"});
    expect(p.hasAssignedPrivateCourse).toHaveBeenCalledExactlyOnceWith("admin-A","private-course");
    expect(p.readAccessActorRole).not.toHaveBeenCalled();
    p.hasAssignedPrivateCourse.mockResolvedValueOnce(true);
    await expect(policy.resolveCourseEntitlement(privateCourse,"owner-A"))
      .resolves.toEqual({allowed:true,source:"PRIVATE_ASSIGNMENT"});
  });
  it("passes the current period clock, doesn't trust only active status", async () => {
    const {createContentPolicy}=await import("./policy");const p=adapter();
    p.readAccessActorRole.mockResolvedValueOnce("USER");
    const policy=createContentPolicy(p,flags.enabled);
    const now=new Date("2026-11-12T07:00:00Z");
    await expect(policy.resolveCourseEntitlement(paid,"owner-A",now))
      .resolves.toEqual({allowed:false,source:"DENIED"});
    expect(p.hasCurrentPaidSubscription).toHaveBeenCalledExactlyOnceWith("owner-A",now);
    expect(p.readAccessActorRole).toHaveBeenCalledExactlyOnceWith("owner-A");
  });
  it("requires an unexpired grant scoped to exact article when subscription absent", async () => {
    const {createContentPolicy}=await import("./policy");const p=adapter();
    p.readAccessActorRole.mockResolvedValue("USER");
    p.hasActiveGafusArticleAccess.mockResolvedValueOnce(true);
    const policy=createContentPolicy(p,flags.enabled);
    const now=new Date("2026-11-12T06:00:00Z");
    await expect(policy.resolveArticleEntitlement("article-A","owner-A","WEB_TOUCH",now))
      .resolves.toEqual({allowed:true,source:"GAFUS"});
    expect(p.hasActiveGafusArticleAccess).toHaveBeenCalledExactlyOnceWith("owner-A","article-A",now);
  });
  it("isolates independently composed policies and gating", async () => {
    const {createContentPolicy}=await import("./policy");
    const first=adapter(), second=adapter();
    first.readAccessActorRole.mockResolvedValue("USER");
    const a=createContentPolicy(first,async()=>true);
    const b=createContentPolicy(second,async()=>false);
    expect(await a.resolveCourseEntitlement(paid,"owner-A")).toEqual({allowed:false,source:"DENIED"});
    expect(await b.resolveCourseEntitlement(paid,"owner-B")).toEqual({allowed:true,source:"GATING_DISABLED"});
    expect(await a.resolveCourseEntitlement(paid,"owner-A")).toEqual({allowed:false,source:"DENIED"});
    expect(second.readAccessActorRole).not.toHaveBeenCalled();
  });
});
