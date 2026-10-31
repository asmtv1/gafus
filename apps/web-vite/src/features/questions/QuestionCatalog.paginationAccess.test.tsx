// @vitest-environment jsdom
import { withRejectedRefreshCookie } from "../../test/rejectedRefreshCookie";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionCatalog } from "./QuestionCatalog";
import { App } from "../../App";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
const q = (id: string, title: string) => ({
  id,
  title,
  body: "Обучение собаки",
  category: "Поведение",
  status: "waiting",
  answerCount: 0,
  createdAt: "2026-10-18T12:00:00Z",
  author: { id: "PRIVATE_AUTHOR_ID", name: "Автор", avatarUrl: null },
});
const page = (items: unknown[], nextPage: number | null = null, canPublish = true) => ({
  items,
  nextPage,
  canPublish,
  blockReason: null,
});
const response = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify({
      success: status === 200,
      data,
      ...(status === 200 ? {} : { error: "PRIVATE_SERVER_ERROR" }),
    }),
    { status },
  );
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
let root: Root, host: HTMLDivElement, cache: QueryClient;
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 25));
  });
}
async function mount(userId = "owner_A") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <QuestionCatalog userId={userId} />
      </QueryClientProvider>,
    ),
  );
  await settle();
}
async function press(text: string) {
  const node = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === text,
  );
  expect(node).toBeDefined();
  await act(async () => node?.click());
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
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("questions catalog owner/pagination source parity", () => {
  it("Q-C01 stale cached canPublish and card hidden while fresh GET pending", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", withRejectedRefreshCookie(vi.fn().mockReturnValue(pending.promise)));
    cache.setQueryData(["questions", "catalog", "owner_A", "new", false], {
      pages: [page([q("old-1", "ПРЕЖНИЙ ПРИВАТНЫЙ ВОПРОС")])],
      pageParams: [1],
    });
    await mount();
    expect(host.textContent).toContain("Загружаем вопросы");
    expect(host.textContent).not.toContain("ПРЕЖНИЙ ПРИВАТНЫЙ ВОПРОС");
    expect(host.querySelector('a[href="/questions/new"]')).toBeNull();
    await act(async () =>
      pending.resolve(response(page([q("new-1", "Новый вопрос")], null, false))),
    );
    await settle();
    expect(host.textContent).toContain("Новый вопрос");
    expect(host.querySelector('a[href="/questions/new"]')).toBeNull();
  });
  it("Q-C02 401 closes cached catalog and offers login, without retry", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", withRejectedRefreshCookie(vi.fn().mockReturnValue(pending.promise)));
    cache.setQueryData(["questions", "catalog", "owner_A", "new", false], {
      pages: [page([q("old-1", "Закрытый вопрос")])],
      pageParams: [1],
    });
    await mount();
    await act(async () => pending.resolve(response(null, 401)));
    await settle();
    expect(host.querySelector(".compact-card")).toBeNull();
    expect(host.textContent).toContain("Сессия завершена");
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_SERVER_ERROR");
    expect(host.textContent).not.toContain("Повторить");
  });
  it.each([
    [401, "Сессия завершена. Войдите снова."],
    [403, "Нет доступа к вопросам."],
    [404, "Раздел вопросов недоступен."],
  ])("Q-C08 page2 HTTP%s hides cards and publish actions", async (status, message) => {
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") throw Error("READ test must not POST");
      if (url.includes("page=2")) return Promise.resolve(response(null, status));
      return Promise.resolve(response(page([q("q-1", "PRIVATE_QUESTION_TITLE")], 2)));
    });
    vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
    await mount();
    expect(host.textContent).toContain("PRIVATE_QUESTION_TITLE");
    expect(host.querySelector('a[href="/questions/new"]')).not.toBeNull();
    await press("Ещё вопросы");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(host.querySelector(".question-catalog-card")).toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_QUESTION_TITLE");
    expect(host.textContent).not.toContain("PRIVATE_AUTHOR_ID");
    expect(host.textContent).not.toContain("PRIVATE_SERVER_ERROR");
    expect(host.textContent).not.toContain("Не удалось загрузить следующую страницу");
    expect(host.textContent).not.toContain("Вопросов пока нет");
    expect(host.querySelector('a[href="/questions/new"]')).toBeNull();
    expect(host.querySelector('a[href="/login"]') !== null).toBe(status === 401);
    expect([...host.querySelectorAll<HTMLButtonElement>("button")].some(button =>
      button.textContent?.includes("Повторить"))).toBe(false);
    expect(fetcher.mock.calls.map(([url]) => url.includes("page=2")))
      .toEqual([false, true]);
  });
  it("Q-C03 second-page 503 preserves verified first cards and GET-only retry", async () => {
    const pendingRetry = deferred<Response>();
    let second = 0;
    const fetcher = vi.fn((url: string) => {
      if (url.includes("page=2")) {
        second++;
        return second === 1 ? Promise.resolve(response(null, 503)) : pendingRetry.promise;
      }
      return Promise.resolve(response(page([q("q-1", "Первый вопрос")], 2)));
    });
    vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
    await mount();
    await press("Ещё вопросы");
    expect(host.textContent).toContain("Первый вопрос");
    expect(host.textContent).toContain("Не удалось загрузить следующую страницу");
    expect(host.textContent).not.toContain("PRIVATE_SERVER_ERROR");
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Повторить страницу");
    await act(async () => { retry?.click(); retry?.click(); });
    await settle();
    expect(second).toBe(2);
    expect(host.querySelector<HTMLButtonElement>("button:disabled")?.disabled).toBe(true);
    await act(async () => pendingRetry.resolve(response(page([q("q-2", "Второй вопрос")]))));
    await settle();
    expect(host.textContent).toContain("Второй вопрос");
    expect(host.querySelectorAll(".question-catalog-card .next-question-preview")).toHaveLength(2);
    expect(host.textContent?.match(/Первый вопрос/g)).toHaveLength(1);
    expect(fetcher.mock.calls.map(([url]) => url.includes("page=2")))
      .toEqual([false, true, true]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("Q-C05 double click does not cancel/restart deferred second page", async () => {
    const next = deferred<Response>();
    let pageTwoCalls = 0;
    const fetcher = vi.fn((url: string) => {
      if (url.includes("page=2")) {
        pageTwoCalls++;
        return next.promise;
      }
      return Promise.resolve(response(page([q("q1", "Первый")], 2)));
    });
    vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
    await mount();
    const more = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Ещё вопросы");
    expect(more).toBeDefined();
    await act(async () => { more?.click(); more?.click(); });
    await settle();
    const loading = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Загрузка…");
    expect(loading?.disabled).toBe(true);
    expect(host.textContent).toContain("Первый");
    const beforeResolution = pageTwoCalls;
    await act(async () => next.resolve(response(page([q("q2", "Второй")]))));
    await settle();
    expect(beforeResolution).toBe(1);
    expect(host.textContent).toContain("Второй");
  });
  it("Q-C06 filter change has independent page flight; old completion stays isolated", async () => {
    const old = deferred<Response>();
    const active = deferred<Response>();
    let oldCalls = 0;
    let activeCalls = 0;
    vi.stubGlobal("fetch", withRejectedRefreshCookie(vi.fn((url: string) => {
      if (url.includes("page=2") && url.includes("category=")) {
        activeCalls++;
        return active.promise;
      }
      if (url.includes("page=2")) {
        oldCalls++;
        return old.promise;
      }
      return Promise.resolve(response(url.includes("category=")
        ? page([q("cat1", "Категория: первая")], 2)
        : page([q("old1", "Все: первая")], 2)));
    })));
    await mount();
    const first = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Ещё вопросы");
    await act(async () => first?.click());
    const category = host.querySelector<HTMLSelectElement>("#question-category")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
        .set!.call(category, "Поведение");
      category.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(host.textContent).toContain("Категория: первая");
    const next = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Ещё вопросы");
    await act(async () => next?.click());
    await settle();
    expect(activeCalls).toBe(1);
    await act(async () => old.resolve(response(page([q("old2", "СТАРЫЙ_ОТВЕТ")]))));
    await settle();
    expect(host.textContent).not.toContain("СТАРЫЙ_ОТВЕТ");
    await act(async () => active.resolve(response(page([q("cat2", "Категория: вторая")]))));
    await settle();
    expect(host.textContent).toContain("Категория: вторая");
    expect(activeCalls).toBe(1);
    expect(oldCalls).toBe(1);
  });
  it("Q-C07 principal change lets new user paginate while old page remains pending", async () => {
    const old = deferred<Response>();
    const ownerB = deferred<Response>();
    let firstPages = 0;
    let pageTwo = 0;
    vi.stubGlobal("fetch", withRejectedRefreshCookie(vi.fn((url: string) => {
      if (url.includes("page=2")) {
        pageTwo++;
        return pageTwo === 1 ? old.promise : ownerB.promise;
      }
      firstPages++;
      return Promise.resolve(response(firstPages === 1
        ? page([q("a1", "Вопрос A")], 2)
        : page([q("b1", "Вопрос B")], 2)));
    })));
    await mount("owner_A");
    const moreA = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Ещё вопросы");
    await act(async () => moreA?.click());
    await mount("owner_B");
    expect(host.textContent).toContain("Вопрос B");
    const moreB = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Ещё вопросы");
    await act(async () => moreB?.click());
    await settle();
    expect(pageTwo).toBe(2);
    await act(async () => old.resolve(response(page([q("a2", "СЕКРЕТ_А")]))));
    await settle();
    expect(host.textContent).not.toContain("СЕКРЕТ_А");
    await act(async () => ownerB.resolve(response(page([q("b2", "Вопрос B второй")]))));
    await settle();
    expect(host.textContent).toContain("Вопрос B второй");
    expect(host.textContent).not.toContain("СЕКРЕТ_А");
  });
  it("Q-C04 late previous principal GET cannot publish into new user's catalog", async () => {
    const a = deferred<Response>();
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(a.promise)
      .mockImplementationOnce(() =>
        Promise.resolve(response(page([q("b-1", "Вопрос B")], null, false))),
      );
    vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
    await mount("owner_A");
    await mount("owner_B");
    expect(host.textContent).toContain("Вопрос B");
    await act(async () => a.resolve(response(page([q("a-1", "СЕКРЕТ A")]))));
    await settle();
    expect(host.textContent).not.toContain("СЕКРЕТ A");
    expect(host.textContent).toContain("Вопрос B");
  });

  it("Q-H02 malformed entry, new route and A-B-A never restore old filters", async () => {
    window.history.replaceState(null, "", "/questions?keep=1#bookmark");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "owner_A", username: "user", role: "USER" });
    vi.stubGlobal("fetch", withRejectedRefreshCookie(vi.fn(async (url: string) =>
      url.startsWith("/api/v1/questions/") ? response({ ...q("q1", "Вопрос"),
        closed: false, canReply: false, canManage: false, canEdit: false,
        blockReason: null, photos: [], tags: [], answers: [], nextAnswerPage: null })
        : response(page([q("q1", "Вопрос")])))));
    await act(async () => root.render(
      <QueryClientProvider client={cache}><App /></QueryClientProvider>));
    await settle();
    const kind = host.querySelector<HTMLSelectElement>("#question-category")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
        .set!.call(kind, "Поведение");
      kind.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const saved = window.history.state.__gafusQuestionsReadViewV1;
    expect(saved.view.category).toBe("Поведение");
    expect(JSON.stringify(saved)).not.toMatch(/cursor|items|canPublish|password|token/);
    const clickDetail = async () => {
      // A filter triggers fresh owner GET; do not click cached/unverified cards.
      for(let i=0;i<40 && !host.querySelector('a[href="/questions/q1"]');i++)
        await settle();
      const link = host.querySelector<HTMLAnchorElement>('a[href="/questions/q1"]');
      expect(link).not.toBeNull();
      await act(async () => link?.dispatchEvent(new MouseEvent("click",
        { bubbles: true, cancelable: true, button: 0 })));
      for(let i=0;i<30 && host.querySelector("#question-category");i++)await settle();
      expect(host.querySelector("#question-category")).toBeNull();
    };
    const goBack = async () => {
      await act(async () => { window.history.back();
        await new Promise(r => setTimeout(r, 55)); });
      await settle();
    };
    window.history.replaceState({ unrelated: "kept", __gafusQuestionsReadViewV1: {
      ...saved, view: { ...saved.view, category: { invalid: true } },
    } }, "", window.location.href);
    await clickDetail();await goBack();
    expect(host.querySelector<HTMLSelectElement>("#question-category")?.value).toBe("");
    expect(window.history.state.unrelated).toBe("kept");
    const mine = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(b => b.getAttribute("aria-label") === "Мои вопросы")!;
    await act(async () => mine.click());
    expect(window.history.state.__gafusQuestionsReadViewV1.view.mine).toBe(true);
    await clickDetail();
    await act(async () => {
      cache.setQueryData(CURRENT_USER_QUERY_KEY,
        { id: "owner_B", username: "other", role: "USER" });
    });
    await act(async () => {
      cache.setQueryData(CURRENT_USER_QUERY_KEY,
        { id: "owner_A", username: "user", role: "USER" });
    });
    await goBack();
    expect(host.querySelector<HTMLButtonElement>(
      'button[aria-label="Мои вопросы"][aria-pressed="true"]')).toBeNull();
    expect(window.history.state.unrelated).toBe("kept");
    // A fresh pushState entry contains no view namespace and starts default.
    await clickDetail();
    await act(async () => { window.history.pushState(null, "", "/questions");
      window.dispatchEvent(new PopStateEvent("popstate")); });
    await settle();
    expect(window.history.state).toBeNull();
    expect(host.querySelector<HTMLSelectElement>("#question-category")?.value).toBe("");
    expect(window.location.search).toBe("");
    window.history.replaceState(null, "", "/");
  });

  it("Q-H03 pending old next page cannot block restored filtered first page", async () => {
    window.history.replaceState(null, "", "/questions");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "owner_A", username: "owner", role: "USER" });
    const oldPage = deferred<Response>();
    let filteredFirstPages = 0;
    let freshDifferentSort = 0;
    vi.stubGlobal("fetch", withRejectedRefreshCookie(vi.fn((url: string) => {
      if (url.startsWith("/api/v1/questions/"))
        return Promise.resolve(response({ ...q("q1", "Вопрос"),
          closed: false, canReply: false, canManage: false, canEdit: false,
          blockReason: null, photos: [], tags: [], answers: [], nextAnswerPage: null }));
      if (url.includes("page=2")) return oldPage.promise;
      if (url.includes("sort=active"))filteredFirstPages++;
      if (url.includes("sort=unanswered"))freshDifferentSort++;
      return Promise.resolve(response(page([q("q1", "Вопрос")], 2)));
    })));
    await act(async () => root.render(
      <QueryClientProvider client={cache}><App /></QueryClientProvider>));
    await settle();
    const sort = host.querySelector<HTMLSelectElement>("#question-sort")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
        .set!.call(sort, "active");
      sort.dispatchEvent(new Event("change", { bubbles: true }));
    });
    for(let i=0;i<30 && !host.querySelector('a[href="/questions/q1"]');i++)
      await settle();
    expect(filteredFirstPages).toBeGreaterThan(0);
    const more = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(b => b.textContent === "Ещё вопросы")!;
    await act(async () => more.click());
    const detail = host.querySelector<HTMLAnchorElement>('a[href="/questions/q1"]')!;
    await act(async () => detail.dispatchEvent(new MouseEvent("click",
      { bubbles: true, cancelable: true, button: 0 })));
    for(let i=0;i<30 && host.querySelector("#question-sort");i++)await settle();
    expect(host.querySelector("#question-sort")).toBeNull();
    await act(async () => { window.history.back();
      await new Promise(r => setTimeout(r, 55)); });
    for(let i=0;i<30 && !host.querySelector('a[href="/questions/q1"]');i++)
      await settle();
    expect(host.querySelector<HTMLSelectElement>("#question-sort")?.value).toBe("active");
    expect(host.querySelector('a[href="/questions/q1"]')).not.toBeNull();
    const refreshedSort = host.querySelector<HTMLSelectElement>("#question-sort")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
        .set!.call(refreshedSort, "unanswered");
      refreshedSort.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(freshDifferentSort).toBeGreaterThan(0);
    await act(async () => oldPage.resolve(response(page([q("old", "СТАРЫЙ_КУРСОР")]))));
    await settle();
    expect(host.textContent).not.toContain("СТАРЫЙ_КУРСОР");
    window.history.replaceState(null, "", "/");
  });

  it("Q-H04 Questions and Moments keep independent read history Back/Forward", async () => {
    window.history.replaceState(null, "", "/questions?private=KEEP#bookmark");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "owner_A", username: "owner", role: "USER" });
    const post = {
      id: "p1", text: "Момент", status: "published",
      createdAt: "2026-10-18T00:00:00Z", publishedAt: "2026-10-18T00:00:00Z",
      commentCount: 0, viewCount: 0, myReaction: null, bookmarked: false,
      hasPoll: false, canEdit: false, reactions: [], attachments: [],
      author: { id: "writer", username: "writer", name: "Автор", role: "USER" },
    };
    vi.stubGlobal("fetch", withRejectedRefreshCookie(vi.fn(async (url: string) => {
      if (url === "/api/v1/feed/status")
        return response({ enabled: true, smartEnabled: false });
      if (url.startsWith("/api/v1/feed/posts"))
        return response({ items: [post], nextCursor: null });
      return response(page([q("q1", "Вопрос")]));
    })));
    await act(async () => root.render(
      <QueryClientProvider client={cache}><App /></QueryClientProvider>));
    // The App lazy-imported Questions route is not guaranteed to transform in
    // one 25ms tick on cold/contended CI. Wait until its actual selector mounts.
    for (let attempt = 0; attempt < 100 &&
      !host.querySelector("#question-sort"); attempt++) await settle();
    const choose = async (id: string, value: string) => {
      const select = host.querySelector<HTMLSelectElement>(`#${id}`)!;
      expect(select).not.toBeNull();
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
          .set!.call(select, value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    await choose("question-sort", "active");
    expect(window.history.state.__gafusQuestionsReadViewV1.view.sort).toBe("active");
    expect(window.history.state.__gafusMomentsReadViewV1).toBeUndefined();
    const toMoments = host.querySelector<HTMLAnchorElement>('a[href="/moments"]');
    expect(toMoments).not.toBeNull();
    await act(async () => toMoments?.dispatchEvent(new MouseEvent("click",
      { bubbles: true, cancelable: true, button: 0 })));
    for(let i=0;i<30 && !host.querySelector("#moments-sort");i++)await settle();
    // The SPA router now stamps a navigation marker on the fresh history
    // entry; neither feature may leak the other's read-view namespace.
    expect(window.history.state?.__gafusQuestionsReadViewV1).toBeUndefined();
    expect(window.history.state?.__gafusMomentsReadViewV1).toBeUndefined();
    // The redesigned Moments toolbar uses accessible segment buttons, not
    // the obsolete <select id="moments-sort">. Keep full history assertions.
    const popular=host.querySelector<HTMLButtonElement>(
      'button[data-feed-sort="popular"]');
    expect(popular).not.toBeNull();
    await act(async () => popular?.click());
    expect(popular?.getAttribute("aria-pressed")).toBe("true");
    expect(window.history.state.__gafusMomentsReadViewV1.view).toEqual({ sort: "popular" });
    expect(window.history.state.__gafusQuestionsReadViewV1).toBeUndefined();
    await act(async () => { window.history.back();
      await new Promise(r => setTimeout(r, 55)); });
    for(let i=0;i<30 && !host.querySelector("#question-sort");i++)await settle();
    expect(window.location.pathname).toBe("/questions");
    expect(window.location.search+window.location.hash).toBe("?private=KEEP#bookmark");
    expect(host.querySelector<HTMLSelectElement>("#question-sort")?.value).toBe("active");
    expect(window.history.state.__gafusMomentsReadViewV1).toBeUndefined();
    await act(async () => { window.history.forward();
      await new Promise(r => setTimeout(r, 55)); });
    for(let i=0;i<30 && !host.querySelector("#moments-sort");i++)await settle();
    expect(window.location.pathname).toBe("/moments");
    expect(host.querySelector<HTMLButtonElement>(
      'button[data-feed-sort="popular"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(window.history.state.__gafusQuestionsReadViewV1).toBeUndefined();
    window.history.replaceState(null, "", "/");
  });

  it("Q-H01 actual App question filters reset on detail Back baseline", async () => {
    window.history.replaceState(null, "", "/questions?ref=KEEP#anchor");
    cache.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "owner_A", username: "owner", role: "USER" });
    vi.stubGlobal("fetch", withRejectedRefreshCookie(vi.fn(async (url: string) =>
      url.startsWith("/api/v1/questions/")
        ? response({ ...q("q1", "Поводок и занятия"),
            closed: false, canReply: false, canManage: false, canEdit: false,
            blockReason: null, photos: [], tags: [], answers: [], nextAnswerPage: null })
        : response(page([q("q1", "Поводок и занятия")])))));
    await act(async () => root.render(
      <QueryClientProvider client={cache}><App /></QueryClientProvider>));
    await settle();
    const change = async (id: string, value: string) => {
      const input = host.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
      expect(input).not.toBeNull();
      await act(async () => {
        const p = input instanceof HTMLInputElement
          ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
        Object.getOwnPropertyDescriptor(p, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    await change("question-search", "Поводок");
    await change("question-category", "Поведение");
    await change("question-status", "waiting");
    await change("question-sort", "active");
    const mine = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(b => b.getAttribute("aria-label") === "Мои вопросы")!;
    await act(async () => mine.click());
    await settle();
    await act(async () => { await new Promise(r => setTimeout(r, 350)); });
    await settle();
    const link = host.querySelector<HTMLAnchorElement>('a[href="/questions/q1"]');
    expect(link).not.toBeNull();
    await act(async () => link?.dispatchEvent(new MouseEvent("click",
      { bubbles: true, cancelable: true, button: 0 })));
    await settle();
    expect(window.location.pathname).toBe("/questions/q1");
    for(let tries=0;tries<30 && host.querySelector("#question-search");tries++)
      await settle();
    expect(host.querySelector("#question-search")).toBeNull();
    await act(async () => {
      window.history.back();
      await new Promise(r => setTimeout(r, 55));
    });
    await settle();
    expect(window.location.pathname).toBe("/questions");
    expect(host.querySelector<HTMLInputElement>("#question-search")?.value).toBe("Поводок");
    expect(host.querySelector<HTMLSelectElement>("#question-category")?.value).toBe("Поведение");
    expect(host.querySelector<HTMLSelectElement>("#question-status")?.value).toBe("waiting");
    expect(host.querySelector<HTMLSelectElement>("#question-sort")?.value).toBe("active");
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Мои вопросы"][aria-pressed="true"]')
      ?.textContent).toBe("Мои");
    window.history.replaceState(null, "", "/");
  });

});
