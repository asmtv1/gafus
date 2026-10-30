// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { MomentItem } from "./momentsApi";
import { MomentActions } from "./MomentActions";

const calls = vi.hoisted(() => ({
  reaction: vi.fn(async () => undefined),
  bookmark: vi.fn(async () => undefined),
}));
vi.mock("./momentsApi", () => ({
  setMomentReaction: calls.reaction,
  setMomentBookmark: calls.bookmark,
}));
const post = {
  id: "moment_test", text: "Фото питомца", username: "tester",
  authorName: "Тестовый автор", roleBadge: null,
  createdAt: "2026-10-26T11:00:00.000Z", publishedAt: null,
  commentCount: 4, viewCount: 12, canEdit: false,
  bookmarked: false, hasPoll: false, myReaction: null,
  reactions: [{ emoji: "❤️", count: 3 }], media: [],
} satisfies MomentItem;
let host: HTMLDivElement;
let root: Root;
let cache: QueryClient;
const action = (name: string) => [...host.querySelectorAll<HTMLButtonElement>("button")]
  .find(button => button.getAttribute("aria-label") === name);
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  calls.reaction.mockClear(); calls.bookmark.mockClear();
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear(); host.remove();
});

describe("Telegram-style Moments reactions", () => {
  it("shows counted reaction chips and a plus picker with all five options in post detail", async () => {
    await act(async () => root.render(
      <QueryClientProvider client={cache}>
        <MomentActions post={post} userId="tester" compact
          commentHref="#moment-comments-moment_test" />
      </QueryClientProvider>));
    expect(host.querySelector(".moment-actions-compact")).not.toBeNull();
    expect(host.querySelector("a[href=\"#moment-comments-moment_test\"]")).not.toBeNull();
    expect(host.querySelectorAll(".moment-reaction-chip")).toHaveLength(1);
    expect(host.querySelector(".moment-reaction-chip")?.textContent).toBe("❤️3");
    expect(host.querySelectorAll(".moment-reaction-picker button")).toHaveLength(0);
    expect(action("Выбрать реакцию")?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => action("Выбрать реакцию")?.click());
    expect(action("Выбрать реакцию")?.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelectorAll(".moment-reaction-picker button")).toHaveLength(5);
    await act(async () => action("Реакция 😂")?.click());
    expect(calls.reaction).toHaveBeenCalledExactlyOnceWith("moment_test", "😂");
    expect(action("Выбрать реакцию")?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => action("Реакция ❤️: 3")?.click());
    expect(calls.reaction).toHaveBeenLastCalledWith("moment_test", "❤️");
    const save = host.querySelector<HTMLButtonElement>(".moment-action-save");
    expect(save?.getAttribute("aria-pressed")).toBe("false");
    expect(save?.getAttribute("aria-label")).toBe("В закладки");
    expect(save?.textContent?.trim()).toBe("");
    expect(save?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    await act(async () => save?.click());
    expect(calls.bookmark).toHaveBeenCalledExactlyOnceWith("moment_test", true);
  });

  it("renders only positive-count emoji pills in the feed, and lets a user cancel their own reaction", async () => {
    const reacted = { ...post, myReaction: "❤️", reactions: [
      { emoji: "❤️", count: 1 }, { emoji: "🔥", count: 2 },
      { emoji: "😂", count: 0 },
    ] } satisfies MomentItem;
    await act(async () => root.render(
      <QueryClientProvider client={cache}>
        <MomentActions post={reacted} userId="tester" />
      </QueryClientProvider>));
    expect(host.querySelectorAll(".moment-reaction-chip")).toHaveLength(2);
    expect([...host.querySelectorAll(".moment-reaction-chip")].map(button => button.textContent))
      .toEqual(["❤️1", "🔥2"]);
    expect(action("Реакция ❤️: 1")?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => action("Реакция ❤️: 1")?.click());
    expect(calls.reaction).toHaveBeenCalledExactlyOnceWith("moment_test", null);
  });

  it("shows only the add-reaction action without votes, closes with Escape and outside click", async () => {
    await act(async () => root.render(
      <QueryClientProvider client={cache}>
        <MomentActions post={{ ...post, reactions: [] }} userId="tester" />
      </QueryClientProvider>));
    expect(host.querySelectorAll(".moment-reaction-chip")).toHaveLength(0);
    await act(async () => action("Выбрать реакцию")?.click());
    expect(host.querySelectorAll(".moment-reaction-picker button")).toHaveLength(5);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(host.querySelector(".moment-reaction-picker")).toBeNull();
    expect(document.activeElement).toBe(action("Выбрать реакцию"));
    await act(async () => action("Выбрать реакцию")?.click());
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(host.querySelector(".moment-reaction-picker")).toBeNull();
    expect(calls.reaction).not.toHaveBeenCalled();
  });
});
