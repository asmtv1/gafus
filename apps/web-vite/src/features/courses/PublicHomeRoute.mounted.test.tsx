// @vitest-environment jsdom
/** WEB-URL-052: source Next public landing versus protected catalog.
 * Next middleware routes unauthed private URLs to / and renders presentation.
 * Do not reinstate the old public /courses guest catalog expectations. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { navigate } from "../../shared/router/location";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";

// This App route is React.lazy; prewarm the route module, not a fixed timeout.
beforeAll(async () => { await import("../../brand/PublicLanding"); });

let host: HTMLDivElement, root: Root, cache: QueryClient;
let calls: ReturnType<typeof vi.fn>;
const settle = () => act(async () => {
  await new Promise(resolve => setTimeout(resolve, 20));
});
async function mount(path: string) {
  window.history.replaceState(null, "", path);
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <App />
  </QueryClientProvider>));
  await settle();
}
const noPrivateReads = () => {
  expect(calls.mock.calls.every(([url]) => url === "/api/v1/public/platform-stats")).toBe(true);
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cache = new QueryClient({ defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  } });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, null);
  calls = vi.fn(async (url: string) => new Response(JSON.stringify({
    success: url === "/api/v1/public/platform-stats",
    data: url === "/api/v1/public/platform-stats" ? { students: 20 } : null,
    error: "NO_PRIVATE_DATA_FOR_GUEST",
  }), { status: url === "/api/v1/public/platform-stats" ? 200 : 403 }));
  vi.stubGlobal("fetch", calls);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  window.history.replaceState(null, "", "/");
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear(); host.remove(); vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
describe("WEB-URL-052 Next public landing + guest redirect contract", () => {
  it("/ is the real landing, not a public course list", async () => {
    await mount("/");
    expect(window.location.pathname).toBe("/");
    expect(host.querySelector('[data-ui-parity="legacy-landing"]')).not.toBeNull();
    expect(host.textContent).toContain("ГАФУС");
    expect(host.querySelector(".course-card")).toBeNull();
    expect(host.textContent).not.toContain("Открытые курсы");
    noPrivateReads();
  });
  it.each([
    "/login", "/register", "/passwordReset", "/reset-password",
    "/profile/confirm-email",
  ])("public Next auth/recovery route %s stays accessible", async path => {
    await mount(path);
    expect(window.location.pathname).toBe(path);
    expect(host.querySelector(".course-card")).toBeNull();
    noPrivateReads();
  });
  it.each([
    "/courses/free_1", "/articles/article-1", "/questions/question-1",
    "/moments/drafts", "/profile?username=admin", "/profile/albums",
    "/not-a-route",
  ])("guest cannot bypass redirect by deep-linking %s", async path => {
    await mount(path);
    expect(window.location.pathname).toBe("/");
    expect(host.querySelector('[data-ui-parity="legacy-landing"]')).not.toBeNull();
    expect(host.querySelector(".course-card")).toBeNull();
    noPrivateReads();
  });
  it("native SPA navigation / -> /courses redirects back to / instead of public catalog", async () => {
    await mount("/");
    await act(async () => navigate("/courses"));
    await settle();
    expect(window.location.pathname).toBe("/");
    expect(host.querySelector('[data-ui-parity="legacy-landing"]')).not.toBeNull();
    noPrivateReads();
  });
  it("signed-in user on / is redirected to the private catalog", async () => {
    cache.setQueryData(CURRENT_USER_QUERY_KEY, {
      id: "member-1", username: "member", role: "USER",
    });
    calls.mockImplementation(async (url: string) => new Response(JSON.stringify({
      success: true, data: url === "/api/v1/courses" ? [] : { students: 20 },
    }), { status: 200 }));
    await mount("/");
    await settle();
    expect(window.location.pathname).toBe("/courses");
    expect(host.querySelector('[data-ui-parity="legacy-landing"]')).toBeNull();
    expect(calls.mock.calls.some(([url]) => url === "/api/v1/public/courses")).toBe(false);
  });
  it("unknown /auth/me is not a verified guest: no private screen or unsafe redirect", async () => {
    cache.removeQueries({ queryKey: CURRENT_USER_QUERY_KEY });
    calls.mockImplementation(async () => new Response(JSON.stringify({
      success: false, error: "TRANSIENT_AUTH_FAILURE",
    }), { status: 503 }));
    await mount("/courses");
    expect(window.location.pathname).toBe("/courses");
    expect(host.textContent).toContain("Не удалось проверить авторизацию");
    expect(host.textContent).not.toContain("TRANSIENT_AUTH_FAILURE");
    expect(host.querySelector(".course-card")).toBeNull();
    expect(calls.mock.calls.some(([url]) => url === "/api/v1/courses")).toBe(false);
  });
});
