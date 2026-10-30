// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MomentSummary } from "./MomentSummary";
import type { MomentItem } from "./momentsApi";

const moment: MomentItem = {
  id: "post1", username: "trainer1", authorName: "Кинолог",
  roleBadge: "Кинолог", text: "Сегодня гуляем", createdAt: "2026-10-25T11:00:00Z",
  publishedAt: "2026-10-25T11:00:00Z", reactions: [], myReaction: null,
  bookmarked: false, commentCount: 0, viewCount: 2, media: [],
  hasPoll: true, canEdit: false,
};
const poll = {
  id: "poll1", postId: "post1", question: "Ваш вариант?",
  allowMultiple: false, isQuiz: false, isAnonymous: true,
  hideResults: true, shuffleOptions: false, endDate: null,
  closed: false, totalVotes: null, myOptionIds: [], explanation: null,
  options: [
    { id: "yes", text: "Да", votes: null },
    { id: "no", text: "Нет", votes: null },
  ],
};
let root: Root, host: HTMLDivElement, cache: QueryClient;
const requests = vi.fn<(path: string) => Promise<Response>>();
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host); root = createRoot(host);
  requests.mockReset();
  requests.mockImplementation(async path => {
    if (path === "/api/v1/feed/posts/post1/poll") {
      return new Response(JSON.stringify({ success: true, data: poll }), { status: 200 });
    }
    throw Error("UNEXPECTED_PATH");
  });
  vi.stubGlobal("fetch", requests);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear(); host.remove(); vi.unstubAllGlobals();
});
it("uses Next card order: header, media, copy, reactions, then stats", async () => {
  const withMedia: MomentItem = {
    ...moment,
    media: [{id: "media-1", kind: "photo", status: "ready"}],
    hasPoll: false,
  };
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <ul><MomentSummary userId="owner1" post={withMedia} /></ul>
  </QueryClientProvider>));
  const card = host.querySelector(".moment-summary-card");
  expect(card).not.toBeNull();
  const children = [...(card?.children ?? [])];
  const indexOf = (selector: string) =>
    children.findIndex(node => node.matches(selector));
  const meta = indexOf(".web4-moment-compact-author");
  const media = indexOf(".moment-media-gallery");
  const text = indexOf(".moment-post-copy");
  const actions = indexOf(".moment-engagement-actions");
  const stats = children.findIndex(node => node.className.includes("postStats"));
  expect([meta, media, text, actions, stats]).toEqual([0, 1, 2, 3, 4]);
  expect(card?.textContent).toContain("Сегодня гуляем");
  expect(card?.textContent).toContain("Комментировать");
  expect(requests).not.toHaveBeenCalled();
});

it("renders live poll options directly inside feed card instead of placeholder", async () => {
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <ul><MomentSummary userId="owner1" post={moment} /></ul>
  </QueryClientProvider>));
  // Lazy poll JS resolves after Suspense; the UI contract waits for actual content.
  for (let i = 0; i < 20 && !host.textContent?.includes("Ваш вариант?"); i++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  }
  expect(host.textContent).toContain("Ваш вариант?");
  expect(host.textContent).toContain("Да");
  expect(host.textContent).toContain("Нет");
  expect(host.textContent).not.toContain("В публикации есть опрос");
  expect(host.textContent).toContain("Результаты скрыты");
  expect(requests.mock.calls.filter(([url]) =>
    url === "/api/v1/feed/posts/post1/poll")).toHaveLength(1);
});
