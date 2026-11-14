import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveArticleEntitlement, resolveCourseEntitlement } from "./policy";
import { registerContentPolicyReadPort } from "./policy";
import {
  readAccessActorRole, hasCurrentPaidSubscription,
  hasAssignedPrivateCourse, hasActiveGafusArticleAccess,
} from "@gafus/entitlements-server/policy-reads";
registerContentPolicyReadPort({
  readAccessActorRole,
  hasCurrentPaidSubscription,
  hasAssignedPrivateCourse,
  hasActiveGafusArticleAccess,
});

const role = vi.fn();
const subscription = vi.fn();
const assignment = vi.fn();
const gafus = vi.fn();
const flag = vi.fn();

vi.mock("@gafus/entitlements-server/policy-reads", () => ({
  readAccessActorRole: (...args: unknown[]) => role(...args),
  hasCurrentPaidSubscription: (...args: unknown[]) => subscription(...args),
  hasAssignedPrivateCourse: (...args: unknown[]) => assignment(...args),
  hasActiveGafusArticleAccess: (...args: unknown[]) => gafus(...args),
}));
vi.mock("../appFeatureFlags", () => ({
  APP_FEATURE_APP_SUBSCRIPTION_GATING: "app_subscription_gating_enabled",
  getAppFeatureFlagEnabled: (...args: unknown[]) => flag(...args),
}));

const now = new Date("2026-10-15T00:00:00Z");
const paid = { id: "paid-course", isPrivate: false, isPaid: true };
const free = { id: "free-course", isPrivate: false, isPaid: false };
const privateCourse = { id: "private-course", isPrivate: true, isPaid: false };

describe("shared Web/Mobile subscription access policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flag.mockResolvedValue(true);
    role.mockResolvedValue("USER");
    subscription.mockResolvedValue(false);
    assignment.mockResolvedValue(false);
    gafus.mockResolvedValue(false);
  });

  it("guests can access a free course, but no paid/private material", async () => {
    expect((await resolveCourseEntitlement(free, undefined, now)).allowed).toBe(true);
    expect((await resolveCourseEntitlement(paid, undefined, now)).allowed).toBe(false);
    expect((await resolveCourseEntitlement(privateCourse, undefined, now)).allowed).toBe(false);
    expect((await resolveArticleEntitlement("article", undefined, "IOS", now)).allowed).toBe(false);
  });

  it("active subscription opens all regular courses and articles", async () => {
    subscription.mockResolvedValue(true);
    expect((await resolveCourseEntitlement(paid, "user", now)).source).toBe("SUBSCRIPTION");
    expect((await resolveArticleEntitlement("article", "user", "WEB_DESKTOP", now)).allowed).toBe(true);
    expect(subscription).toHaveBeenCalledWith("user",now);
  });

  it("private courses need assignment, even with subscription", async () => {
    subscription.mockResolvedValue(true);
    expect((await resolveCourseEntitlement(privateCourse, "user", now)).allowed).toBe(false);
    assignment.mockResolvedValue(true);
    expect((await resolveCourseEntitlement(privateCourse, "user", now)).source).toBe("PRIVATE_ASSIGNMENT");
    expect(assignment).toHaveBeenCalledWith("user","private-course");
  });

  it("expired subscription cannot use a stale entitlement", async () => {
    expect((await resolveCourseEntitlement(paid, "user", now)).allowed).toBe(false);
    expect((await resolveArticleEntitlement("article", "user", "IOS", now)).allowed).toBe(false);
  });

  it("lifetime subscriptions and privileged roles are handled", async () => {
    subscription.mockResolvedValue(true);
    expect((await resolveCourseEntitlement(paid, "user", now)).allowed).toBe(true);
    subscription.mockResolvedValue(false);
    for (const privilegedRole of ["ADMIN", "PARTNER", "TRAINER"]) {
      role.mockResolvedValue(privilegedRole);
      expect((await resolveArticleEntitlement("article", "user", "WEB_DESKTOP", now)).source).toBe("ROLE");
    }
  });

  it("emergency switch grants ordinary paid content without granting private assignments", async () => {
    flag.mockResolvedValue(false);
    expect((await resolveCourseEntitlement(paid, "user", now)).source).toBe("GATING_DISABLED");
    expect((await resolveArticleEntitlement("article", "user", "WEB_DESKTOP", now)).allowed).toBe(true);
    expect((await resolveCourseEntitlement(privateCourse, "user", now)).allowed).toBe(false);
  });

  it("one active Gafus article unlock works on iOS, Android and Web", async () => {
    gafus.mockResolvedValue(true);
    for (const platform of ["IOS", "ANDROID", "WEB_DESKTOP", "WEB_TOUCH"] as const) {
      expect((await resolveArticleEntitlement("article", "user", platform, now)).source).toBe("GAFUS");
    }
    expect(gafus).toHaveBeenCalledWith("user","article",now);
  });

  it("expired/missing article unlock remains closed on all platforms", async () => {
    gafus.mockResolvedValue(false);
    expect((await resolveArticleEntitlement("article", "user", "IOS", now)).allowed).toBe(false);
    expect((await resolveArticleEntitlement("article", "user", "WEB_DESKTOP", now)).allowed).toBe(false);
  });
});
