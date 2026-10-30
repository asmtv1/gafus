// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentsProfile } from "./MomentsProfile";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";

const author = { id: "private", username: "trainer", name: "Кинолог",
  role: "TRAINER", avatarUrl: "https://private.example/avatar" };
const post = {
  id: "post-1", author, status: "published", text: "Слушаем спокойно",
  attachments: [], reactions: [], myReaction: null,
  commentCount: 0, viewCount: 5, createdAt: "2026-10-16T12:00:00Z",
  publishedAt: "2026-10-16T12:00:00Z", canEdit: false,
};
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: status === 200, data }), { status });
}
async function mount(fake: ReturnType<typeof vi.fn>) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fake);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"viewer",username:"viewer"});
  await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
    createElement(MomentsProfile, { userId: "viewer", username: "trainer" }),
  )));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  return {
    host, cache,
    async more() {
      const button = Array.from(host.querySelectorAll("button"))
        .find(item => item.textContent?.includes("Ещё публикации"));
      expect(button).toBeDefined();
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    },
    async cleanup() {
      await act(async () => root.unmount()); cache.clear(); host.remove();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("Moments author profile", () => {
  it("never fetches profile posts until server flags enable Moments", async () => {
    const fake = vi.fn().mockResolvedValue(response({ enabled: false }));
    const ui = await mount(fake);
    try {
      expect(fake).toHaveBeenCalledTimes(1);
      expect(ui.host.textContent).toContain("Моменты сейчас недоступны");
    } finally { await ui.cleanup(); }
  });
  it("paginates author-scoped posts, dedups and keeps private IDs out of cache", async () => {
    const fake = vi.fn((path: string) => Promise.resolve(
      path.endsWith("/status") ? response({ enabled: true })
        : path.includes("cursor=older")
          ? response({ items: [post, { ...post, id: "post-2", text: "Второй пост" }],
            nextCursor: null })
          : response({ items: [post], nextCursor: "older" }),
    ));
    const ui = await mount(fake);
    try {
      expect(ui.host.textContent).toContain("Слушаем спокойно");
      expect(ui.host.querySelector('a[href="/moments/post-1"]')).not.toBeNull();
      expect(ui.host.querySelector('a[href="/moments/profile/trainer"]')).not.toBeNull();
      await ui.more();
      expect(ui.host.querySelectorAll("ul.compact-grid > li")).toHaveLength(2);
      expect(JSON.stringify(ui.cache.getQueryData([
        "moments", "profile", "viewer", "trainer",
      ]))).not.toMatch(/private.example|avatar/);
    } finally { await ui.cleanup(); }
  });
  it("server failure is never displayed as a fake empty feed", async () => {
    const fake = vi.fn((path: string) => Promise.resolve(
      path.endsWith("/status") ? response({ enabled: true }) : response(null, 503),
    ));
    const ui = await mount(fake);
    try {
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Публикации пользователя недоступны");
      expect(ui.host.textContent).not.toContain("Публикаций пока нет");
    } finally { await ui.cleanup(); }
  });
});
