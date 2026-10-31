// @vitest-environment jsdom
import { withRejectedRefreshCookie } from "../../test/rejectedRefreshCookie";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleCatalog } from "./ArticleCatalog";

const article = (title = "Статья о собаке", hasAccess = true) => ({
  id: "article_01",
  slug: "dog-training",
  title,
  description: "Рекомендации по воспитанию",
  visibility: "PAID",
  hasAccess,
  likeCount: 5,
  authorUsername: "trainer",
  content: "PRIVATE_PAID_CONTENT",
  imageUrls: ["PRIVATE_MEDIA_URL"],
});
const envelope = (data: unknown, status = 200) =>
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
        <ArticleCatalog userId={userId} />
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

describe("article catalog access, retry and narrow screen", () => {
  it("AC-M01 hides cached entitlement while server revalidates", async () => {
    const outstanding = deferred<Response>();
    const fetcher = vi.fn().mockReturnValue(outstanding.promise);
    vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
    client.setQueryData(
      ["articles", "catalog", "owner_A"],
      [
        {
          ...article(),
          likeCount: 5,
        },
      ],
    );
    await mount();
    expect(container.textContent).toContain("Обновляем список статей");
    expect(container.textContent).not.toContain("Доступна");
    expect(container.textContent).not.toContain("PRIVATE_PAID_CONTENT");
    await act(async () => outstanding.resolve(envelope([article("Статья обновлена", false)])));
    await flush();
    expect(container.textContent).toContain("Статья обновлена");
    expect(container.textContent).toContain("По подписке");
    expect(container.textContent).not.toContain("Доступна");
    expect(JSON.stringify(client.getQueryData(["articles", "catalog", "owner_A"]))).not.toContain(
      "PRIVATE_PAID_CONTENT",
    );
  });

  it("keeps the page heading outside the article grid section, as in Next", async () => {
    vi.stubGlobal("fetch", withRejectedRefreshCookie(vi.fn().mockResolvedValue(envelope([article()]))));
    await mount();
    const heading = container.querySelector("h1.next-articles-heading");
    const catalog = container.querySelector("section.next-articles-index");
    expect(heading?.textContent).toBe("Статьи");
    expect(heading?.nextElementSibling).toBe(catalog);
    expect(catalog?.querySelector("h1")).toBeNull();
    expect(catalog?.querySelectorAll(".article-catalog-card")).toHaveLength(1);
  });
  it("renders the Core-published teaser as a 16:9 image card with one click-through link", async () => {
    const first = "uploads/trainers/trainer1/articles/article1/teaser.webp";
    const fetcher = vi.fn().mockResolvedValue(envelope([{
      ...article(), logoImg: "", imageUrls: [first,
        "uploads/trainers/trainer1/articles/article1/paid-gallery.webp"],
    }]));
    vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
    await mount();
    const cover = container.querySelector<HTMLImageElement>(".article-catalog-card img");
    expect(cover?.getAttribute("src")).toBe(
      "https://storage.yandexcloud.net/gafus-media/" + first);
    expect(cover?.getAttribute("alt")).toContain("Статья о собаке");
    expect(cover?.closest('a[href="/articles/dog-training"]')).not.toBeNull();
    expect(cover?.classList.contains("article-catalog-cover-image")).toBe(true);
    expect(cover?.parentElement?.classList.contains("article-catalog-cover")).toBe(true);
    expect(container.querySelectorAll(".article-catalog-card img")).toHaveLength(1);
    // Next ArticlesClient reuses PrimaryButtonLink, never a separately copied
    // olive class on the read link.
    expect(container.querySelector('a[href="/articles/dog-training"][data-gafus-shared-button="primary"]'))
      .not.toBeNull();
    expect(container.innerHTML).not.toContain("paid-gallery");
    expect(container.querySelectorAll(".article-catalog-card .articleLogoPlaceholder")).toHaveLength(0);
  });
  it("AC-M02 HTTP401 offers login, not a futile retry or server payload", async () => {
    const fetcher = vi.fn().mockResolvedValue(envelope(null, 401));
    vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
    await mount();
    expect(container.textContent).toContain("Сессия завершена");
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Повторить");
    expect(container.textContent).not.toContain("PRIVATE_SERVER_STACK");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("AC-M03 HTTP503 manual retry recovers without stale cards", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(envelope(null, 503))
      .mockResolvedValueOnce(envelope([article("Восстановлено", false)]));
    vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
    await mount();
    expect(container.textContent).toContain("Не удалось загрузить статьи");
    expect(container.textContent).not.toContain("Статей пока нет");
    const retry = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Повторить",
    );
    expect(retry).toBeDefined();
    await act(async () => retry?.click());
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll(".article-catalog-card")).toHaveLength(1);
    expect(container.textContent).toContain("Восстановлено");
    expect(container.textContent).not.toContain("PRIVATE_SERVER_STACK");
  });

  it("AC-M04 user change isolates old owner's cached catalog", async () => {
    const next = deferred<Response>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(envelope([article("Для пользователя A")]))
      .mockReturnValueOnce(next.promise);
    vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
    await mount("owner_A");
    expect(container.textContent).toContain("Для пользователя A");
    await mount("owner_B");
    expect(container.textContent).not.toContain("Для пользователя A");
    expect(container.textContent).toContain("Загружаем статьи");
    await act(async () => next.resolve(envelope([article("Для пользователя B", false)])));
    await flush();
    expect(container.textContent).toContain("Для пользователя B");
    expect(container.textContent).not.toContain("Для пользователя A");
  });

  it("AC-M05 an erroneous revalidation cannot republish stale entitlement", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", withRejectedRefreshCookie(vi.fn().mockReturnValue(pending.promise)));
    const cached = article("Старая платная статья", true);
    client.setQueryData(
      ["articles", "catalog", "owner_A"],
      [
        {
          id: cached.id,
          slug: cached.slug,
          title: cached.title,
          description: cached.description,
          visibility: cached.visibility,
          hasAccess: cached.hasAccess,
          likeCount: cached.likeCount,
          authorUsername: cached.authorUsername,
        },
      ],
    );
    await mount();
    expect(container.querySelectorAll(".article-catalog-card")).toHaveLength(0);
    await act(async () => pending.resolve(envelope(null, 503)));
    await flush();
    expect(container.textContent).toContain("Не удалось загрузить статьи");
    expect(container.textContent).not.toContain("Старая платная статья");
    expect(container.textContent).not.toContain("Доступна");
  });

  it("AC-M06 HTTP403 denies the catalog without retry or private error body", async () => {
    vi.stubGlobal("fetch", withRejectedRefreshCookie(vi.fn().mockResolvedValue(envelope(null, 403))));
    await mount();
    expect(container.textContent).toContain("Нет доступа к разделу статей");
    expect(container.querySelector(".article-catalog-card")).toBeNull();
    expect(container.textContent).not.toContain("Повторить");
    expect(container.textContent).not.toContain("PRIVATE_SERVER_STACK");
  });

  it("AC-M07 releases the per-user catalog cache on screen unmount", async () => {
    vi.stubGlobal("fetch", withRejectedRefreshCookie(vi.fn().mockResolvedValue(envelope([article()]))));
    await mount();
    const key = ["articles", "catalog", "owner_A"];
    expect(client.getQueryData(key)).toBeDefined();
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <div aria-label="Другая страница" />
        </QueryClientProvider>,
      ),
    );
    await flush();
    expect(client.getQueryData(key)).toBeUndefined();
  });
});
