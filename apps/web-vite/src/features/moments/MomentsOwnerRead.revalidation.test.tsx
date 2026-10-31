// @vitest-environment jsdom
import { withRejectedRefreshCookie } from "../../test/rejectedRefreshCookie";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { MomentsProfile } from "./MomentsProfile";
import { MomentDetails } from "./MomentDetails";
const raw = (id: string, text: string) => ({
  id,
  text,
  status: "published",
  author: { id: "author1", username: "trainer", name: "Кинолог", role: "TRAINER" },
  createdAt: "2026-10-18T10:00:00Z",
  publishedAt: "2026-10-18T10:00:00Z",
  reactions: [],
  attachments: [],
  myReaction: null,
  commentCount: 0,
  viewCount: 1,
  canEdit: false,
});
const projected = {
  id: "post-old",
  text: "PRIVATE_STALE_MOMENT",
  createdAt: "2026-10-18T10:00:00Z",
  publishedAt: "2026-10-18T10:00:00Z",
  authorName: "Кинолог",
  username: "trainer",
  roleBadge: null,
  reactions: [],
  media: [],
  myReaction: null,
  commentCount: 0,
  viewCount: 1,
  canEdit: false,
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status === 200, data, error: "PRIVATE_SERVER_TRACE" }), {
    status,
  });
function deferred<T>() {
  let resolve!: (result: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
let host: HTMLDivElement, root: Root, cache: QueryClient;
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 35));
  });
}
async function mount(kind: "profile" | "detail") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        {kind === "profile" ? (
          <MomentsProfile userId="viewer" username="trainer" />
        ) : (
          <MomentDetails userId="viewer" postId="post-1" />
        )}
      </QueryClientProvider>,
    ),
  );
  await settle();
}
async function click(text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (el) => el.textContent?.trim() === text,
  );
  expect(button, text).toBeDefined();
  await act(async () => button?.click());
  await settle();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "viewer", username: "viewer" });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("FEED-031 author and post fresh-read publication boundary", () => {
  it("F-R01 cached enabled status cannot initiate profile posts GET", async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
    cache.setQueryData(["moments", "status", "viewer"], { enabled: true, smartEnabled: false });
    cache.setQueryData(["moments", "profile", "viewer", "trainer"], {
      pages: [{ items: [projected], nextCursor: null }],
      pageParams: [null],
    });
    await mount("profile");
    expect(host.textContent).toContain("Перепроверяем доступ");
    expect(host.textContent).not.toContain("PRIVATE_STALE_MOMENT");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(response({ enabled: false })));
    await settle();
    expect(host.textContent).toContain("Моменты сейчас недоступны");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("F-R02 cached author posts must be withheld during current posts GET", async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn((url: string) =>
      url.endsWith("/status") ? Promise.resolve(response({ enabled: true })) : pending.promise,
    );
    vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
    cache.setQueryData(["moments", "profile", "viewer", "trainer"], {
      pages: [{ items: [projected], nextCursor: null }],
      pageParams: [null],
    });
    await mount("profile");
    expect(host.textContent).toContain("Перепроверяем публикации");
    expect(host.textContent).not.toContain("PRIVATE_STALE_MOMENT");
    await act(async () =>
      pending.resolve(response({ items: [raw("post-1", "Новый пост автора")], nextCursor: null })),
    );
    await settle();
    expect(host.textContent).toContain("Новый пост автора");
  });
  it.each([
    [401, "Сессия завершена. Войдите снова."],
    [403, "Публикации пользователя недоступны."],
    [404, "Публикации автора недоступны."],
  ])("F-R07 profile page2 HTTP%s masks older cards and actions", async (code, message) => {
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") throw Error("READ test must not POST");
      return Promise.resolve(
        url.endsWith("/status")
          ? response({ enabled: true })
          : url.includes("cursor=next1")
            ? response(null, code)
            : response({ items: [raw("post-1", "PRIVATE_VERIFIED_AUTHOR_POST")],
              nextCursor: "next1" }),
      );
    });
    vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
    await mount("profile");
    expect(host.textContent).toContain("PRIVATE_VERIFIED_AUTHOR_POST");
    expect(host.querySelector('a[href="/moments/post-1"]')).not.toBeNull();
    await click("Ещё публикации");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(host.textContent).not.toContain("PRIVATE_VERIFIED_AUTHOR_POST");
    expect(host.querySelector(".moments-catalog-grid")).toBeNull();
    expect(host.querySelector('a[href="/moments/post-1"]')).toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_SERVER_TRACE");
    expect(host.textContent).not.toContain("Нет доступных публикаций этого автора");
    expect(host.textContent).not.toContain("Не удалось загрузить следующую страницу");
    expect([...host.querySelectorAll<HTMLButtonElement>("button")]
      .some((button) => button.textContent?.includes("Повторить") ||
        button.textContent?.includes("Ещё публикации"))).toBe(false);
    expect(host.querySelector('a[href="/login"]') !== null).toBe(code === 401);
    expect(fetcher.mock.calls.map(([url]) => url.includes("cursor=next1")))
      .toEqual([false, false, true]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("F-R03 second page 503 preserves current author posts with manual retry", async () => {
    let second = 0;
    vi.stubGlobal(
      "fetch",
      withRejectedRefreshCookie(vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith("/status")
            ? response({ enabled: true })
            : url.includes("cursor=next1")
              ? ++second === 1
                ? response(null, 503)
                : response({ items: [raw("post-2", "Второй пост автора")], nextCursor: null })
              : response({ items: [raw("post-1", "Первый пост автора")], nextCursor: "next1" }),
        ),
      )),
    );
    await mount("profile");
    await click("Ещё публикации");
    expect(host.textContent).toContain("Первый пост автора");
    expect(host.textContent).toContain("Не удалось загрузить следующую страницу");
    await click("Повторить страницу");
    expect(host.textContent).toContain("Первый пост автора");
    expect(host.textContent).toContain("Второй пост автора");
    expect(host.textContent?.match(/Первый пост автора/g)).toHaveLength(1);
    expect(second).toBe(2);
  });
  it.each(["next", "retry"])("F-FLIGHT-PRE profile same-turn double %s starts one page2 GET", async (mode) => {
    const waiting = deferred<Response>();
    let second = 0;
    const fetcher = vi.fn((url: string) => {
      if (url.endsWith("/status")) return Promise.resolve(response({ enabled: true }));
      if (!url.includes("cursor=next1")) return Promise.resolve(response({
        items: [raw("post-1", "Проверенный первый")], nextCursor: "next1",
      }));
      second++;
      if (mode === "retry" && second === 1) return Promise.resolve(response(null, 503));
      return waiting.promise;
    });
    vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
    await mount("profile");
    if (mode === "retry") await click("Ещё публикации");
    const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (element) => element.textContent?.trim() === (mode === "next" ? "Ещё публикации" : "Повторить страницу"),
    );
    expect(button).toBeDefined();
    await act(async () => { button?.click(); button?.click(); });
    await settle();
    expect(fetcher.mock.calls.filter(([url]) => url.includes("cursor=next1"))).toHaveLength(
      mode === "retry" ? 2 : 1,
    );
    expect(host.textContent).toContain("Проверенный первый");
    await act(async () => waiting.resolve(response({
      items: [raw("post-2", "Проверенный второй")], nextCursor: null,
    })));
    await settle();
    expect(host.textContent).toContain("Проверенный второй");
  });

  it("F-FLIGHT-AUTHOR late old profile page does not unblock new author", async () => {
    const old = deferred<Response>();
    const fresh = deferred<Response>();
    let flight = 0;
    const fetcher = vi.fn((url: string) => {
      if (url.endsWith("/status")) return Promise.resolve(response({ enabled: true }));
      const newAuthor = url.includes("another-trainer");
      const author = newAuthor
        ? { id: "author2", username: "another-trainer", name: "Другой", role: "TRAINER" }
        : { id: "author1", username: "trainer", name: "Кинолог", role: "TRAINER" };
      if (!url.includes("cursor=next1")) return Promise.resolve(response({
        items: [{ ...raw(newAuthor ? "new-1" : "old-1", newAuthor ? "Новый автор" : "Старый автор"), author }],
        nextCursor: "next1",
      }));
      flight++;
      return flight === 1 ? old.promise : fresh.promise;
    });
    vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
    await mount("profile");
    await click("Ещё публикации");
    expect(flight).toBe(1);
    await act(async () => root.render(
      <QueryClientProvider client={cache}>
        <MomentsProfile userId="viewer" username="another-trainer" />
      </QueryClientProvider>,
    ));
    await settle();
    expect(host.textContent).toContain("Новый автор");
    await click("Ещё публикации");
    expect(flight).toBe(2);
    expect([...host.querySelectorAll<HTMLButtonElement>("button")].some(
      (button) => button.disabled && button.textContent?.includes("Загрузка"),
    )).toBe(true);
    await act(async () => old.resolve(response({
      items: [raw("private-old", "PRIVATE_PREVIOUS_AUTHOR")], nextCursor: null,
    })));
    await settle();
    expect(host.textContent).not.toContain("PRIVATE_PREVIOUS_AUTHOR");
    expect([...host.querySelectorAll<HTMLButtonElement>("button")].some(
      (button) => button.disabled && button.textContent?.includes("Загрузка"),
    )).toBe(true);
    await act(async () => fresh.resolve(response({
      items: [{ ...raw("new-2", "Второй нового автора"), author: {
        id: "author2", username: "another-trainer", name: "Другой", role: "TRAINER",
      } }], nextCursor: null,
    })));
    await settle();
    expect(host.textContent).toContain("Второй нового автора");
    expect(host.textContent).not.toContain("PRIVATE_PREVIOUS_AUTHOR");
    expect(fetcher.mock.calls.filter(([url]) => url.includes("cursor=next1"))).toHaveLength(2);
  });

  it("F-R04 cached status cannot authorize standalone post GET or old detail", async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
    cache.setQueryData(["moments", "status", "viewer"], { enabled: true, smartEnabled: false });
    cache.setQueryData(["moments", "post", "viewer", "post-1"], projected);
    await mount("detail");
    expect(host.textContent).toContain("Перепроверяем доступ");
    expect(host.textContent).not.toContain("PRIVATE_STALE_MOMENT");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(response({ enabled: false })));
    await settle();
    expect(host.textContent).toContain("Моменты сейчас недоступны");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("F-R05 stale post content/actions withheld during direct detail GET", async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn((url: string) =>
      url.endsWith("/status") ? Promise.resolve(response({ enabled: true })) : pending.promise,
    );
    vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
    cache.setQueryData(["moments", "post", "viewer", "post-1"], projected);
    await mount("detail");
    expect(host.textContent).toContain("Перепроверяем публикацию");
    expect(host.textContent).not.toContain("PRIVATE_STALE_MOMENT");
    expect(host.querySelector('[aria-label="Комментарии"]')).toBeNull();
    await act(async () => pending.resolve(response(null, 404)));
    await settle();
    expect(host.textContent).not.toContain("PRIVATE_STALE_MOMENT");
    expect(host.textContent).toContain("Публикация недоступна");
  });
  it("F-R06 status 401 offers login and does not load post", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(null, 401));
    vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
    cache.setQueryData(["moments", "status", "viewer"], { enabled: true, smartEnabled: false });
    await mount("detail");
    expect(host.textContent).toContain("Сессия завершена");
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("PRIVATE_SERVER_TRACE");
  });
});
