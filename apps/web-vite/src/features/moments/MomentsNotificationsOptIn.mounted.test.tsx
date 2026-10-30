// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, it, expect, describe, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { MomentsCatalog } from "./MomentsCatalog";
import type { NotificationReadWire } from "./notificationsReadApi";
const notice = (id = "n1") => ({
  id,
  postId: "p1",
  commentId: null,
  kind: "comment",
  readAt: null,
  targetAvailable: true,
  createdAt: "2026-10-18T10:00:00.000Z",
  actorCount: 1,
  actors: [
    { id: "u1", username: "trainer", name: "Анна", avatarUrl: "SECRET_S3", email: "PRIVATE_MAIL" },
  ],
  metadata: "PRIVATE_TOKEN",
});
const page = (items: unknown[] = [], nextCursor: string | null = null) => ({
  items,
  nextCursor,
  serverNow: "2026-10-18T11:00:00.000Z",
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((ok) => (resolve = ok));
  return { promise, resolve };
};
let cache: QueryClient, root: Root, host: HTMLElement;
let status: ReturnType<typeof vi.fn<NotificationReadWire["status"]>>;
let list: ReturnType<typeof vi.fn<NotificationReadWire["list"]>>;
let fetcher: ReturnType<typeof vi.fn>;
let wire: NotificationReadWire;
const flush = async () =>
  act(async () => {
    await new Promise((ok) => setTimeout(ok, 20));
  });
async function view(enabled = true, transport: NotificationReadWire | null = wire) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <MomentsCatalog
          userId="A"
          showNotificationsOptIn={enabled}
          notificationSyntheticTransport={transport ?? undefined}
        />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button?.click());
  await flush();
}
async function enter() {
  await view();
  await click("История уведомлений (макет)");
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A", username: "ownerA", role: "USER" });
  status = vi.fn(async () => ({ enabled: true }));
  list = vi.fn(async () => page([notice()]));
  wire = { fixtureKind: "AG2_FEED_NOTIFICATIONS_SYNTHETIC_GET_ONLY", status, list };
  fetcher = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify({
          success: true,
          data:
            url === "/api/v1/feed/status"
              ? { enabled: true, smartEnabled: false }
              : { items: [], nextCursor: null, serverNow: "2026-10-18T11:00:00.000Z" },
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  window.history.replaceState(null, "", "/moments");
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
describe("WEB-URL-022 Moments -> notification history opt-in", () => {
  it("N-M01 default off: no entry/notification GET", async () => {
    await view(false);
    expect(host.textContent).not.toContain("История уведомлений (макет)");
    expect(list).not.toHaveBeenCalled();
  });
  it("N-M02 without synthetic transport: entry is visible, no private fixture read", async () => {
    await view(true, null);
    expect(host.textContent).toContain("История уведомлений (макет)");
    expect(list).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });
  it("N-M03 entry, GET status, list, back without writes/privacy leak", async () => {
    await enter();
    expect(status).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledExactlyOnceWith(null);
    expect(host.textContent).toContain("Уведомления «Моментов»");
    expect(host.textContent).toContain("Анна");
    expect(host.querySelector('a[href="/moments/p1"]')).toBeTruthy();
    expect(host.innerHTML).not.toMatch(/PRIVATE_|SECRET_|avatarUrl/);
    expect(host.textContent).not.toContain("Прочитать всё");
    await click("К «Моментам»");
    expect(host.textContent).not.toContain("Анна");
    expect(host.textContent).toContain("История уведомлений (макет)");
  });
  it("N-M03a reply deep link navigates to exact comment, never marks read", async () => {
    list.mockResolvedValueOnce(page([
      { ...notice(), kind: "reply", commentId: "comment_1" },
      { ...notice("n2"), kind: "author_post", postId: "p2", commentId: "comment_2" },
    ]));
    await enter();
    const reply = host.querySelector<HTMLAnchorElement>(
      'a[href="/moments/p1?commentId=comment_1"]');
    expect(reply?.textContent).toContain("ответом");
    expect(host.querySelector('a[href="/moments/p2"]')).not.toBeNull();
    expect(host.querySelector('a[href="/moments/p2?commentId=comment_2"]')).toBeNull();
    await act(async () => reply!.dispatchEvent(new MouseEvent("click", {
      bubbles: true, cancelable: true, button: 0,
    })));
    expect(window.location.pathname).toBe("/moments/p1");
    expect(window.location.search).toBe("?commentId=comment_1");
    expect(list).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.every(([, options]) => !options?.method ||
      options.method === "GET")).toBe(true);
  });

  it("N-M04 server disables feed: no history GET", async () => {
    status.mockResolvedValueOnce({ enabled: false });
    await enter();
    expect(host.textContent).toContain("Моменты» сейчас недоступен");
    expect(list).not.toHaveBeenCalled();
  });
  it("N-M05 pending access: no premature list", async () => {
    const d = deferred<unknown>();
    status.mockReturnValueOnce(d.promise);
    await enter();
    expect(host.textContent).toContain("Проверяем доступность уведомлений");
    expect(list).not.toHaveBeenCalled();
    await act(async () => d.resolve({ enabled: true }));
    await flush();
    expect(list).toHaveBeenCalledTimes(1);
  });
  it("N-M06 empty notification page", async () => {
    list.mockResolvedValueOnce(page());
    await enter();
    expect(host.textContent).toContain("Уведомлений пока нет");
  });
  it("N-M07 error redacted; manual GET retries only", async () => {
    list.mockRejectedValueOnce(Error("PRIVATE_STACK"));
    await enter();
    expect(host.textContent).toContain("Не удалось загрузить уведомления");
    expect(host.textContent).not.toContain("PRIVATE_STACK");
    await click("Повторить чтение");
    expect(host.textContent).toContain("Анна");
  });
  it("N-M08 status error redacted and manual retry", async () => {
    status.mockRejectedValueOnce(Error("PRIVATE_GATE"));
    await enter();
    expect(host.textContent).toContain("Не удалось проверить доступ");
    expect(list).not.toHaveBeenCalled();
    await click("Повторить проверку");
    expect(list).toHaveBeenCalledTimes(1);
  });
  it("N-M09 server cursor paging, dedupe repeated notification", async () => {
    list.mockImplementation(async (cursor) =>
      cursor ? page([notice(), notice("n2")]) : page([notice()], "next1"),
    );
    await enter();
    await click("Ещё уведомления");
    expect(list).toHaveBeenCalledWith("next1");
    expect(host.querySelectorAll(".notification-history-list li")).toHaveLength(2);
  });
  it("N-M10 deleted target: no clickable link", async () => {
    list.mockResolvedValueOnce(page([{ ...notice(), targetAvailable: false }]));
    await enter();
    expect(host.textContent).toContain("Публикация удалена");
    expect(host.querySelector('a[href="/moments/p1"]')).toBeNull();
  });
  it("N-M11 A-B-A revokes private history", async () => {
    await enter();
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "B" }));
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A" }));
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Анна");
  });
  it("N-M12 late status after A-B-A must not list", async () => {
    const d = deferred<unknown>();
    status.mockReturnValueOnce(d.promise);
    await enter();
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "B" }));
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A" }));
    await act(async () => d.resolve({ enabled: true }));
    await flush();
    expect(list).not.toHaveBeenCalled();
  });
  it("N-M13 late page after A-B-A not rendered", async () => {
    const d = deferred<unknown>();
    list.mockReturnValueOnce(d.promise);
    await enter();
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "B" }));
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A" }));
    await act(async () => d.resolve(page([notice()])));
    await flush();
    expect(host.textContent).not.toContain("Анна");
  });
  it("N-M14 next-page 503 keeps first notifications and explicit retry recovers", async () => {
    let calls = 0;
    list.mockImplementation(async (cursor) =>
      cursor === null
        ? page([notice()], "cursor_next")
        : ++calls === 1
          ? Promise.reject({ status: 503 })
          : page([notice("n2")], null),
    );
    await enter();
    await click("Ещё уведомления");
    expect(host.querySelectorAll(".notification-history-list li")).toHaveLength(1);
    expect(host.textContent).toContain("Не удалось загрузить следующую страницу");
    await click("Повторить страницу уведомлений");
    expect(host.querySelectorAll(".notification-history-list li")).toHaveLength(2);
    expect(host.textContent).not.toContain("Не удалось загрузить следующую страницу");
    expect(calls).toBe(2);
  });
  it("N-M15 repeated nextCursor rejects new page but preserves first", async () => {
    list.mockImplementation(async (cursor) =>
      cursor === null ? page([notice()], "cursor_repeat") : page([notice("n2")], "cursor_repeat"),
    );
    await enter();
    await click("Ещё уведомления");
    expect(host.querySelectorAll(".notification-history-list li")).toHaveLength(1);
    expect(host.textContent).toContain("Не удалось загрузить следующую страницу");
    expect(list).toHaveBeenCalledTimes(2);
  });
});
