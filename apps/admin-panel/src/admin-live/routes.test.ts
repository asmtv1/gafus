import { describe, expect, it } from "vitest";
import { adminSections, matchAdminRoute, maySeeRoute } from "./routes";

describe("isolated live admin navigation", () => {
  it("mounts all 19 requested legacy pages with unique paths and distinct API endpoints", () => {
    expect(adminSections).toHaveLength(19);
    expect(new Set(adminSections.map((x) => x.path)).size).toBe(19);
    expect(new Set(adminSections.map((x) => x.key)).size).toBe(19);
    expect(adminSections.every((x) => x.path.startsWith("/main-panel/"))).toBe(true);
    expect(adminSections.every((x) => x.api.startsWith("/api/v1/"))).toBe(true);
    expect(adminSections.map((x) => x.key)).toEqual([
      "feed-moderation",
      "questions",
      "users",
      "mail",
      "media",
      "video-quality",
      "admin",
      "partners",
      "profit",
      "feature-flags",
      "broadcasts",
      "reengagement",
      "rewarded-ads",
      "gafus",
      "mobile-intro",
      "app-subscriptions",
      "consultations",
      "bookings",
      "trainers-schedules",
    ]);
  });

  it.each(adminSections)("resolves $key legacy path", (section) => {
    expect(matchAdminRoute(section.path)).toBe(section);
    expect(matchAdminRoute(`${section.path}/`)).toBe(section);
    expect(maySeeRoute(section, "ADMIN")).toBe(true);
    expect(maySeeRoute(section, "USER")).toBe(false);
    expect(maySeeRoute(section, null)).toBe(false);
  });

  it("restores direct Next deep links for partner details", () => {
    expect(matchAdminRoute("/main-panel/partners/partner_123")?.key).toBe("partners");
    expect(matchAdminRoute("/main-panel/partners/partner_123/")?.key).toBe("partners");
    expect(matchAdminRoute("/main-panel/partners/../../escape")).toBe(null);
  });

  it("restores direct Next user subscription details deep links", () => {
    expect(matchAdminRoute("/main-panel/users/recipient123/app-subscription")?.key).toBe("users");
    expect(matchAdminRoute("/main-panel/users/recipient123/app-subscription/")?.key).toBe("users");
    expect(matchAdminRoute("/main-panel/users/../../../escape/app-subscription")).toBe(null);
    expect(matchAdminRoute("/main-panel/users/recipient123/edit")).toBe(null);
  });

  it("redirects the legacy admin home to system settings view", () => {
    expect(matchAdminRoute("/main-panel")?.key).toBe("admin");
    expect(matchAdminRoute("/main-panel/")?.key).toBe("admin");
  });

  it("MODERATOR sees only the explicitly authorized sections", () => {
    const authorized = adminSections.filter((x) => maySeeRoute(x, "MODERATOR")).map((x) => x.key);
    expect(authorized).toEqual([
      "feed-moderation",
      "users",
      "admin",
      "feature-flags",
      "app-subscriptions",
    ]);
    expect(adminSections.every((x) => !maySeeRoute(x, "TRAINER"))).toBe(true);
  });

  it("rejects unknown, spoofed, similarly prefixed and query-containing screen paths", () => {
    for (const path of [
      "/users",
      "/main-panel/users/other",
      "/main-panel/users-admin",
      "/main-panel/unknown",
      "/main-panel/users?role=ADMIN",
      "//main-panel/users",
      "https://example.test/main-panel/users",
    ])
      expect(matchAdminRoute(path)).toBe(null);
  });
});
