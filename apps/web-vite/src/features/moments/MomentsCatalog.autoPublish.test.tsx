// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { MomentsCatalog } from "./MomentsCatalog";

afterEach(() => vi.unstubAllGlobals());
const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data }));

it("automatically inserts a published video post into the feed after its pending card vanishes", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const userId = "auto-publish-owner";
  let completed = false, feedReads = 0;
  const post = {
    id: "ready-moment", status: "published", text: "Готовое видео появилось",
    author: { id: userId, username: "owner", name: "Владелец", role: "USER", avatarUrl: null },
    attachments: [], reactions: [], myReaction: null, viewCount: 0, commentCount: 0,
    createdAt: "2026-10-29T15:00:00.000Z", publishedAt: "2026-10-29T15:00:10.000Z",
    hasPoll: false, canEdit: false,
  };
  const fetcher = vi.fn(async (path: string) => {
    if (path === "/api/v1/feed/status") return envelope({ enabled: true, smartEnabled: false });
    if (path.startsWith("/api/v1/feed/me/pending-posts")) return envelope({
      items: completed ? [] : [{ id: post.id, status: "pending", version: 2,
        text: "Готовится публикация", canEdit: false, attachments: [],
        pendingRevision: null }],
      nextCursor: null,
    });
    if (path.includes("/api/v1/feed/posts?")) {
      feedReads++;
      return envelope({ items: completed ? [post] : [], nextCursor: null });
    }
    throw Error("UNEXPECTED_API_REQUEST");
  });
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () => root.render(<QueryClientProvider client={cache}>
      <MomentsCatalog userId={userId} />
    </QueryClientProvider>));
    await act(async () => { await new Promise(r => setTimeout(r, 55)); });
    expect(host.textContent).toContain("Готовится публикация");
    expect(host.textContent).not.toContain(post.text);
    const before = feedReads;
    completed = true;
    await act(async () =>
      cache.refetchQueries({ queryKey: ["moments", "pending-posts", userId] }));
    await act(async () => { await new Promise(r => setTimeout(r, 90)); });
    expect(feedReads).toBeGreaterThan(before);
    expect(host.textContent).toContain(post.text);
    expect(host.querySelector('a[href="/moments/' + post.id + '"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Готовится публикация");
  } finally {
    await act(async () => root.unmount());
    cache.clear(); host.remove();
  }
});
