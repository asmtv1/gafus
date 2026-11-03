import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { activeMockHref, mockNavigation, visibleMockNavigation } from "./navigation";
import { MockPanelShell } from "./MockPanelShell";
import { legacyRoutes, previewPageState, type PanelRole } from "./routes";

const permitted: PanelRole = "TRAINER";

function html(pathname: string, role: PanelRole) {
  return renderToStaticMarkup(createElement(MockPanelShell, { pathname, role }));
}

describe("AG4 accessible mock-only navigation", () => {
  it("uses unique real legacy paths without introducing a backend endpoint", () => {
    expect(mockNavigation).toHaveLength(15);
    expect(new Set(mockNavigation.map(({ href }) => href)).size).toBe(mockNavigation.length);
    expect(new Set(mockNavigation.map(({ label }) => label)).size).toBe(mockNavigation.length);
    for (const entry of mockNavigation) {
      expect(legacyRoutes).toContain(entry.href);
      expect(entry.href).toMatch(/^\/main-panel(?:\/[-a-z]+)*$/);
      expect(entry.label.length).toBeGreaterThan(3);
    }
  });

  it("does not expose a menu to guest, USER, PARTNER or unresolved MODERATOR", () => {
    for (const role of ["GUEST", "USER", "PARTNER", "MODERATOR"] as PanelRole[]) {
      expect(visibleMockNavigation("/main-panel", role)).toEqual([]);
      expect(html("/main-panel", role)).not.toContain("<nav");
    }
  });

  it("fails closed for unexpected runtime roles, not just TypeScript values", () => {
    for (const role of ["SUSPENDED", "", undefined] as unknown as PanelRole[]) {
      expect(previewPageState("/main-panel", role)).toBe("denied");
      expect(visibleMockNavigation("/main-panel", role)).toEqual([]);
      expect(html("/main-panel", role)).not.toContain("<nav");
    }
  });

  it("hides the menu on public login, invalid and denied URLs", () => {
    for (const path of ["/login", "/", "/not-found", "//evil.example", "/main-panel/%2e%2e"]) {
      expect(visibleMockNavigation(path, permitted)).toEqual([]);
      expect(html(path, permitted)).not.toContain("<nav");
    }
  });

  it("identifies the most specific navigation parent for a deep-link", () => {
    expect(activeMockHref("/main-panel/steps/step_123/edit", permitted)).toBe("/main-panel/steps");
    expect(activeMockHref("/main-panel", permitted)).toBe("/main-panel");
    expect(activeMockHref("/unknown", permitted)).toBeNull();
  });

  it("provides semantic nav with keyboard-native links and a skip target", () => {
    const page = html("/main-panel/steps/step_123/edit", permitted);
    expect(page).toContain('aria-label="Разделы панели тренера"');
    expect(page).toContain('href="#ag4-main"');
    expect(page).toContain('id="ag4-main"');
    expect(page).toContain('tabindex="-1"');
    expect(page).toContain("<ul>");
    expect(page).toContain("<li>");
    expect(page).toContain('href="/main-panel/steps"');
    expect(page.match(/aria-current="page"/g)).toHaveLength(1);
    expect(page).not.toContain('href="javascript:');
    expect(page).not.toContain("<button");
    expect(page).not.toContain("<form");
  });

  it("keeps mock navigation read-only and refuses to render private content", () => {
    const page = html("/main-panel", permitted);
    expect(page).toContain("Только макет.");
    expect(page).not.toMatch(/accessToken|refreshToken|password|Authorization:/i);
    const forbidden = html("/main-panel", "USER");
    expect(forbidden).toContain("Нет доступа");
    expect(forbidden).toContain('role="alert"');
    expect(forbidden).not.toContain("<nav");
  });
});
