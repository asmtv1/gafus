// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routeForPath, useRoutePath } from "./location";
import { App } from "../../App";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const matchingLegacy = [
  ["/feed", "/moments"],
  ["/feed/", "/moments"],
  ["/feed/create", "/moments/new"],
  ["/feed/saved", "/moments/saved"],
  ["/feed/post-123", "/moments/post-123"],
  ["/feed/profile/owner_01", "/moments/profile/owner_01"],
] as const;

describe("AG2: legacy Web bookmarks", () => {
  it.each(matchingLegacy)("renders %s using the existing %s route", (oldPath, canonical) => {
    expect(routeForPath(oldPath)).toBe(canonical);
  });

  it("keeps unsupported legacy pages explicit and never maps them to a random post", () => {
    expect(routeForPath("/feed/hidden-authors")).toBe("/feed/hidden-authors");
    expect(routeForPath("/feed/notifications")).toBe("/feed/notifications");
    for (const path of [
      "/feed/%2Fadmin", "/feed/../admin", "/feed/a/b", "/feed/profile/%2Fadmin",
      "/feed/profile", "/feed//test", "/feed/hidden-authors/abc",
    ]) expect(routeForPath(path)).toBeNull();
  });

  it("recognizes /login and /register as dedicated direct links", () => {
    expect(routeForPath("/login")).toBe("/login");
    expect(routeForPath("/register")).toBe("/register");
  });

  it("restores a bookmarked post without rewriting query and hash or losing history", async () => {
    const saved = window.location.href;
    window.history.replaceState(null, "", "/feed/post-123?commentId=good_1#comments");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    function Probe() {
      const current = useRoutePath();
      return createElement("output", {}, current ?? "not-found");
    }
    try {
      await act(async () => root.render(createElement(Probe)));
      expect(host.textContent).toBe("/moments/post-123");
      expect(window.location.search).toBe("?commentId=good_1");
      expect(window.location.hash).toBe("#comments");
      await act(async () => {
        window.history.pushState(null, "", "/feed");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(host.textContent).toBe("/moments");
    } finally {
      await act(async () => root.unmount());
      host.remove();
      window.history.replaceState(null, "", saved);
    }
  });

  it.each(["/feed/notifications", "/feed/hidden-authors"])(
    "unauthenticated %s protects private owner route without API requests", async path => {
      window.history.replaceState(null, "", path);
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
      const fake = vi.fn();
      vi.stubGlobal("fetch", fake);
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      try {
        await act(async () => root.render(createElement(QueryClientProvider, {
          client: cache,
        }, createElement(App))));
        for(let i=0;i<12;i++) {
          if(host.textContent?.includes("Личные данные скрыты") ||
             host.textContent?.includes("Личные данные временно скрыты"))break;
          await act(async()=>{await new Promise(done=>setTimeout(done,25));});
        }
        // An unknown guest session is now fenced BEFORE either private route.
        // Authorization may settle to an explicit error before this assertion.
        // Both pending and error renderings must deny access to private data.
        expect(["Проверяем сессию", "Не удалось получить статус авторизации"].some(
          message => host.textContent?.includes(message))).toBe(true);
        expect(["Личные данные временно скрыты", "Личные данные скрыты"].some(
          message => host.textContent?.includes(message))).toBe(true);
        expect(host.querySelector('a[href="/login"]')).not.toBeNull();
        expect(host.textContent).not.toContain("Страница не найдена");
        // The connected session boundary may verify /me, never private route data.
        expect(fake.mock.calls.map(([url]) => url)).toEqual(["/api/v1/auth/me"]);
        expect(fake.mock.calls[0][1]).toMatchObject({
          method: "GET", cache: "no-store", credentials: "include",
        });
      } finally {
        await act(async () => root.unmount());
        cache.clear();
        host.remove();
      }
    },
  );

  it("renders registration page from direct /register URL without calling mutation APIs", async () => {
    window.history.replaceState(null, "", "/register");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const fake = vi.fn(async (_url: string) =>
      new Response(JSON.stringify({ success: false }), { status: 401 }));
    vi.stubGlobal("fetch", fake);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      await act(async () => root.render(createElement(QueryClientProvider, {
        client: cache,
      }, createElement(App))));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
      expect(host.textContent).toContain("Регистрация");
      expect(fake.mock.calls.every(([url]) =>
        url === "/api/v1/auth/me" || url === "/api/v1/auth/refresh")).toBe(true);
      expect(window.location.pathname).toBe("/register");
    } finally {
      await act(async () => root.unmount());
      cache.clear();
      host.remove();
    }
  });
});
