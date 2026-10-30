// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, describe, it, vi } from "vitest";
import { ArticleCatalog } from "./ArticleCatalog";

const article = (liked: boolean) => ({
  id: "article-1", slug: "training", title: "Воспитание",
  description: "О собаке", visibility: "PUBLIC", hasAccess: true,
  likeCount: liked ? 4 : 3, isLiked: liked, authorUsername: "trainer",
});
const ok = (data: unknown) => new Response(
  JSON.stringify({ success: true, data }), { status: 200 },
);
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
}
async function render() {
  await act(async () => {
    root.render(<QueryClientProvider client={client}><ArticleCatalog userId="owner_1" /></QueryClientProvider>);
  });
  await settle();
}
async function clickLike(twice = false) {
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Нравится"]');
  expect(button).not.toBeNull();
  await act(async () => {
    button!.click();
    if (twice) button!.click();
  });
  await settle();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});

describe("Next article card likes through registered Hono", () => {
  it("updates only the liked card after the server acknowledgement without catalog refetch", async () => {
    let liked = false;
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === "POST") { liked = true; return ok({ isLiked: true }); }
      return ok([article(liked)]);
    });
    vi.stubGlobal("fetch", fetcher);
    await render();
    expect(host.querySelector('button[aria-label="Нравится"]')?.textContent).toContain("3");
    await clickLike(true);
    expect(fetcher.mock.calls.filter(([_, init]) => init.method === "POST")).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([_, init]) => init.method === "GET")).toHaveLength(1);
    expect(host.querySelector('button[aria-label="Убрать лайк"]')?.textContent).toContain("4");
    expect(host.querySelector('button[aria-pressed="true"]')).not.toBeNull();
  });

  it("a lost POST acknowledgement never retries toggle; GET reconciles count", async () => {
    let liked = false;
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === "POST") { liked = true; throw new TypeError("network ACK lost"); }
      return ok([article(liked)]);
    });
    vi.stubGlobal("fetch", fetcher);
    await render();
    await clickLike(true);
    expect(fetcher.mock.calls.filter(([_, init]) => init.method === "POST")).toHaveLength(1);
    expect(host.querySelector('button[aria-label="Убрать лайк"]')?.textContent).toContain("4");
    expect(host.textContent).toContain("Проверьте его состояние");
    expect(host.textContent).not.toContain("network ACK lost");
  });

  it("a 402 preserves the server's original likes and displays accessible error", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === "POST") return new Response(JSON.stringify({
        success: false, code: "SUBSCRIPTION_OR_CREDITS_REQUIRED", error: "denied",
      }), { status: 402 });
      return ok([article(false)]);
    });
    vi.stubGlobal("fetch", fetcher);
    await render();
    await clickLike();
    expect(fetcher.mock.calls.filter(([_, init]) => init.method === "POST")).toHaveLength(1);
    expect(host.querySelector('button[aria-label="Нравится"]')?.textContent).toContain("3");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("нужен доступ");
  });
});
