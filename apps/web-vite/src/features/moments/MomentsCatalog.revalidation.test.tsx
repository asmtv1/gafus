// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { MomentsCatalog } from "./MomentsCatalog";
import { App } from "../../App";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
const post = (id: string, text: string) => ({
  id,
  text,
  status: "published",
  createdAt: "2026-10-18T00:00:00Z",
  publishedAt: "2026-10-18T00:00:00Z",
  commentCount: 0,
  viewCount: 0,
  myReaction: null,
  bookmarked: false,
  hasPoll: false,
  canEdit: false,
  author: { id: "user1", username: "author", name: "Автор", role: "USER" },
  reactions: [],
  attachments: [],
});
const cached = {
  id: "post_A",
  text: "PRIVATE_OLD_POST",
  createdAt: "2026-10-18T00:00:00Z",
  publishedAt: "2026-10-18T00:00:00Z",
  commentCount: 0,
  viewCount: 0,
  myReaction: null,
  bookmarked: false,
  hasPoll: false,
  canEdit: false,
  authorName: "Автор",
  username: "author",
  roleBadge: null,
  reactions: [],
  media: [],
};
const res = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status === 200, data, error: "PRIVATE_BACKEND_STACK" }), {
    status,
  });
function later<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
let host: HTMLDivElement, root: Root, cache: QueryClient;
async function tick() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
}
async function mount() {
  // The added owner-only pending-post GET is independent of the feed cursor
  // test's deferred transport. Return its real empty response schema without
  // consuming an unrelated feed promise or altering asserted feed request count.
  const scopedFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal("fetch", (path: string, options?: RequestInit) =>
    path.startsWith("/api/v1/feed/me/pending-posts")
      ? Promise.resolve(res({ items: [], nextCursor: null }))
      : scopedFetch(path, options));
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <MomentsCatalog userId="A" />
      </QueryClientProvider>,
    ),
  );
  await tick();
}
function activeSort(): string | undefined {
  return host.querySelector<HTMLButtonElement>('[data-feed-sort][aria-pressed="true"]')?.dataset.feedSort;
}
async function chooseSort(value: string) {
  const button = host.querySelector<HTMLButtonElement>(`[data-feed-sort="${value}"]`);
  expect(button).not.toBeNull();
  await act(async () => button?.click());
  await tick();
}
async function press(t: string) {
  const b = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (x) => x.textContent?.trim() === t,
  );
  expect(b).toBeDefined();
  await act(async () => b?.click());
  await tick();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("Moments current availability and pagination", () => {
  it("MO-R01 stale enabled and posts never authorize feed GET before status refresh", async () => {
    const p = later<Response>();
    const fetcher = vi.fn().mockReturnValue(p.promise);
    vi.stubGlobal("fetch", fetcher);
    cache.setQueryData(["moments", "status", "A"], { enabled: true, smartEnabled: true });
    cache.setQueryData(["moments", "list", "A", "new"], {
      pages: [{ items: [cached], nextCursor: null }],
      pageParams: [null],
    });
    await mount();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Перепроверяем доступность");
    expect(host.textContent).not.toContain("PRIVATE_OLD_POST");
    expect(host.querySelector('[aria-label="Сортировка публикаций"]')).toBeNull();
    await act(async () => p.resolve(res({ enabled: false, smartEnabled: false })));
    await tick();
    expect(host.textContent).toContain("Моменты сейчас недоступны");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("MO-R02 HTTP401 status offers login and never queries feed", async () => {
    const fetcher = vi.fn().mockResolvedValue(res(null, 401));
    vi.stubGlobal("fetch", fetcher);
    cache.setQueryData(["moments", "status", "A"], { enabled: true, smartEnabled: false });
    await mount();
    expect(host.textContent).toContain("Сессия завершена");
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("MO-R03 cached feed hidden during its GET revalidation", async () => {
    const p = later<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.endsWith("/status")
          ? Promise.resolve(res({ enabled: true, smartEnabled: false }))
          : p.promise,
      ),
    );
    cache.setQueryData(["moments", "list", "A", "new"], {
      pages: [{ items: [cached], nextCursor: null }],
      pageParams: [null],
    });
    await mount();
    expect(host.textContent).toContain("Перепроверяем публикации");
    expect(host.textContent).not.toContain("PRIVATE_OLD_POST");
    await act(async () =>
      p.resolve(res({ items: [post("post_B", "Новый пост")], nextCursor: null })),
    );
    await tick();
    expect(host.textContent).toContain("Новый пост");
  });
  it("MO-R05 double click does not cancel/restart deferred cursor", async () => {
    const next = later<Response>();
    let cursorCalls = 0;
    const fetcher = vi.fn((url: string) => {
      if (url.endsWith("/status"))
        return Promise.resolve(res({ enabled: true, smartEnabled: false }));
      if (url.includes("cursor=next123")) {
        cursorCalls++;
        return next.promise;
      }
      return Promise.resolve(res({ items: [post("p1", "Первый")], nextCursor: "next123" }));
    });
    vi.stubGlobal("fetch", fetcher);
    await mount();
    const more = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Ещё публикации");
    expect(more).toBeDefined();
    await act(async () => { more?.click(); more?.click(); });
    await tick();
    const loading = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Загрузка…");
    expect(loading?.disabled).toBe(true);
    expect(host.textContent).toContain("Первый");
    const beforeResolution = cursorCalls;
    await act(async () => next.resolve(res({ items: [post("p2", "Второй")], nextCursor: null })));
    await tick();
    expect(beforeResolution).toBe(1);
    expect(host.textContent).toContain("Второй");
  });
  it("MO-R06 sort change starts its own cursor flight while old is pending", async () => {
    const old = later<Response>();
    const sorted = later<Response>();
    let oldCalls = 0;
    let sortedCalls = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.endsWith("/status"))
        return Promise.resolve(res({ enabled: true, smartEnabled: false }));
      if (url.includes("cursor=next123") && url.includes("sort=discussed")) {
        sortedCalls++;
        return sorted.promise;
      }
      if (url.includes("cursor=next123")) {
        oldCalls++;
        return old.promise;
      }
      return Promise.resolve(res(url.includes("sort=discussed")
        ? { items: [post("s1", "Сортированные первые")], nextCursor: "next123" }
        : { items: [post("p1", "Новые первые")], nextCursor: "next123" }));
    }));
    await mount();
    const oldMore = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Ещё публикации");
    await act(async () => oldMore?.click());
    await chooseSort("discussed");
    await tick();
    expect(host.textContent).toContain("Сортированные первые");
    const more = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Ещё публикации");
    await act(async () => more?.click());
    await tick();
    expect(sortedCalls).toBe(1);
    await act(async () => old.resolve(res({ items: [post("p2", "PRIVATE_STALE")],
      nextCursor: null })));
    await tick();
    expect(host.textContent).not.toContain("PRIVATE_STALE");
    await act(async () => sorted.resolve(res({ items: [post("s2", "Сортированные вторые")],
      nextCursor: null })));
    await tick();
    expect(host.textContent).toContain("Сортированные вторые");
    expect(sortedCalls).toBe(1);
    expect(oldCalls).toBe(1);
  });
  it.each([
    [401, "Сессия завершена. Войдите снова."],
    [403, "Нет доступа к публикациям."],
    [404, "Раздел недоступен."],
  ])("MO-R07 page2 HTTP%s hides feed cards and actions", async (status, message) => {
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") throw Error("READ test must not POST");
      if (url.endsWith("/status"))
        return Promise.resolve(res({ enabled: true, smartEnabled: false }));
      if (url.includes("cursor=next123")) return Promise.resolve(res(null, status));
      return Promise.resolve(res({
        items: [post("post_A", "PRIVATE_FIRST_POST")], nextCursor: "next123",
      }));
    });
    vi.stubGlobal("fetch", fetcher);
    await mount();
    expect(host.textContent).toContain("PRIVATE_FIRST_POST");
    expect(host.querySelector('a[href="/moments/new"]')).not.toBeNull();
    await press("Ещё публикации");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(host.querySelector(".moments-catalog-grid")).toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_FIRST_POST");
    expect(host.textContent).not.toContain("PRIVATE_BACKEND_STACK");
    expect(host.textContent).not.toContain("Не удалось загрузить следующую страницу");
    expect(host.textContent).not.toContain("Публикаций пока нет");
    expect(host.querySelector('a[href="/moments/new"]')).toBeNull();
    expect(host.querySelector('a[href="/moments/drafts"]')).toBeNull();
    expect(host.querySelector('a[href="/moments/saved"]')).toBeNull();
    expect(host.querySelector('[aria-label="Сортировка публикаций"]')).toBeNull();
    expect(host.querySelector('a[href="/login"]') !== null).toBe(status === 401);
    expect([...host.querySelectorAll<HTMLButtonElement>("button")].some(button =>
      button.textContent?.includes("Повторить"))).toBe(false);
    expect(fetcher.mock.calls.filter(([url]) => url.includes("cursor=next123"))).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("MO-R04 next page 503 retains first page with explicit retry", async () => {
    const pendingRetry = later<Response>();
    let attempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith("/status")
            ? res({ enabled: true, smartEnabled: false })
            : url.includes("cursor=next123")
              ? ++attempt === 1
                ? res(null, 503)
                : pendingRetry.promise
              : res({ items: [post("post_A", "ПЕРВЫЙ_ПОСТ")], nextCursor: "next123" }),
        ),
      ),
    );
    await mount();
    await press("Ещё публикации");
    expect(host.textContent).toContain("ПЕРВЫЙ_ПОСТ");
    expect(host.textContent).toContain("Не удалось загрузить следующую страницу");
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Повторить страницу");
    await act(async () => { retry?.click(); retry?.click(); });
    await tick();
    expect(attempt).toBe(2);
    await act(async () => pendingRetry.resolve(res({
      items: [post("post_B", "ВТОРОЙ_ПОСТ")], nextCursor: null,
    })));
    await tick();
    expect(host.textContent).toContain("ПЕРВЫЙ_ПОСТ");
    expect(host.textContent).toContain("ВТОРОЙ_ПОСТ");
    expect(host.textContent?.match(/ПЕРВЫЙ_ПОСТ/g)).toHaveLength(1);
    expect(attempt).toBe(2);
  });

  it("MO-H02 malformed sort, fresh entry, A-B-A reject old state", async () => {
    window.history.replaceState(null, "", "/moments?ref=1#keep");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "A", username: "owner", role: "USER" });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/v1/feed/status")
        return res({ enabled: true, smartEnabled: false });
      if (url.startsWith("/api/v1/feed/posts/")) return res(post("p1", "Пост"));
      return res({ items: [post("p1", "Пост")], nextCursor: null });
    }));
    await act(async () => root.render(
      <QueryClientProvider client={cache}><App /></QueryClientProvider>));
    await tick();await tick();
    const setSortValue = async (value: string) => {
    await chooseSort(value);
      await tick();
    };
    const clickDetail = async () => {
      const link = host.querySelector<HTMLAnchorElement>('a[href="/moments/p1"]');
      expect(link).not.toBeNull();
      await act(async () => link?.dispatchEvent(new MouseEvent("click",
        { bubbles: true, cancelable: true, button: 0 })));
      for(let i=0;i<30 && host.querySelector('[aria-label="Сортировка публикаций"]');i++)await tick();
      expect(host.querySelector('[aria-label="Сортировка публикаций"]')).toBeNull();
    };
    const goBack = async () => {
      await act(async () => { window.history.back();
        await new Promise(r => setTimeout(r, 55)); });
      await tick();await tick();
    };
    await setSortValue("discussed");
    const saved = window.history.state.__gafusMomentsReadViewV1;
    expect(saved.view).toEqual({ sort: "discussed" });
    window.history.replaceState({ unrelated: "left", __gafusMomentsReadViewV1: {
      ...saved, view: { sort: "INVALID_SORT" },
    } }, "", window.location.href);
    await clickDetail();await goBack();
    expect(activeSort()).toBe("new");
    expect(window.history.state.unrelated).toBe("left");
    await setSortValue("popular");
    await clickDetail();
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "B", username: "other", role: "USER" }));
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "A", username: "owner", role: "USER" }));
    await goBack();
    expect(activeSort()).toBe("new");
    await clickDetail();
    await act(async () => { window.history.pushState(null, "", "/moments");
      window.dispatchEvent(new PopStateEvent("popstate")); });
    await tick();await tick();
    expect(activeSort()).toBe("new");
    expect(window.history.state).toBeNull();
    window.history.replaceState(null, "", "/");
  });

  it("MO-H03 pending old cursor cannot block restored discussed feed", async () => {
    window.history.replaceState(null, "", "/moments");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "A", username: "owner", role: "USER" });
    const oldCursor = later<Response>();
    let sortedFirst = 0;
    let differentSortFirst = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/api/v1/feed/status")
        return Promise.resolve(res({ enabled: true, smartEnabled: false }));
      if (url.startsWith("/api/v1/feed/posts/"))
        return Promise.resolve(res(post("p1", "Момент первый")));
      if (url.includes("cursor=next123")) return oldCursor.promise;
      if (url.includes("sort=discussed"))sortedFirst++;
      if (url.includes("sort=popular"))differentSortFirst++;
      return Promise.resolve(res({ items: [post("p1", "Момент первый")],
        nextCursor: "next123" }));
    }));
    await act(async () => root.render(
      <QueryClientProvider client={cache}><App /></QueryClientProvider>));
    await tick();await tick();
    await chooseSort("discussed");
    await tick();
    expect(sortedFirst).toBeGreaterThan(0);
    const more = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(b => b.textContent === "Ещё публикации")!;
    await act(async () => more.click());
    const detail = host.querySelector<HTMLAnchorElement>('a[href="/moments/p1"]')!;
    await act(async () => detail.dispatchEvent(new MouseEvent("click",
      { bubbles: true, cancelable: true, button: 0 })));
    for(let i=0;i<30 && host.querySelector('[aria-label="Сортировка публикаций"]');i++)await tick();
    expect(host.querySelector('[aria-label="Сортировка публикаций"]')).toBeNull();
    await act(async () => { window.history.back();
      await new Promise(r => setTimeout(r, 55)); });
    for(let i=0;i<30 && !host.querySelector('a[href="/moments/p1"]');i++)await tick();
    expect(activeSort())
      .toBe("discussed");
    expect(host.querySelector('a[href="/moments/p1"]')).not.toBeNull();
    await chooseSort("popular");
    await tick();
    expect(differentSortFirst).toBeGreaterThan(0);
    await act(async () => oldCursor.resolve(res({ items: [post("old", "СТАРЫЙ_КУРСОР")],
      nextCursor: null })));
    await tick();
    expect(host.textContent).not.toContain("СТАРЫЙ_КУРСОР");
    window.history.replaceState(null, "", "/");
  });

  it("MO-H01 actual App moments sort resets on detail Back baseline", async () => {
    window.history.replaceState(null, "", "/moments?ref=KEEP#bookmark");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "A", username: "person", role: "USER" });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/v1/feed/status")
        return res({ enabled: true, smartEnabled: false });
      if (url.startsWith("/api/v1/feed/posts/"))
        return res(post("p1", "Момент первый"));
      return res({ items: [post("p1", "Момент первый")], nextCursor: null });
    }));
    await act(async () => root.render(
      <QueryClientProvider client={cache}><App /></QueryClientProvider>));
    await tick();
    await tick();
    expect(host.querySelector('[aria-label="Сортировка публикаций"]')).not.toBeNull();
    await chooseSort("discussed");
    await tick();
    const detail = host.querySelector<HTMLAnchorElement>('a[href="/moments/p1"]');
    expect(detail).not.toBeNull();
    await act(async () => detail?.dispatchEvent(new MouseEvent("click",
      { bubbles: true, cancelable: true, button: 0 })));
    await tick();
    expect(window.location.pathname).toBe("/moments/p1");
    for(let tries=0;tries<30 && host.querySelector('[aria-label="Сортировка публикаций"]');tries++)
      await tick();
    expect(host.querySelector('[aria-label="Сортировка публикаций"]')).toBeNull();
    await act(async () => {
      window.history.back();
      await new Promise(r => setTimeout(r, 55));
    });
    await tick();
    await tick();
    expect(window.location.pathname).toBe("/moments");
    expect(activeSort()).toBe("discussed");
    window.history.replaceState(null, "", "/");
  });

});
