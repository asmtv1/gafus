// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArticleCatalog, formatArticleViews } from "./ArticleCatalog";

afterEach(() => vi.unstubAllGlobals());

async function show(response: Response) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(createElement(
    QueryClientProvider, { client: cache },
    createElement(ArticleCatalog, { userId: "u1" }),
  )));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  return {
    container, cache, cleanup: async () => {
      await act(async () => root.unmount());
      cache.clear(); container.remove();
    },
  };
}

describe("WEB3 original Next ArticlesClient counter inflection", () => {
  it.each([
    [0, "0 просмотров"], [1, "1 просмотр"], [2, "2 просмотра"],
    [3, "3 просмотра"], [4, "4 просмотра"], [5, "5 просмотров"],
    [11, "11 просмотров"], [14, "14 просмотров"],
    [21, "21 просмотр"], [22, "22 просмотра"], [111, "111 просмотров"],
  ])("renders %d exactly as Next", (count, copy) => {
    expect(formatArticleViews(count)).toBe(copy);
  });
});
describe("articles list UI", () => {
  it("renders paywall status without injecting locked article content", async () => {
    const result = await show(new Response(JSON.stringify({
      success: true,
      data: [{
        id: "article-1", slug: "one", title: "Вопросы",
        description: "Описание", visibility: "PAID",
        hasAccess: false, likeCount: 4, viewCount: 1, authorUsername: "trainer",
        content: "PRIVATE_BODY", imageUrls: ["private.jpg"],
      }],
    }), { status: 200 }));
    try {
      expect(result.container.textContent).toContain("Вопросы");
      expect(result.container.textContent).toContain("По подписке");
      expect(result.container.textContent).toContain("1 просмотр");
      expect(result.container.querySelector('.article-catalog-card svg[class*="viewsIcon"]'))
        .not.toBeNull();
      expect(result.container.textContent).not.toContain("PRIVATE_BODY");
      expect(JSON.stringify(result.cache.getQueryData(["articles", "catalog", "u1"])))
        .not.toContain("private.jpg");
    } finally { await result.cleanup(); }
  });

  it("offers an error and retry instead of phantom empty articles", async () => {
    const result = await show(new Response(JSON.stringify({
      success: false, error: "unavailable",
    }), { status: 500 }));
    try {
      expect(result.container.querySelector('[role="alert"]')).toBeTruthy();
      expect(result.container.textContent).not.toContain("Статей пока нет");
    } finally { await result.cleanup(); }
  });
});
