// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionThreadReplies } from "./QuestionThreadReplies";

const child = (id: string) => ({
  id, body: "Совет: " + id, author: {
    id: "other-person", name: "Тренер", avatarUrl: "private-signed.jpg",
  },
  best: false, deleted: false, hidden: false, liked: false, hearts: 1,
  parentId: "root-1", replyToName: "Автор", replyCount: 0,
  canEdit: false, canDelete: false, photos: [],
});

const json = (data: unknown, status = 200) => new Response(JSON.stringify({
  success: status === 200, data,
}), { status });

async function mount(fetcher: ReturnType<typeof vi.fn>, blocked = false) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onReply = vi.fn();
  await act(async () => root.render(createElement(
    QueryClientProvider, { client: cache },
    createElement(QuestionThreadReplies, {
      rootId: "root-1", userId: "viewer-1", questionId: "question-A",
      blocked, canReply: true, onReply,
    }),
  )));
  return {
    host, cache, onReply,
    async click(label: string) {
      const button = Array.from(host.querySelectorAll("button"))
        .find(b => b.textContent?.includes(label));
      expect(button, "Button " + label).toBeDefined();
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    },
    async cleanup() {
      await act(async () => root.unmount()); cache.clear(); host.remove();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("Vite nested replies", () => {
  it("fetches only on expansion; paginates and deduplicates ids", async () => {
    const fake = vi.fn().mockImplementation((path: string) =>
      Promise.resolve(json(path.includes("page=2")
        ? { items: [child("nested-1"), child("nested-2")], nextPage: null }
        : { items: [child("nested-1")], nextPage: 2 })));
    const screen = await mount(fake);
    try {
      expect(fake).not.toHaveBeenCalled();
      await screen.click("Показать ответы");
      expect(fake.mock.calls[0][0]).toContain("/answers/root-1/replies?page=1");
      expect(screen.host.textContent).toContain("nested-1");
      await screen.click("Ещё вложенные ответы");
      expect(fake.mock.calls[1][0]).toContain("page=2");
      expect(screen.host.textContent?.match(/Совет: nested-1/g)).toHaveLength(1);
      expect(screen.host.textContent).toContain("nested-2");
      expect(JSON.stringify(screen.cache.getQueryData([
        "questions", "replies", "viewer-1", "question-A", "root-1",
      ]))).not.toMatch(/other-person|private-signed/);
      await screen.click("Ответить");
      expect(screen.onReply).toHaveBeenCalledWith("nested-1", "Тренер");
    } finally { await screen.cleanup(); }
  });

  it("blocked account never sees a nested reply control", async () => {
    const fake = vi.fn().mockResolvedValue(json({
      items: [child("nested-1")], nextPage: null,
    }));
    const screen = await mount(fake, true);
    try {
      await screen.click("Показать ответы");
      expect(screen.host.textContent).toContain("nested-1");
      expect(screen.host.querySelector('[aria-label="Ответить на комментарий"]')).toBeNull();
    } finally { await screen.cleanup(); }
  });

  it("rejects backend failures instead of silently hiding missing replies", async () => {
    const fake = vi.fn().mockResolvedValue(json(null, 503));
    const screen = await mount(fake);
    try {
      await screen.click("Показать ответы");
      expect(screen.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось загрузить");
      expect(screen.host.querySelector(".compact-card")).toBeNull();
    } finally { await screen.cleanup(); }
  });
});
