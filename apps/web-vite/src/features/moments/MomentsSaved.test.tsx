// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentsSaved } from "./MomentsSaved";

const post = {
  id: "post-1", author: { id: "private", name: "Автор",
    username: "author", role: null }, status: "published",
  text: "Сохранённый момент", attachments: [],
  createdAt: "2026-10-16T12:00:00.000Z",
  publishedAt: "2026-10-16T12:00:00.000Z",
  reactions: [], myReaction: null, bookmarked: true,
  commentCount: 0, viewCount: 1, canEdit: false,
};
function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200, data,
  }), { status });
}
async function mount(fetcher: ReturnType<typeof vi.fn>) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
    createElement(MomentsSaved, { userId: "viewer" }),
  )));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  return {
    container, cache,
    async cleanup() {
      await act(async () => root.unmount()); cache.clear(); container.remove();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("Moments saved publications", () => {
  it("stays closed when Feed rollout is disabled", async () => {
    const fake = vi.fn().mockResolvedValue(envelope({ enabled: false }));
    const ui = await mount(fake);
    try {
      expect(fake).toHaveBeenCalledTimes(1);
      expect(ui.container.textContent).toContain("Моменты сейчас недоступны");
      expect(ui.container.querySelector("ul")).toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("shows only server-saved posts and removes one after explicit ACK/refetch", async () => {
    let saved = true;
    const fake = vi.fn((path: string, options?: RequestInit) => Promise.resolve(
      path === "/api/v1/feed/status"
        ? envelope({ enabled: true })
        : options?.method === "DELETE"
          ? (saved = false, envelope({ saved: false }))
          : envelope({ items: saved ? [post] : [], nextCursor: null }),
    ));
    const ui = await mount(fake);
    try {
      expect(ui.container.textContent).toContain("Сохранённый момент");
      expect(ui.container.querySelector('a[href="/moments/post-1"]')).not.toBeNull();
      // Saved cards must use the SAME MomentSummary and action layout as Feed.
      const savedPage = ui.container.querySelector('.moments-saved-page.next-feed-page');
      expect(savedPage).not.toBeNull();
      const savedCard = savedPage?.querySelector('.moments-catalog-grid > .moment-summary-card');
      expect(savedCard).not.toBeNull();
      expect(savedCard?.querySelector('.web4-moment-compact-author')).not.toBeNull();
      expect(savedCard?.querySelector('.moment-engagement-actions')).not.toBeNull();
      expect(savedCard?.querySelector('.moment-comment-action')).not.toBeNull();
      const button = savedCard?.querySelector<HTMLButtonElement>(
        'button.moment-action-save-feed[aria-pressed="true"]',
      );
      expect(button?.getAttribute("aria-label")).toBe("Убрать из закладок");
      expect(button?.getAttribute("title")).toBe("Убрать из закладок");
      expect(button?.querySelector('svg[aria-hidden="true"]')?.getAttribute('fill')).toBe('currentColor');
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(fake.mock.calls.find(call => call[1]?.method === "DELETE")?.[0])
        .toBe("/api/v1/feed/posts/post-1/bookmark");
      expect(ui.container.textContent).toContain("Сохранённых публикаций пока нет");
      const emptyState = Array.from(ui.container.querySelectorAll("p"))
        .find(node => node.textContent === "Сохранённых публикаций пока нет.");
      expect(emptyState?.className).toMatch(/emptyState/);
      expect(ui.container.textContent).not.toContain("Сохранённый момент");
    } finally { await ui.cleanup(); }
  });

  it("shows server failure without pretending saved list is empty", async () => {
    const fake = vi.fn((path: string) => Promise.resolve(
      path === "/api/v1/feed/status"
        ? envelope({ enabled: true }) : envelope(null, 503),
    ));
    const ui = await mount(fake);
    try {
      expect(ui.container.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось загрузить закладки");
      expect(ui.container.textContent).not.toContain("Сохранённых публикаций пока нет");
    } finally { await ui.cleanup(); }
  });
});
