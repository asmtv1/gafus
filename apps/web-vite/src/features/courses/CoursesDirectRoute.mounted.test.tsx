// @vitest-environment jsdom
/** WEB-URL-013: Next middleware parity — guests never read the courses catalog.
 * The original guest-course mounted scenario was incorrect: Next redirects to /.
 * Core public projection remains independently tested in courseApi.test.ts. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { routeForPath } from "../../shared/router/location";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";

let root: Root, host: HTMLDivElement, cache: QueryClient;
let fetcher: ReturnType<typeof vi.fn>;
const tick = async () => act(async () => {
  await new Promise(resolve => setTimeout(resolve, 24));
});
async function mount(path: string) {
  window.history.replaceState(null, "", path);
  await act(async () => root.render(
    <QueryClientProvider client={cache}><App /></QueryClientProvider>,
  ));
  await tick();
}
const authorizedCourse = {
  id: "course-1", name: "Свобода от тревоги", type: "separation_anxiety",
  duration: "25 дней", shortDesc: "Учимся оставаться дома спокойно",
  isPaid: true, isPrivate: false, hasAccess: true, isFavorite: false,
  userStatus: "IN_PROGRESS", trainingLevel: "BEGINNER",
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cache = new QueryClient({ defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  } });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, null);
  fetcher = vi.fn(async (url: string) => new Response(JSON.stringify({
    success: url === "/api/v1/public/platform-stats",
    data: url === "/api/v1/public/platform-stats" ? { students: 20 } : null,
    error: "UNAUTHORIZED",
  }), { status: url === "/api/v1/public/platform-stats" ? 200 : 401 }));
  vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear(); host.remove(); vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
const protectedPaths = [
  "/courses", "/courses/course-1", "/trainings/separation_anxiety",
  "/trainings/separation_anxiety/day-1", "/pets", "/profile",
  "/articles", "/questions", "/moments", "/reminders",
  "/cynologist-chat", "/profile/albums", "/feed", "/favorites",
] as const;
describe("WEB-URL-013 original Next private route redirects", () => {
  it.each(protectedPaths)("known guest %s -> / landing without private GET", async path => {
    await mount(path);
    // Auth redirect and lazy landing chunk are distinct commits. The private
    // route must redirect immediately, but its public landing can take longer
    // than the single 24 ms tick on a busy monorepo build runner.
    for (let i = 0; i < 180 &&
      !host.querySelector('[data-ui-parity="legacy-landing"]'); i++) await tick();
    expect(window.location.pathname).toBe("/");
    expect(host.querySelector('[data-ui-parity="legacy-landing"]')).not.toBeNull();
    expect(host.querySelector(".course-card")).toBeNull();
    expect(fetcher.mock.calls.every(([url]) => url === "/api/v1/public/platform-stats")).toBe(true);
  });
  it("route parser retains exact original source training URL", () => {
    expect(routeForPath("/trainings/separation_anxiety")).toBe("/trainings/separation_anxiety");
    expect(routeForPath("/courses/course-1")).toBe("/courses/course-1");
  });
  it("authorized course card links straight to /trainings/:type", async () => {
    cache.setQueryData(CURRENT_USER_QUERY_KEY, {
      id: "owner-1", username: "test-owner", role: "USER",
    });
    fetcher.mockImplementation(async (url: string) => new Response(JSON.stringify({
      success: url === "/api/v1/courses",
      data: url === "/api/v1/courses" ? [authorizedCourse] : null,
      error: "NOT_FOUND",
    }), { status: url === "/api/v1/courses" ? 200 : 404 }));
    await mount("/courses");
    // Authenticated catalog is lazy-loaded; preserve the exact card/ACL
    // assertions below while allowing the module to resolve under CI load.
    for (let i = 0; i < 150 && !host.querySelector(".course-card"); i++) await tick();
    const card = host.querySelector<HTMLAnchorElement>('li.course-card a[href="/trainings/separation_anxiety"]');
    expect(card).not.toBeNull();
    expect(host.querySelector('li.course-card a[href="/courses/course-1"]')).toBeNull();
    expect(card?.textContent).toContain("Свобода от тревоги");
    expect(card?.querySelectorAll("svg")).toHaveLength(3);
    expect(card?.querySelector(".access-tag")).toBeNull();
    await act(async () => card?.dispatchEvent(new MouseEvent("click", {
      bubbles: true, cancelable: true, button: 0,
    })));
    expect(window.location.pathname).toBe("/trainings/separation_anxiety");
  });
});
