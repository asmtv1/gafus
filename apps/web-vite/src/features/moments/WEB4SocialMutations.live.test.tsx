// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { HiddenAuthorsOptIn } from "./HiddenAuthorsOptIn";
import { MomentsNotificationsOptIn } from "./MomentsNotificationsOptIn";

type Reply = Record<string, unknown>;
const envelope = (data: Reply, status = 200) =>
  new Response(JSON.stringify({ success: true, data }), { status });
const owner = { id: "owner", username: "owner", role: "USER" };
const page = (items: Reply[]) => ({
  items, nextCursor: null, serverNow: "2026-10-25T10:00:00Z",
});
const author = {
  id: "hidden1", name: "Ирина", username: "irina",
  email: "PRIVATE_EMAIL", avatarUrl: "SECRET_TOKEN",
};
const notice = (id: string) => ({
  id, kind: "reply", postId: "post1", commentId: "c1",
  readAt: null as string | null, createdAt: "2026-10-25T10:00:00Z",
  targetAvailable: true, actorCount: 1, actors: [
    { id: "other", name: "Анна", username: "anna", email: "PRIVATE_EMAIL" },
  ],
});
const flush = async () => act(async () => {
  await new Promise(resolve => setTimeout(resolve, 35));
});
let root: Root, host: HTMLElement, cache: QueryClient;
const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, owner);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
async function mount(kind: "hidden" | "notifications") {
  await act(async () => root.render(
    <QueryClientProvider client={cache}>
      {kind === "hidden"
        ? <HiddenAuthorsOptIn ownerId="owner" enabled routeMode />
        : <MomentsNotificationsOptIn ownerId="owner" enabled routeMode />}
    </QueryClientProvider>,
  ));
  await flush();
}
async function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    item => item.textContent?.trim() === label,
  );
  expect(button, "Expected action " + label).toBeDefined();
  await act(async () => button?.click());
  await flush();
}

describe("WEB4 social mutations: real Hono-bound owner UI", () => {
  it("restores a hidden author via existing PATCH, confirms with GET, no private leak", async () => {
    let hidden = true;
    fetchMock.mockImplementation(async (url, options) => {
      if (url === "/api/v1/feed/status") return envelope({ enabled: true });
      if (url === "/api/v1/feed/me/hidden-authors?pageSize=20")
        return envelope(page(hidden ? [author] : []));
      if (url === "/api/v1/feed/authors/hidden1/preferences" && options?.method === "PATCH") {
        expect(JSON.parse(String(options.body))).toEqual({ hidden: false });
        hidden = false;
        return envelope({ hidden: false, notify: false });
      }
      throw new Error("UNEXPECTED_URL");
    });
    await mount("hidden");
    expect(host.textContent).toContain("Ирина");
    await click("Показывать в «Моментах»");
    expect(host.textContent).toContain("Скрытых авторов пока нет");
    expect(fetchMock.mock.calls.filter(([url, opts]) =>
      url === "/api/v1/feed/authors/hidden1/preferences" && opts?.method === "PATCH"
    )).toHaveLength(1);
    expect(host.innerHTML).not.toMatch(/PRIVATE_EMAIL|SECRET_TOKEN/);
  });

  it("403 to unhide fails closed and never removes an author optimistically", async () => {
    fetchMock.mockImplementation(async (url, options) => {
      if (url === "/api/v1/feed/status") return envelope({ enabled: true });
      if (url === "/api/v1/feed/me/hidden-authors?pageSize=20")
        return envelope(page([author]));
      if (url === "/api/v1/feed/authors/hidden1/preferences" && options?.method === "PATCH")
        return new Response(JSON.stringify({ success: false, error: "SECRET_BACKEND" }),
          { status: 403 });
      throw new Error("UNEXPECTED_URL");
    });
    await mount("hidden");
    await click("Показывать в «Моментах»");
    expect(host.textContent).toContain("Ирина");
    expect(host.textContent).toContain("Не удалось подтвердить изменение");
    expect(host.innerHTML).not.toContain("SECRET_BACKEND");
  });

  it("marks one and all notices via PATCH/POST, GET reconciles UI, no token leak", async () => {
    const read = new Set<string>();
    const notifications = [notice("n1"), notice("n2")];
    fetchMock.mockImplementation(async (url, options) => {
      if (url === "/api/v1/feed/status") return envelope({ enabled: true });
      if (url === "/api/v1/feed/notifications?pageSize=20")
        return envelope(page(notifications.map(n => ({
          ...n, readAt: read.has(n.id) ? "2026-10-25T10:01:00Z" : null,
        }))));
      if (url === "/api/v1/feed/notifications/n1" && options?.method === "PATCH") {
        expect(JSON.parse(String(options.body))).toEqual({ read: true });
        read.add("n1");
        return envelope({ id: "n1", readAt: "2026-10-25T10:01:00Z" });
      }
      if (url === "/api/v1/feed/notifications/read-all" && options?.method === "POST") {
        expect(JSON.parse(String(options.body))).toEqual({});
        read.add("n1"); read.add("n2");
        return envelope({ count: 1 });
      }
      throw new Error("UNEXPECTED_URL");
    });
    await mount("notifications");
    await click("Прочитано");
    expect(read.has("n1")).toBe(true);
    expect(host.querySelectorAll('span[aria-label="Не прочитано"]')).toHaveLength(1);
    await click("Прочитать всё");
    expect(read.has("n2")).toBe(true);
    expect(host.querySelectorAll('span[aria-label="Не прочитано"]')).toHaveLength(0);
    expect(host.textContent).toContain("Всё прочитано");
    expect(host.textContent).not.toContain("Прочитать всё");
    expect(host.innerHTML).not.toContain("PRIVATE_EMAIL");
  });
  it("retires earlier private notification rows on next-page 403", async () => {
    fetchMock.mockImplementation(async url => {
      if (url === "/api/v1/feed/status") return envelope({ enabled: true });
      if (url === "/api/v1/feed/notifications?pageSize=20")
        return envelope({ ...page([notice("n1")]), nextCursor: "n1" });
      if (url === "/api/v1/feed/notifications?cursor=n1&pageSize=20")
        return new Response(JSON.stringify({ success: false, error: "SECRET_BACKEND" }),
          { status: 403 });
      throw Error("UNEXPECTED_URL");
    });
    await mount("notifications");
    expect(host.textContent).toContain("Анна");
    await click("Ещё уведомления");
    expect(host.textContent).toContain("Доступ к уведомлениям закрыт");
    expect(host.textContent).not.toContain("Анна");
    expect(host.innerHTML).not.toContain("SECRET_BACKEND");
  });

});
