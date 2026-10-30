// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleDetails } from "./ArticleDetails";

const makeArticle = (hasAccess: boolean, content: string | null) => ({
  id: "article_01",
  slug: "dog-training",
  title: "Послушание",
  authorUsername: "trainer",
  description: "Доступ по подписке",
  visibility: "PAID",
  likeCount: 2,
  hasAccess,
  contentType: "HTML",
  content,
});
const cacheKey = (owner: string) => ["articles", "detail", owner, "dog-training"];
const response = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify({
      success: status === 200,
      data,
      ...(status === 200 ? {} : { error: "PRIVATE_SERVER_STACK" }),
    }),
    { status },
  );
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
async function mount(userId = "owner_A") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <ArticleDetails userId={userId} slug="dog-training" />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 22));
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
});

describe("article detail fresh access before private content publication", () => {
  it("AD-R01 hides previously entitled HTML while rechecking access", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    client.setQueryData(cacheKey("owner_A"), makeArticle(true, "<p>STALE_PRIVATE_ARTICLE</p>"));
    await mount();
    expect(container.textContent).toContain("Проверяем доступ к статье");
    expect(container.innerHTML).not.toContain("STALE_PRIVATE_ARTICLE");
    await act(async () => pending.resolve(response(makeArticle(false, null))));
    await flush();
    expect(container.textContent).toContain("нужна действующая подписка");
    expect(container.innerHTML).not.toContain("STALE_PRIVATE_ARTICLE");
  });

  it("AD-R02 cached private HTML never survives server 404", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    client.setQueryData(cacheKey("owner_A"), makeArticle(true, "<p>SECRET_OLD_ACCESS</p>"));
    await mount();
    expect(container.innerHTML).not.toContain("SECRET_OLD_ACCESS");
    await act(async () => pending.resolve(response(null, 404)));
    await flush();
    expect(container.textContent).toContain("Статья не найдена");
    expect(container.innerHTML).not.toContain("SECRET_OLD_ACCESS");
    expect(container.textContent).not.toContain("PRIVATE_SERVER_STACK");
  });

  it("AD-R03 changing owner fences old HTML while new GET is in flight", async () => {
    const pending = deferred<Response>();
    let privateGetCount = 0;
    const fetcher = vi.fn((path: string, options: RequestInit) => {
      if (options?.method === "POST" && path.endsWith("/view"))
        return Promise.resolve(response(null));
      if (options?.method === "GET") {
        privateGetCount++;
        return privateGetCount === 1
          ? Promise.resolve(response(makeArticle(true, "<p>PRIVATE_A</p>")))
          : pending.promise;
      }
      throw Error("UNAPPROVED_ARTICLE_REQUEST");
    });
    vi.stubGlobal("fetch", fetcher);
    await mount("owner_A");
    expect(container.textContent).toContain("PRIVATE_A");
    await mount("owner_B");
    expect(container.innerHTML).not.toContain("PRIVATE_A");
    expect(container.textContent).toContain("Загружаем статью");
    await act(async () => pending.resolve(response(makeArticle(false, null))));
    await flush();
    expect(container.textContent).toContain("нужна действующая подписка");
    expect(container.innerHTML).not.toContain("PRIVATE_A");
  });

  it("AD-R04 HTTP401 provides login and no automatic retry", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(null, 401));
    vi.stubGlobal("fetch", fetcher);
    await mount();
    expect(container.textContent).toContain("Сессия завершена");
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Повторить");
    expect(container.textContent).not.toContain("PRIVATE_SERVER_STACK");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("AD-R05 retry remains for HTTP503 and recovers with permitted text", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(null, 503))
      .mockResolvedValueOnce(response(makeArticle(true, "<p>Новое содержимое</p>")));
    vi.stubGlobal("fetch", fetcher);
    await mount();
    const retry = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Повторить",
    );
    expect(retry).toBeDefined();
    await act(async () => retry?.click());
    await flush();
    expect(container.textContent).toContain("Новое содержимое");
    // The registered view POST follows the second, now successful detail GET.
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.filter(([path, opts]) =>
      String(path).endsWith("/view") && opts?.method === "POST")).toHaveLength(1);
  });
});
