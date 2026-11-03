import { describe, expect, it } from "vitest";
import { adminSections, matchAdminRoute } from "./routes";
import {
  toAdminBrowserHref, toAdminBrowserPath, toAdminInternalPath,
} from "./adminBrowserRoutes";

describe("Admin standalone Vite short browser URLs", () => {
  it("uses / as the default dashboard while retaining internal legacy dispatch", () => {
    expect(toAdminBrowserPath("/main-panel")).toBe("/");
    expect(toAdminBrowserPath("/main-panel/")).toBe("/");
    expect(toAdminInternalPath("/")).toBe("/main-panel");
    expect(toAdminInternalPath("/login")).toBe("/main-panel");
    expect(toAdminInternalPath("/main-panel")).toBe("/main-panel");
    expect(matchAdminRoute(toAdminInternalPath("/"))?.key).toBe("admin");
  });

  it.each(adminSections.map((section) => [section.key, section.path] as const))(
    "roundtrips %s section without changing role checks: %s", (_, legacy) => {
      const short = toAdminBrowserPath(legacy);
      expect(short).toBe(legacy.slice("/main-panel".length));
      expect(toAdminInternalPath(short)).toBe(legacy);
      expect(matchAdminRoute(toAdminInternalPath(short))).toEqual(matchAdminRoute(legacy));
    },
  );

  it.each([
    ["/main-panel/users/user_123/app-subscription", "/users/user_123/app-subscription"],
    ["/main-panel/partners/partner_456", "/partners/partner_456"],
  ])("keeps validated nested detail page %s as %s", (legacy, short) => {
    expect(toAdminBrowserPath(legacy)).toBe(short);
    expect(toAdminInternalPath(short)).toBe(legacy);
    expect(matchAdminRoute(toAdminInternalPath(short))).not.toBeNull();
  });

  it("preserves filters, IDs, query and hash when canonicalizing legacy deep links", () => {
    expect(toAdminBrowserHref("/main-panel/app-subscriptions?tab=npd&npdPage=2"))
      .toBe("/app-subscriptions?tab=npd&npdPage=2");
    expect(toAdminBrowserHref("/main-panel/consultations/trainers-schedules?trainerId=lana"))
      .toBe("/consultations/trainers-schedules?trainerId=lana");
    expect(toAdminBrowserHref("/main-panel/profit?from=2026-10-01&to=2026-11-02#payments"))
      .toBe("/profit?from=2026-10-01&to=2026-11-02#payments");
  });

  it.each([
    "/api/v1/admin/users",
    "/not-a-section",
    "/main-panel-evil",
    "/main-panel/not-a-section",
    "//evil.example",
    "/main-panel/users/%2F/app-subscription",
    "/main-panel/partners/../../admin",
    "/main-panel/users/user_123/app-subscription?token=secret",
  ])("never rewrites unknown, malformed or API paths %s", (path) => {
    expect(toAdminBrowserPath(path)).toBe(path);
  });

  it.each([
    "/api/v1/admin/users",
    "/not-a-section",
    "//evil.example",
    "/users/%2F/app-subscription",
    "/partners/../../admin",
    "/main-panel-evil",
  ])("does not give unknown public paths a valid internal route: %s", (path) => {
    expect(matchAdminRoute(toAdminInternalPath(path))).toBeNull();
  });
});
