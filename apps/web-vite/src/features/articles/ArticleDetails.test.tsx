// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArticleDetails } from "./ArticleDetails";
import { getMyArticle } from "./articleApi";
import { articlePath, articleSlugFromPath, routeForPath } from "../../shared/router/location";

afterEach(() => vi.unstubAllGlobals());

const article = {
  id: "a1", slug: "obedience",
  title: "Обучение", description: "Курс по поведению",
  visibility: "PAID", hasAccess: false, likeCount: 2,
  authorUsername: "trainer", contentType: "HTML",
  content: null, videoUrl: "sensitive.mp4", imageUrls: ["secret.jpg"],
  authorId: "secret-author",
};

async function renderArticle(data: unknown, status = 200) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    success: status === 200, data, error: "Article not found",
  }), { status })));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(createElement(
    QueryClientProvider, { client: cache },
    createElement(ArticleDetails, { userId: "user-1", slug: "obedience" }),
  )));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  let mounted = true;
  async function unmount() {
    if (!mounted) return;
    mounted = false;
    await act(async () => root.unmount());
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return {
    container, cache, unmount,
    async cleanup() {
      await unmount();
      cache.clear();
      container.remove();
    },
  };
}

describe("article detail with server-owned entitlement", () => {
  it("accepts safe Cyrillic article slugs with URL encoding", () => {
    const route = articlePath("собаки");
    expect(route).toContain("/articles/");
    expect(articleSlugFromPath(route)).toBe("собаки");
    expect(routeForPath(route)).toBe(route);
    expect(articleSlugFromPath("/articles/%GG")).toBeNull();
    expect(() => articlePath("../users")).toThrow("Invalid article slug");
    expect(routeForPath("/articles/%2Fadmin")).toBeNull();
  });

  it("never renders locked media or content and strips it from query cache", async () => {
    const result = await renderArticle(article);
    try {
      expect(result.container.textContent).toContain("Нужна действующая подписка".replace("Нужна", "нужна"));
      expect(result.container.textContent).toContain("Курс по поведению");
      expect(result.container.innerHTML).not.toContain("sensitive.mp4");
      expect(JSON.stringify(result.cache.getQueryData([
        "articles", "detail", "user-1", "obedience",
      ]))).not.toContain("secret-author");
      // Original Next has only the global header Back action on loaded detail,
      // not a second inline "К статьям" link inside article content.
      expect(result.container.querySelector('a[href="/articles"]')).toBeNull();
    } finally { await result.cleanup(); }
  });

  it("renders sanitized server HTML only for entitled content", async () => {
    const result = await renderArticle({
      ...article, hasAccess: true,
      content: "<h3>Слушай команду</h3><p><strong>Рядом</strong></p>",
    });
    try {
      expect(result.container.querySelector(".article-body h3")?.textContent)
        .toBe("Слушай команду");
      expect(result.container.textContent).not.toContain("нужна действующая подписка");
      expect(result.container.querySelector(".article-body strong")?.textContent).toBe("Рядом");
    } finally { await result.cleanup(); }
  });

  it("removes entitled HTML from Query cache on screen unmount", async () => {
    const result = await renderArticle({
      ...article, hasAccess: true, content: "<h3>Private lesson</h3>",
    });
    try {
      expect(result.cache.getQueryData(["articles", "detail", "user-1", "obedience"]))
        .toBeDefined();
      await result.unmount();
      expect(result.cache.getQueryData(["articles", "detail", "user-1", "obedience"]))
        .toBeUndefined();
    } finally { await result.cleanup(); }
  });

  it("does not render article content when the backend returns a conflict", async () => {
    const result = await renderArticle({
      ...article, hasAccess: false, content: "<p>SECRET</p>",
    });
    try {
      expect(result.container.querySelector('[role="alert"]')).not.toBeNull();
      expect(result.container.innerHTML).not.toContain("SECRET");
      expect(result.cache.getQueryData(["articles", "detail", "user-1", "obedience"]))
        .toBeUndefined();
    } finally { await result.cleanup(); }
  });

  it("invalid slugs and unknown articles fail closed", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(getMyArticle("../admin")).rejects.toThrow("адрес статьи");
    const result = await renderArticle(null, 404);
    try {
      expect(result.container.querySelector('[role="alert"]')).not.toBeNull();
      expect(result.container.textContent).not.toContain("Слушай команду");
    } finally { await result.cleanup(); }
  });
});
