// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { MomentSummary } from "./MomentSummary";
import type { MomentItem } from "./momentsApi";

// Count actual lazy import evaluations while preserving the original poll
// implementation (including its validation, owner key and vote transport).
const probe = vi.hoisted(() => ({ moduleLoads: 0 }));
vi.mock("./MomentPoll", async importOriginal => {
  probe.moduleLoads++;
  return importOriginal();
});

const post: MomentItem = {
  id: "post1", username: "trainer1", authorName: "Кинолог", roleBadge: "Кинолог",
  text: "Тестовый момент", createdAt: "2026-10-25T11:00:00Z",
  publishedAt: "2026-10-25T11:00:00Z", reactions: [], myReaction: null,
  bookmarked: false, commentCount: 0, viewCount: 1, media: [],
  hasPoll: false, canEdit: false,
};
const poll = {
  id: "poll1", postId: "post1", question: "Ваш вариант?",
  allowMultiple: false, isQuiz: false, isAnonymous: true,
  hideResults: true, shuffleOptions: false, endDate: null,
  closed: false, totalVotes: null, myOptionIds: [] as string[], explanation: null,
  options: [
    { id: "yes", text: "Да", votes: null },
    { id: "no", text: "Нет", votes: null },
  ],
};
const renderPoll = (data: typeof poll) => new Response(JSON.stringify({
  success: true, data,
}), { status: 200 });
const mounted: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of mounted.splice(0)) await cleanup();
  vi.unstubAllGlobals();
});

it("does not import/mount poll for a video/text card; a real poll lazily mounts and votes via existing API", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted.push(async () => {
    await act(async () => root.unmount());
    cache.clear(); host.remove();
  });
  let voted = false;
  const fetcher = vi.fn((path: string, options?: RequestInit) => {
    if (path !== "/api/v1/feed/posts/post1/poll" &&
      path !== "/api/v1/feed/posts/post1/poll/vote") {
      throw new Error("UNEXPECTED_POLL_ROUTE:" + path);
    }
    if (options?.method === "POST") {
      voted = true;
      return Promise.resolve(renderPoll({ ...poll, myOptionIds: ["yes"] }));
    }
    return Promise.resolve(renderPoll(voted
      ? { ...poll, myOptionIds: ["yes"] } : poll));
  });
  vi.stubGlobal("fetch", fetcher);
  const render = async (hasPoll: boolean) => act(async () => root.render(
    <QueryClientProvider client={cache}>
      <ul><MomentSummary post={{ ...post, hasPoll }} userId="viewer" /></ul>
    </QueryClientProvider>,
  ));

  await render(false);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(probe.moduleLoads).toBe(0);
  expect(fetcher).not.toHaveBeenCalled();
  expect(host.querySelector(".moment-poll")).toBeNull();
  expect(host.textContent).toContain("Тестовый момент");
  expect(host.textContent).toContain("Комментировать");

  await render(true);
  // A real dynamic import can resolve a turn after the Suspense fallback.
  // Flush React commits between polls; do not assume a fixed sleep proves readiness.
  for (let i = 0; i < 20 && !host.textContent?.includes("Ваш вариант?"); i++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  }
  expect(probe.moduleLoads).toBe(1);
  expect(host.querySelector(".moment-poll")).not.toBeNull();
  expect(host.textContent).toContain("Ваш вариант?");
  expect(host.querySelectorAll(".moment-poll-option")).toHaveLength(2);
  expect(fetcher.mock.calls.filter(([path]) => path === "/api/v1/feed/posts/post1/poll"))
    .toHaveLength(1);

  await act(async () => host.querySelector<HTMLInputElement>('input[value="yes"]')?.click());
  await act(async () => host.querySelector<HTMLFormElement>(".moment-poll form")?.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  ));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST"))
    .toHaveLength(1);
  expect(voted).toBe(true);
  expect(host.textContent).toContain("Ваш вариант?");
});
