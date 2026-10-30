import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { legacyRoutes, matchLegacyPath, previewPageState } from "./routes";
import { MockPanelShell } from "./MockPanelShell";

const root = join(process.cwd(), "../..");
const snapshot = JSON.parse(readFileSync(
  join(root, "docs/refactor/coordination/BASELINE.json"), "utf8",
)) as { trainer: { pages: { url: string }[] } };
const expected = snapshot.trainer.pages.map(page => page.url);

describe("AG4 mock-only legacy routing / trainer", () => {
  it("covers the entire frozen G0 URL list without collisions", () => {
    expect(legacyRoutes).toHaveLength(29);
    expect(new Set(legacyRoutes).size).toBe(29);
    expect([...legacyRoutes].sort()).toEqual([...expected].sort());
  });

  it("resolves each direct legacy pathname, preserving the URL contract only", () => {
    for (const path of legacyRoutes) {
      const example = path.replace(/\[[A-Za-z][A-Za-z0-9]*\]/g, "id-123");
      expect(matchLegacyPath(example)).toBe(path);
    }
    expect(matchLegacyPath("/main-panel/courses/course-22/edit")).not.toBeNull();
    expect(matchLegacyPath("/main-panel/unknown")).toBeNull();
  });

  it.each([
    "https://somewhere.example/main-panel",
    "//outside.example",
    "/main-panel//courses",
    "/main-panel/../courses",
    "/main-panel/courses/%2e%2e/edit",
    "/main-panel/courses/%2F/edit",
    "/main-panel/courses/id\\evil/edit",
    "/main-panel/courses/x/edit?token=secret",
    "/main-panel/courses/x/edit#hash",
    "/main-panel/courses/x%00/edit",
    "/main-panel/courses/<script>/edit",
  ])("rejects untrusted/broken location %s", path => {
    expect(matchLegacyPath(path)).toBeNull();
  });

  it("does not require a token or network request to create mock state", () => {
    expect(previewPageState("/login", "GUEST")).toBe("login");
    expect(previewPageState("/main-panel", "GUEST")).toBe("login");
    expect(previewPageState("/main-panel", "USER")).toBe("denied");
    expect(previewPageState("/main-panel", "PARTNER")).toBe("denied");
    expect(previewPageState("/main-panel", "MODERATOR")).toBe("policy-pending");
    expect(previewPageState("/does-not-exist", "ADMIN")).toBe("not-found");
  });

  it("never claims confirmed role policy for ambiguous staff access", () => {
    expect(previewPageState("/main-panel", "ADMIN")).toBe("policy-pending");
    expect(previewPageState("/main-panel", "TRAINER")).toBe("mock-only");
  });

  it("denies MODERATOR access to all consultation UI routes by approved policy", () => {
    for (const route of legacyRoutes) {
      if (!route.startsWith("/main-panel/consultations")) continue;
      const dynamic = route.replace(/\[[A-Za-z][A-Za-z0-9]*\]/g, "id-123");
      expect(previewPageState(dynamic, "MODERATOR")).toBe("denied");
      const html = renderToStaticMarkup(createElement(MockPanelShell, {
        pathname: dynamic, role: "MODERATOR",
      }));
      expect(html).toContain('role="alert"');
      expect(html).not.toContain("<nav");
    }
    expect(previewPageState("/main-panel", "MODERATOR")).toBe("policy-pending");
  });

  it("renders accessible explicit preview/denial without server actions", () => {
    const pending = renderToStaticMarkup(
      createElement(MockPanelShell, { pathname: "/main-panel", role: "MODERATOR" }),
    );
    expect(pending).toContain('data-ag4-preview="mock-only"');
    expect(pending).toContain('role="status"');
    expect(pending).not.toContain("accessToken");
    const denied = renderToStaticMarkup(
      createElement(MockPanelShell, { pathname: "/main-panel", role: "USER" }),
    );
    expect(denied).toContain('role="alert"');
    expect(denied).not.toContain("fetch(");
    const guest = renderToStaticMarkup(
      createElement(MockPanelShell, { pathname: "/main-panel", role: "GUEST" }),
    );
    expect(guest).toContain('href="/login"');
  });

  it("keeps browser-only preparation free of Next, Prisma, PWA and network", () => {
    for (const file of ["routes.ts", "MockPanelShell.tsx"]) {
      const body = readFileSync(join(process.cwd(), "src/trainer-vite", file), "utf8");
      expect(body).not.toMatch(/next-auth|@gafus\/(core|prisma|webpush)|from "next\//);
      expect(body).not.toMatch(/fetch\(|XMLHttpRequest|navigator\.serviceWorker/);
      expect(body).not.toMatch(/beforeinstallprompt|workbox/i);
    }
  });
});
