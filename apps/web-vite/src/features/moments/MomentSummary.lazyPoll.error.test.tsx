// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { MomentSummary } from "./MomentSummary";
import type { MomentItem } from "./momentsApi";

// Simulate a rejected lazy JS chunk, NOT a denied poll read. A rejected dynamic
// import stays rejected; user must reload, while the rest of the post survives.
vi.mock("./MomentPoll", () => { throw new Error("SYNTHETIC_POLL_CHUNK_UNAVAILABLE"); });
const post: MomentItem = {
  id: "post1", username: "trainer1", authorName: "Кинолог", roleBadge: null,
  text: "Пост остаётся видимым", createdAt: "2026-10-25T11:00:00Z",
  publishedAt: "2026-10-25T11:00:00Z", reactions: [], myReaction: null,
  bookmarked: false, commentCount: 0, viewCount: 1, media: [],
  hasPoll: true, canEdit: false,
};
afterEach(() => vi.restoreAllMocks());
it("isolates a failed poll chunk and offers a visible page-reload recovery without losing the post", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<QueryClientProvider client={cache}>
      <ul><MomentSummary post={post} userId="viewer" /></ul>
    </QueryClientProvider>));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 35)); });
    expect(host.querySelector('[role="alert"]')?.textContent)
      .toContain("Не удалось загрузить опрос");
    expect(host.querySelector<HTMLButtonElement>('[role="alert"] button')?.textContent)
      .toContain("Перезагрузить страницу");
    expect(host.textContent).toContain("Пост остаётся видимым");
    expect(host.textContent).toContain("Комментировать");
  } finally {
    await act(async () => root.unmount());
    cache.clear(); host.remove(); error.mockRestore();
  }
});
