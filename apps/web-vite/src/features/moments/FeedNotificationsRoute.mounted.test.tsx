// @vitest-environment jsdom
/** WEB-URL-022 actual App/router direct-link; all test responses synthetic.
 * Default route now invokes registered Hono GET; never marks notifications read. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeAll,  afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { navigate, routeForPath } from "../../shared/router/location";
import type { NotificationReadWire } from "./notificationsReadApi";
const actor = (id: string) => ({ id, username: "user_" + id, role: "USER" });
const notice = (id = "n1", extra: Record<string, unknown> = {}) => ({
  id,
  kind: "reply",
  postId: "post_1",
  commentId: "comment_1",
  readAt: null,
  createdAt: "2026-10-21T10:00:00Z",
  targetAvailable: true,
  actorCount: 1,
  actors: [
    {
      id: "other",
      name: "Отвечающий",
      username: "trainer",
      avatarUrl: "SECRET_AVATAR",
      email: "PRIVATE_EMAIL",
    },
  ],
  metadata: "PRIVATE_TOKEN",
  ...extra,
});
const page = (items: unknown[] = [], nextCursor: string | null = null) => ({
  items,
  nextCursor,
  serverNow: "2026-10-21T12:00:00Z",
  SECRET_METADATA: "PRIVATE_BACKEND",
});
function deferred<T>() {
  let resolve!: (r: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
let root: Root, host: HTMLDivElement, cache: QueryClient;
let wire: NotificationReadWire;
let status: ReturnType<typeof vi.fn<NotificationReadWire["status"]>>;
let list: ReturnType<typeof vi.fn<NotificationReadWire["list"]>>;
let fetchMock: ReturnType<typeof vi.fn>;
// Route chunks and owner-scoped GET results settle on successive React commits.
beforeAll(async () => { await import("../moments/MomentsNotificationsOptIn"); });
const tick = async () => {
  for (let i=0; i<5; i++) {
    await act(async () => { await new Promise(done=>setTimeout(done,100)); });
  }
};
async function mount(options: { enabled?: boolean; withWire?: boolean; path?: string } = {}) {
  window.history.replaceState(null, "", options.path ?? "/feed/notifications");
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <App
          showNotificationsRouteOptIn={options.enabled ?? true}
          notificationsRouteWire={options.withWire === false ? undefined : wire}
        />
      </QueryClientProvider>,
    ),
  );
  await tick();
}
async function button(label: string) {
  const el = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (x) => x.textContent?.trim() === label,
  );
  expect(el, label).toBeTruthy();
  await act(async () => el?.click());
  await tick();
}
async function principal(id: string | null) {
  await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY, id ? actor(id) : null));
  await tick();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, actor("A"));
  status = vi.fn(async () => ({ enabled: true }));
  list = vi.fn(async () => page([notice()]));
  wire = { fixtureKind: "AG2_FEED_NOTIFICATIONS_SYNTHETIC_GET_ONLY", status, list };
  fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method && options.method !== "GET") throw Error("MUTATION_FORBIDDEN");
    if (url === "/api/v1/feed/status")
      return new Response(
        JSON.stringify({ success: true, data: { enabled: true, smartEnabled: false } }),
        { status: 200 },
      );
    if (url.startsWith("/api/v1/feed/notifications?pageSize=20"))
      return new Response(JSON.stringify({ success: true, data: page([notice()]) }),
        { status: 200 });
    if (url.startsWith("/api/v1/feed/posts"))
      return new Response(JSON.stringify({ success: true, data: page() }), { status: 200 });
    if (url === "/api/v1/user/profile")
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "A",
            username: "user_A",
            profile: { fullName: "Владелец", city: "Самара", about: "" },
          },
        }),
        { status: 200 },
      );
    throw Error("UNEXPECTED_REQUEST_" + url);
  });
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  window.history.replaceState(null, "", "/");
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
describe("WEB-URL-022 direct legacy notification route source/mock only", () => {
  it("exact direct link recognized; no suffix/encoded segment accepted", () => {
    expect(routeForPath("/feed/notifications")).toBe("/feed/notifications");
    for (const p of [
      "/feed/notifications/more",
      "/feed/notifications%2Fbad",
      "/feed/notifications/../admin",
    ])
      expect(routeForPath(p)).not.toBe("/feed/notifications");
  });
  it("default App GET route without fixture reads own history, never marks read", async () => {
    await mount({ withWire: false, enabled: false });
    expect(host.textContent).toContain("Отвечающий");
    expect(host.textContent).not.toContain("Страница не найдена");
    expect(host.querySelector('section[aria-label="История уведомлений"]')).not.toBeNull();
    expect(fetchMock.mock.calls.some(([url]) =>
      String(url).startsWith("/api/v1/feed/notifications?pageSize=20"))).toBe(true);
    expect(fetchMock.mock.calls.every(([, opts]) => !opts?.method || opts.method === "GET"))
      .toBe(true);
    expect(fetchMock.mock.calls.map(([url]) => String(url)).join(" ")).not.toMatch(/read-all/);
    expect(status).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });
  it("guest: login guard and no notification source requests", async () => {
    cache.setQueryData(CURRENT_USER_QUERY_KEY, null);
    await mount();
    expect(window.location.pathname).toBe("/");
    expect(host.textContent).toContain("Уверенность");
    expect(host.textContent).not.toContain("История уведомлений");
    expect(host.querySelector(".notification-history-list")).toBeNull();
    expect(status).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });
  it("direct-link loads without extra entry click; read/unread and reply/post navigation", async () => {
    list.mockResolvedValueOnce(
      page([
        notice(),
        notice("n2", { kind: "author_post", postId: "post_2", readAt: "2026-10-21T11:00:00Z" }),
      ]),
    );
    await mount();
    expect(status).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledExactlyOnceWith(null);
    expect(host.querySelectorAll(".notification-history-list li")).toHaveLength(2);
    expect(host.querySelector(".notification-history-list .notification-history__avatar")).toBeTruthy();
    expect(host.querySelectorAll(".notification-history-list li.is-unread")).toHaveLength(1);
    expect(host.querySelectorAll(".notification-history-list li.is-read")).toHaveLength(1);
    expect(host.textContent).toContain("Не прочитано");
    expect(host.textContent).toContain("Прочитано");
    expect(host.querySelector('a[href="/moments/post_1?commentId=comment_1"]')?.textContent).toContain("ответом");
    expect(host.querySelector('a[href="/moments/post_2"]')).toBeTruthy();
    expect(host.innerHTML).not.toMatch(/PRIVATE_|SECRET_|avatarUrl|PRIVATE_EMAIL/);
    // The authenticated shell also reads onboarding-tour state; the synthetic
    // notification history never loads unrelated private feed data or writes.
    expect(fetchMock.mock.calls.map(([url]) => url))
      .toEqual(["/api/v1/user/onboarding-tour"]);
    expect(fetchMock.mock.calls.every(([, opts]) => !opts?.method || opts.method === "GET"))
      .toBe(true);
    expect(host.textContent).not.toContain("Прочитать всё");
  });
  it("reply notification link navigates to existing post route without mark-read", async () => {
    await mount();
    const link = host.querySelector<HTMLAnchorElement>('a[href="/moments/post_1?commentId=comment_1"]');
    expect(link?.textContent).toContain("ответом");
    await act(async () => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(window.location.pathname).toBe("/moments/post_1");
    expect(window.location.search).toBe("?commentId=comment_1");
    await tick();
    expect(fetchMock.mock.calls.every(([, opts]) => !opts || opts.method === "GET")).toBe(true);
    expect(fetchMock.mock.calls.map(([url]) => String(url)).join(" ")).not.toMatch(
      /read-all|notifications\//,
    );
  });
  it("empty, error and explicit retry: never automatic writes", async () => {
    list.mockRejectedValueOnce(Error("PRIVATE_BACKEND_FAIL"));
    await mount();
    expect(host.textContent).toContain("Не удалось загрузить уведомления");
    expect(host.innerHTML).not.toContain("PRIVATE_BACKEND_FAIL");
    await button("Повторить чтение");
    expect(list).toHaveBeenCalledTimes(2);
    await button("К «Моментам»");
    expect(window.location.pathname).toBe("/moments");
    expect(host.querySelector(".notification-history-list")).toBeNull();
    expect(fetchMock.mock.calls.every(([path]) => !String(path).includes("read-all"))).toBe(true);
  });
  it("pagination and next-page failed retry preserve previous verified row", async () => {
    list.mockImplementation(async (cursor) =>
      cursor === null
        ? page([notice()], "next_1")
        : list.mock.calls.filter(([c]) => c === "next_1").length === 1
          ? Promise.reject(Error("PRIVATE_PAGE_FAIL"))
          : page([notice("n2")], null),
    );
    await mount();
    await button("Ещё уведомления");
    expect(host.querySelectorAll(".notification-history-list li")).toHaveLength(1);
    expect(host.textContent).toContain("следующую страницу");
    await button("Повторить страницу уведомлений");
    expect(host.querySelectorAll(".notification-history-list li")).toHaveLength(2);
    expect(list.mock.calls.map(([cursor]) => cursor)).toEqual([null, "next_1", "next_1"]);
  });
  it("A-B-A late status must not start list nor reveal stale UI", async () => {
    const waiting = deferred<unknown>();
    status.mockReturnValueOnce(waiting.promise);
    await mount();
    await principal("B");
    await principal("A");
    await act(async () => waiting.resolve({ enabled: true }));
    await tick();
    expect(list).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Отвечающий");
    expect(host.textContent).toContain("Личные данные скрыты");
  });
  it("late list result after route exit/unmount never displays private content", async () => {
    const waiting = deferred<unknown>();
    list.mockReturnValueOnce(waiting.promise);
    await mount();
    await act(async () => navigate("/moments"));
    await tick();
    await act(async () => waiting.resolve(page([notice()])));
    await tick();
    expect(host.textContent).not.toContain("Отвечающий");
    expect(host.querySelectorAll(".notification-history-list li")).toHaveLength(0);
  });
  it("route popstate back returns read-only direct screen", async () => {
    await mount();
    expect(host.textContent).toContain("Отвечающий");
    await button("К «Моментам»");
    expect(window.location.pathname).toBe("/moments");
    await act(async () => {
      window.history.replaceState(null, "", "/feed/notifications");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await tick();
    expect(host.querySelectorAll(".notification-history-list li")).toHaveLength(1);
    expect(fetchMock.mock.calls.every(([, options]) => !options || options.method === "GET")).toBe(
      true,
    );
  });
});
