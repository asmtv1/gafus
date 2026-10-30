// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleDetails } from "./ArticleDetails";

const article = {
  id: "article_01", slug: "собаки", title: "Первые команды",
  authorUsername: "trainer", description: "О воспитании", visibility: "PUBLIC",
  hasAccess: true, likeCount: 4, isLiked: false,
  createdAt: "2026-10-01T12:00:00.000Z",
  imageUrls: ["https://cdn.example.test/cover.webp", "https://cdn.example.test/other.webp"],
  videoUrl: "https://cdn.example.test/video.mp4", contentType: "TEXT",
  content: "## Воспитание\n\n- **Сидеть**\n- **Рядом**",
};
let node: HTMLDivElement;
let root: Root;
let query: QueryClient;
let fetcher: ReturnType<typeof vi.fn>;
let liked: boolean;
let broken: boolean;
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({
  success: status < 400, data,
}), { status });
async function mount() {
  await act(async () => root.render(<QueryClientProvider client={query}>
    <ArticleDetails slug="собаки" userId="owner_A" />
  </QueryClientProvider>));
  await act(async () => new Promise(done => setTimeout(done, 25)));
}
async function clickLike() {
  const button = node.querySelector<HTMLButtonElement>('button[aria-label="Нравится"]');
  expect(button).not.toBeNull();
  await act(async () => button?.click());
  await act(async () => new Promise(done => setTimeout(done, 5)));
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  liked = false; broken = false;
  fetcher = vi.fn(async (path: string, options: RequestInit) => {
    if (path === "/api/v1/articles/%D1%81%D0%BE%D0%B1%D0%B0%D0%BA%D0%B8" && options.method === "GET")
      return ok({ ...article, isLiked: liked, likeCount: liked ? 5 : 4 });
    if (path === "/api/v1/articles/%D1%81%D0%BE%D0%B1%D0%B0%D0%BA%D0%B8/view" &&
        options.method === "POST") return ok(undefined);
    if (path === "/api/v1/articles/article_01/like" && options.method === "POST") {
      liked = true;
      if (broken) throw Error("LOST_ACK");
      return ok({ isLiked: true });
    }
    throw Error(`UNKNOWN_${options.method}_${path}`);
  });
  vi.stubGlobal("fetch", fetcher);
  query = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root.unmount()); query.clear(); node.remove(); vi.unstubAllGlobals();
});
describe("article Next detail actual actions and media", () => {
  it("GFM heading/list + HTTPS media render only for entitled user", async () => {
    await mount();
    expect(node.querySelector(".article-body h2")?.textContent).toBe("Воспитание");
    expect(node.querySelectorAll(".article-body li")).toHaveLength(2);
    expect(node.querySelectorAll("img[src^=\"https://cdn.example.test\"]")).toHaveLength(2);
    expect(node.querySelector("iframe[title^=\"Видео статьи\"]")).not.toBeNull();
    expect(node.querySelector("button[aria-pressed=\"false\"]")).not.toBeNull();
  });
  it("renders Markdown with normal whitespace rather than pre-wrapping source blank lines", async () => {
    // Original Next uses markdownContent only, so Markdown's source newlines
    // cannot become unintended extra visual line gaps via Vite's global
    // .article-plain-text { white-space: pre-wrap } for Moments posts.
    await mount();
    const body = node.querySelector(".article-body");
    expect(body).not.toBeNull();
    expect(body?.classList.contains("article-plain-text")).toBe(false);
    expect(body?.querySelectorAll("h2")).toHaveLength(1);
    expect(body?.querySelectorAll("li")).toHaveLength(2);
  });
  it("one POST acknowledgement updates like without refetching or remounting the article", async () => {
    await mount(); await clickLike();
    expect(node.querySelector("button[aria-pressed=\"true\"]")).not.toBeNull();
    expect(node.querySelector("button[aria-pressed=\"true\"]")?.textContent).toContain("5");
    expect(fetcher.mock.calls.map(([_, options]) => options.method)).toEqual([
      "GET", "POST", "POST",
    ]);
  });
  it("keeps the same article heading and media DOM nodes while the like POST is pending", async () => {
    let resolveLike!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveLike = resolve; });
    fetcher.mockImplementation(async (path: string, options: RequestInit) => {
      if (path.endsWith("/like") && options.method === "POST") return pending;
      if (path.endsWith("/view") && options.method === "POST") return ok(undefined);
      if (options.method === "GET") return ok(article);
      throw Error("UNEXPECTED_WRITE");
    });
    await mount();
    const title = node.querySelector("article h1");
    const bodyHeading = node.querySelector(".article-body h2");
    const cover = node.querySelector("figure img");
    await act(async () => {
      node.querySelector<HTMLButtonElement>('button[aria-label="Нравится"]')?.click();
    });
    expect(node.querySelector("article h1")).toBe(title);
    expect(node.querySelector(".article-body h2")).toBe(bodyHeading);
    expect(node.querySelector("figure img")).toBe(cover);
    expect(node.textContent).not.toContain("Проверяем доступ к статье");
    await act(async () => resolveLike(ok({ isLiked: true })));
    expect(node.querySelector("article h1")).toBe(title);
    expect(node.querySelector(".article-body h2")).toBe(bodyHeading);
    expect(node.querySelector("figure img")).toBe(cover);
    expect(fetcher.mock.calls.filter(([_, options]) => options.method === "GET")).toHaveLength(1);
    expect(node.querySelector('button[aria-pressed="true"]')?.textContent).toContain("5");
  });
  it("ambiguous like ACK never sends a second toggling POST", async () => {
    broken = true; await mount(); await clickLike();
    expect(node.textContent).toContain("Проверьте актуальное состояние лайка");
    expect(fetcher.mock.calls.filter(([path, options]) =>
      path.endsWith("/like") && options.method === "POST")).toHaveLength(1);
    expect(node.querySelector("button[aria-pressed=\"true\"]")).not.toBeNull();
  });
  it("an ambiguous view POST is not repeated on fresh read and reveals no private error", async () => {
    let attempts = 0;
    fetcher.mockImplementation(async (path: string, options: RequestInit) => {
      if (path === "/api/v1/articles/%D1%81%D0%BE%D0%B1%D0%B0%D0%BA%D0%B8/view" &&
          options.method === "POST") {
        attempts++;
        throw Error("PRIVATE_LOST_VIEW_ACK");
      }
      if (options.method === "GET") return ok(article);
      throw Error("UNEXPECTED_WRITE");
    });
    await mount();
    expect(attempts).toBe(1);
    await act(async () => {
      await query.invalidateQueries({queryKey:["articles","detail","owner_A","собаки"]});
    });
    await act(async () => new Promise(done => setTimeout(done, 20)));
    expect(attempts).toBe(1);
    expect(node.textContent).not.toContain("PRIVATE_LOST_VIEW_ACK");
  });
  it("a PUBLIC article without current subscription remains locked and has no interactive like", async () => {
    fetcher.mockImplementationOnce(async () => ok({
      ...article, visibility: "PUBLIC", hasAccess: false, content: null,
      description: "Public teaser without private body",
      videoUrl: null, imageUrls: [],
    }));
    await mount();
    expect(node.textContent).toContain("нужна действующая подписка");
    expect(node.textContent).toContain("Public teaser without private body");
    expect(node.querySelector(".article-body")).toBeNull();
    expect(node.querySelector('button[aria-label="Нравится"]')).toBeNull();
    expect(node.querySelector("img")).toBeNull();
    expect(fetcher.mock.calls.filter(([path,opts])=>
      path.endsWith("/like") && opts.method === "POST")).toHaveLength(0);
  });
  it("fresh entitled PUBLIC detail retains text/media and submits one unique view", async()=>{
    fetcher.mockImplementationOnce(async () => ok({
      ...article, visibility:"PUBLIC", hasAccess:true, content:"PUBLIC_WITH_ENTITLEMENT",
    }));
    await mount();
    expect(node.textContent).toContain("PUBLIC_WITH_ENTITLEMENT");
    expect(node.querySelectorAll('img[src^="https://cdn.example.test"]')).toHaveLength(2);
    expect(fetcher.mock.calls.filter(([path,opts])=>
      path.endsWith("/view") && opts.method === "POST")).toHaveLength(1);
  });
  it("a paid locked detail never places signed media in cache or DOM", async () => {
    fetcher.mockImplementationOnce(async () => ok({
      ...article, visibility: "PAID", hasAccess: false, content: null,
      imageUrls: ["https://cdn.example.test/PRIVATE.JPG"],
      videoUrl: "https://cdn.example.test/private.mp4",
    }));
    await mount();
    expect(node.textContent).toContain("нужна действующая подписка");
    expect(node.querySelector("video")).toBeNull();
    expect(node.querySelector("img")).toBeNull();
    expect(JSON.stringify(query.getQueryData(["articles", "detail", "owner_A", "собаки"])))
      .not.toContain("PRIVATE.JPG");
  });
});
