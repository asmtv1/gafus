// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import inventory from "../../../migration/legacy-web.inventory.json";
import { ROUTES, RouteLink, routeForPath, useRoutePath } from "./location";

describe("AG2-G1-001: static inventory and existing Vite router, no parity claim", () => {
  it("accounts for every frozen legacy Web entrypoint without claiming runtime parity", () => {
    expect(inventory.pages).toHaveLength(55);
    expect(inventory.apiRoutes).toHaveLength(109);
    expect(inventory.actions).toHaveLength(73);
    expect(new Set(inventory.pages.map(page => page.legacySource)).size).toBe(55);
    expect(new Set(inventory.pages.map(page => page.legacyUrl)).size).toBe(55);
    expect(new Set(inventory.apiRoutes.map(api => api.source)).size).toBe(109);
    expect(new Set(inventory.actions.map(action => action.source)).size).toBe(73);
    expect(inventory.apiRoutes.flatMap(api => api.staticMatches)).toHaveLength(144);
    expect(inventory.pages.every(page => page.status !== "MIGRATED_VERIFIED")).toBe(true);
    expect(inventory.apiRoutes.every(api => api.backendOwner === "AG1")).toBe(true);
    expect(inventory.actions.every(action => action.backendOwner === "AG1")).toBe(true);
    for (const page of inventory.pages) {
      expect(page.legacySource.startsWith("apps/web/")).toBe(true);
      expect(page.targetWebConsumer).toBeTruthy();
      expect(page.api).toBeTruthy();
      expect(page.screenshot.startsWith("PROPOSED:")).toBe(true);
      expect(page.playwright.startsWith("PROPOSED:")).toBe(true);
    }
  });

  it("recognizes current 27 static Vite paths without claiming feature parity", () => {
    expect(ROUTES).toHaveLength(27);
    expect(ROUTES).toContain("/cynologist-chat");
    for (const path of ROUTES) expect(routeForPath(path)).toBe(path);
    for (const page of inventory.pages.filter(page =>
      page.status === "ROUTE_EXISTS_NOT_PARITY")) {
      expect(routeForPath(page.legacyUrl)).toBe(page.legacyUrl);
    }
  });

  it("keeps five W1 account entrypoints mapped to existing UI, not MIGRATED_VERIFIED", () => {
    const byUrl = new Map(inventory.pages.map(page => [page.legacyUrl, page]));
    const expected = [
      ["/profile/change-email", "AccountMutationPage.tsx"],
      ["/profile/confirm-email", "EmailConfirmPage.tsx"],
      ["/profile/set-password", "AccountMutationPage.tsx"],
      ["/profile/change-password", "AccountMutationPage.tsx"],
      ["/profile/change-username", "UsernameChangePage.tsx"],
    ] as const;
    for (const [url, consumer] of expected) {
      expect(routeForPath(url)).toBe(url);
      expect(byUrl.get(url)?.status).toBe("ROUTE_EXISTS_NOT_PARITY");
      expect(byUrl.get(url)?.targetWebConsumer.endsWith(consumer)).toBe(true);
      expect(byUrl.get(url)?.api).toContain("/api/v1/auth/");
    }
    expect(inventory.pages.filter(page => page.status === "DIRECT_ROUTE_MISSING")).toHaveLength(14);
    expect(routeForPath("/profile/addPet")).toBe("/profile/addPet");
    expect(routeForPath("/profile/delete-account")).toBe("/profile/delete-account");
    expect(inventory.pages.some(page => page.status === "MIGRATED_VERIFIED")).toBe(false);
  });

  it("tracks exactly eleven opt-in-only legacy URLs without promising production UI", () => {
    const examples: Record<string, string> = {
      "WEB-URL-005": "/achievements",
      "WEB-URL-022": "/feed/notifications",
      "WEB-URL-008": "/consultations/trainer-1/confirm",
      "WEB-URL-009": "/consultations/trainer-1",
      "WEB-URL-012": "/consultations",
      "WEB-URL-017": "/daily-course/day-1",
      "WEB-URL-032": "/profile/albums/album-1",
      "WEB-URL-033": "/profile/albums",
      "WEB-URL-048": "/trainings/basic/day-1",
      "WEB-URL-049": "/trainings/basic",
      "WEB-URL-050": "/trainings/basic/reviews",
    };
    const optIn = inventory.pages.filter(page =>
      page.status === "OPT_IN_ROUTE_ONLY_NOT_PARITY");
    expect(optIn).toHaveLength(11);
    expect(optIn.map(page => page.id).sort()).toEqual(Object.keys(examples).sort());
    for (const page of optIn) {
      expect(page.targetWebConsumer.startsWith("apps/web-vite/src/features/")).toBe(true);
      expect(page.targetWebConsumer.endsWith("OptIn.tsx") ||
        page.targetWebConsumer.endsWith("OptInHarness.tsx")).toBe(true);
      expect(routeForPath(examples[page.id])).toBe(examples[page.id]);
      expect(page.screenshot.startsWith("PROPOSED:")).toBe(true);
      expect(page.playwright.startsWith("PROPOSED:")).toBe(true);
    }
    expect(routeForPath("/profile/delete-account")).toBe("/profile/delete-account");
    expect(routeForPath("/profile/delete-account/extra")).toBeNull();
    // A recognized URI is not a green light for unsanctioned features.
    for (const missing of ["/trainings/basic/reviews/extra",
      "/~offline", "/profile/albums/%2Fadmin",
      "/consultations/trainer-1/confirm/extra", "/daily-course/%2Fadmin"]) {
      expect(routeForPath(missing)).toBeNull();
    }
  });

  it("treats only mapped legacy deep links as available (not API/UX parity)", () => {
    for (const page of inventory.pages.filter(page =>
      page.status === "LEGACY_ALIAS_SUPPORTED_NOT_PARITY")) {
      const oldUrl = page.legacyUrl.replace(/\[[^\]]+\]/g, "valid-id");
      const targetUrl = page.targetUrl.replace(/\[[^\]]+\]/g, "valid-id");
      expect(routeForPath(oldUrl)).toBe(targetUrl);
    }
    for (const legacyUrl of [
      "/trainings/basic/reviews/extra",
      "/~offline",
    ]) expect(routeForPath(legacyUrl)).toBeNull();
    expect(routeForPath("/consultations/my")).toBe("/consultations/my");
    expect(routeForPath("/consultations/call/booking-1"))
      .toBe("/consultations/call/booking-1");
    expect(routeForPath("/login")).toBe("/login");
    expect(routeForPath("/register")).toBe("/register");
    expect(routeForPath("/vk-consent")).toBe("/vk-consent");
    expect(routeForPath("/feed/hidden-authors")).toBe("/feed/hidden-authors");
    expect(routeForPath("/feed/notifications")).toBe("/feed/notifications");
    expect(routeForPath("/moments")).toBe("/moments");
    expect(routeForPath("/moments/post-1")).toBe("/moments/post-1");
    expect(routeForPath("/moments/profile/user-1")).toBe("/moments/profile/user-1");
    expect(routeForPath("/moments/new")).toBe("/moments/new");
  });

  it("accepts supported deep links and rejects malformed encoded identifiers", () => {
    expect(routeForPath("/articles/dogs")).toBe("/articles/dogs");
    expect(routeForPath("/questions/question-1")).toBe("/questions/question-1");
    expect(routeForPath("/pets/pet-1")).toBe("/pets/pet-1");
    for (const url of [
      "/articles/%2Fadmin", "/questions/%2Fadmin", "/pets/%2e%2e",
      "/moments/%2Fadmin", "/moments/profile/%2Fadmin", "//evil.example",
    ]) expect(routeForPath(url)).toBeNull();
  });

  it("renders a keyboard-focusable real link on direct URL, retaining query/hash and 404 behavior", async () => {
    const before = window.location.href;
    const target = document.createElement("div");
    document.body.append(target);
    const root = createRoot(target);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    function Probe() {
      const path = useRoutePath();
      return createElement("section", {},
        createElement("output", {}, path ?? "not-found"),
        createElement(RouteLink, { to: "/courses", "aria-label": "Открыть курсы", children: "Курсы" }));
    }
    try {
      await act(async () => {
        window.history.replaceState(null, "", "/articles?sort=recent#part");
        root.render(createElement(Probe));
      });
      expect(target.querySelector("output")?.textContent).toBe("/articles");
      expect(window.location.search).toBe("?sort=recent");
      expect(window.location.hash).toBe("#part");
      const link = target.querySelector("a")!;
      expect(link.getAttribute("href")).toBe("/courses");
      expect(link.getAttribute("aria-label")).toBe("Открыть курсы");
      expect(link.tabIndex).toBe(0);
      await act(async () => {
        window.history.replaceState(null, "", "/nonexistent?foo=bar");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(target.querySelector("output")?.textContent).toBe("not-found");
      await act(async () => link.click());
      expect(target.querySelector("output")?.textContent).toBe("/courses");
      expect(window.location.pathname).toBe("/courses");
    } finally {
      await act(async () => root.unmount());
      target.remove();
      window.history.replaceState(null, "", before);
    }
  });
});
