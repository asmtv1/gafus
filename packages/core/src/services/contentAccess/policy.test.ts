import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveArticleEntitlement, resolveCourseEntitlement } from "./policy";

const role = vi.fn();
const subscription = vi.fn();
const assignment = vi.fn();
const rewarded = vi.fn();
const flag = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => role(...args) },
    appSubscription: { findFirst: (...args: unknown[]) => subscription(...args) },
    courseAccess: { findFirst: (...args: unknown[]) => assignment(...args) },
    rewardedTargetAccess: { findFirst: (...args: unknown[]) => rewarded(...args) },
  },
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
    role.mockResolvedValue({ role: "USER" });
    subscription.mockResolvedValue(null);
    assignment.mockResolvedValue(null);
    rewarded.mockResolvedValue(null);
  });

  it("guests can access a free course, but no paid/private material", async () => {
    expect((await resolveCourseEntitlement(free, undefined, now)).allowed).toBe(true);
    expect((await resolveCourseEntitlement(paid, undefined, now)).allowed).toBe(false);
    expect((await resolveCourseEntitlement(privateCourse, undefined, now)).allowed).toBe(false);
    expect((await resolveArticleEntitlement("article", undefined, "IOS", now)).allowed).toBe(false);
  });

  it("active subscription opens all regular courses and articles", async () => {
    subscription.mockResolvedValue({ id: "subscription" });
    expect((await resolveCourseEntitlement(paid, "user", now)).source).toBe("SUBSCRIPTION");
    expect((await resolveArticleEntitlement("article", "user", "WEB_DESKTOP", now)).allowed).toBe(true);
    expect(subscription).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "ACTIVE",
        OR: [{ isLifetime: true }, { currentPeriodEnd: { gt: now } }],
      }),
    }));
  });

  it("private courses need assignment, even with subscription", async () => {
    subscription.mockResolvedValue({ id: "subscription" });
    expect((await resolveCourseEntitlement(privateCourse, "user", now)).allowed).toBe(false);
    assignment.mockResolvedValue({ courseId: "private-course" });
    expect((await resolveCourseEntitlement(privateCourse, "user", now)).source).toBe("PRIVATE_ASSIGNMENT");
    expect(assignment).toHaveBeenCalledWith(expect.objectContaining({
      where: { courseId: "private-course", userId: "user" },
    }));
  });

  it("expired subscription cannot use a stale entitlement", async () => {
    expect((await resolveCourseEntitlement(paid, "user", now)).allowed).toBe(false);
    expect((await resolveArticleEntitlement("article", "user", "IOS", now)).allowed).toBe(false);
  });

  it("lifetime subscriptions and privileged roles are handled", async () => {
    subscription.mockResolvedValue({ id: "lifetime" });
    expect((await resolveCourseEntitlement(paid, "user", now)).allowed).toBe(true);
    subscription.mockResolvedValue(null);
    for (const privilegedRole of ["ADMIN", "PARTNER", "TRAINER"]) {
      role.mockResolvedValue({ role: privilegedRole });
      expect((await resolveArticleEntitlement("article", "user", "WEB_DESKTOP", now)).source).toBe("ROLE");
    }
  });

  it("emergency switch grants ordinary paid content without granting private assignments", async () => {
    flag.mockResolvedValue(false);
    expect((await resolveCourseEntitlement(paid, "user", now)).source).toBe("GATING_DISABLED");
    expect((await resolveArticleEntitlement("article", "user", "WEB_DESKTOP", now)).allowed).toBe(true);
    expect((await resolveCourseEntitlement(privateCourse, "user", now)).allowed).toBe(false);
  });

  it("ad unlock is per article and only on rewarded-supported platforms", async () => {
    rewarded.mockResolvedValue({ id: "ad" });
    expect((await resolveArticleEntitlement("article", "user", "IOS", now)).source).toBe("REWARDED");
    expect((await resolveArticleEntitlement("article", "user", "WEB_DESKTOP", now)).allowed).toBe(false);
    expect(rewarded).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ targetType: "ARTICLE", targetId: "article", expiresAt: { gt: now } }),
    }));
  });
});
