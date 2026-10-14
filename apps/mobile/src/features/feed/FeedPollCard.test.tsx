// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { getPoll, votePoll } = vi.hoisted(() => ({ getPoll: vi.fn(), votePoll: vi.fn() }));
vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles },
  View: ({ children, style }: {
    children: React.ReactNode;
    style?: { position?: string; width?: string } | { position?: string; width?: string }[];
  }) => {
    const styles = Array.isArray(style) ? style : [style];
    const fill = styles.some(item => item?.position === "absolute");
    const width = styles.find(item => item?.width)?.width;
    return <div data-result-fill={fill ? "true" : undefined} data-fill-width={fill ? width : undefined}>{children}</div>;
  },
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Pressable: ({ children, onPress, disabled, style, accessibilityLabel }: {
    children: React.ReactNode;
    onPress: () => void;
    disabled?: boolean;
    accessibilityLabel?: string;
    style?: { minHeight?: number } | { minHeight?: number }[];
  }) => {
    const styles = Array.isArray(style) ? style : [style];
    return (
      <button
        onClick={onPress}
        disabled={disabled}
        aria-label={accessibilityLabel}
        data-min-height={styles.find(item => item?.minHeight)?.minHeight}
      >{children}</button>
    );
  },
  Alert: { alert: vi.fn() },
}));
vi.mock("@/shared/config", () => ({ COLORS: {}, FONTS: {} }));
vi.mock("@/shared/components", () => ({
  Button: ({ label, onPress, disabled }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => <button onClick={onPress} disabled={disabled}>{label}</button>,
}));
vi.mock("@/shared/components/media/CdnImage", () => ({
  CdnImage: ({ style }: { style: { width: number; height: number } }) => (
    <div data-thumbnail-width={style.width} data-thumbnail-height={style.height} />
  ),
}));
vi.mock("@/shared/lib/api/feed", () => ({ feedApi: { getPoll, votePoll } }));
import { FeedPollCard } from "./FeedPollCard";
let host: HTMLDivElement, root: Root, cache: QueryClient;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  getPoll.mockReset(); votePoll.mockReset();
  getPoll.mockResolvedValue({
    id: "poll", postId: "post", question: "Любите собак?", closed: false,
    allowMultiple: false, isQuiz: false, isAnonymous: true, shuffleOptions: false,
    totalVotes: null, myOptionIds: [], options: [
      { id: "a", text: "Да", votes: null, imageUrl: null },
      { id: "b", text: "Нет", votes: null, imageUrl: null },
    ],
  });
  votePoll.mockResolvedValue({});
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); cache.clear(); host.remove(); });
describe("Mobile FeedPollCard", () => {
  it("renders one compact 48dp row per answer with results filling the row, not a separate track", async () => {
    getPoll.mockResolvedValue({
      id: "poll", question: "Что думаете?", closed: false,
      allowMultiple: false, isQuiz: false, isAnonymous: false,
      totalVotes: 1, myOptionIds: ["a"],
      options: [
        { id: "a", text: "норм стало", votes: 1, imageUrl: null },
        { id: "b", text: "плохо стало", votes: 0, imageUrl: null },
        { id: "c", text: "мне пофигу", votes: 0, imageUrl: null },
      ],
    });
    await act(async () => root.render(
      <QueryClientProvider client={cache}><FeedPollCard postId="post" /></QueryClientProvider>
    ));
    await act(async () => {
      await vi.waitFor(() => expect(host.textContent).toContain("норм стало"));
    });
    const choices = Array.from(host.querySelectorAll<HTMLButtonElement>("button[data-min-height]"));
    expect(choices).toHaveLength(3);
    expect(choices.map(button => button.getAttribute("data-min-height"))).toEqual(["48", "48", "48"]);
    expect(choices[0]?.getAttribute("aria-label")).toBe("норм стало, 100%");
    expect(choices[0]?.disabled).toBe(true);
    const fills = Array.from(host.querySelectorAll('[data-result-fill="true"]'));
    expect(fills.map(fill => fill.getAttribute("data-fill-width"))).toEqual(["100%", "0%", "0%"]);
    expect(host.textContent).toContain("1 голос");
    expect(host.textContent).not.toContain("Проголосовать");
  });

  it("keeps selection and voting available before results are shown", async () => {
    await act(async () => root.render(
      <QueryClientProvider client={cache}><FeedPollCard postId="post" /></QueryClientProvider>
    ));
    await act(async () => {
      await vi.waitFor(() => expect(host.textContent).toContain("Любите собак?"));
    });
    expect(host.querySelectorAll('[data-result-fill="true"]')).toHaveLength(0);
    const yes = host.querySelector('button[aria-label="Да"]') as HTMLButtonElement;
    const no = host.querySelector('button[aria-label="Нет"]') as HTMLButtonElement;
    expect(yes.disabled).toBe(false);
    expect(no.disabled).toBe(false);
    await act(async () => no.click());
    const submit = Array.from(host.querySelectorAll("button")).find(
      button => button.textContent === "Проголосовать"
    );
    await act(async () => submit?.click());
    await vi.waitFor(() => expect(votePoll).toHaveBeenCalledWith("post", { optionIds: ["b"] }));
  });

  it("preserves multiple-choice voting when answers are compact", async () => {
    getPoll.mockResolvedValue({
      id: "poll", question: "Что выбрать?", closed: false,
      allowMultiple: true, isQuiz: false, isAnonymous: true,
      totalVotes: null, myOptionIds: [],
      options: [
        { id: "a", text: "Первый", votes: null, imageUrl: null },
        { id: "b", text: "Второй", votes: null, imageUrl: null },
      ],
    });
    await act(async () => root.render(
      <QueryClientProvider client={cache}><FeedPollCard postId="post" /></QueryClientProvider>
    ));
    await act(async () => {
      await vi.waitFor(() => expect(host.textContent).toContain("Что выбрать?"));
    });
    const first = host.querySelector('button[aria-label="Первый"]') as HTMLButtonElement;
    const second = host.querySelector('button[aria-label="Второй"]') as HTMLButtonElement;
    await act(async () => {
      first.click();
      second.click();
    });
    const submit = Array.from(host.querySelectorAll("button")).find(
      button => button.textContent === "Проголосовать"
    );
    await act(async () => submit?.click());
    await vi.waitFor(() => expect(votePoll).toHaveBeenCalledWith("post", {
      optionIds: ["a", "b"],
    }));
  });

  it("keeps optional images as small thumbnails inside the answer row", async () => {
    getPoll.mockResolvedValue({
      id: "poll", question: "Какой вариант?", closed: false,
      allowMultiple: false, isQuiz: false, isAnonymous: false,
      totalVotes: null, myOptionIds: [],
      options: [{ id: "a", text: "Вариант с фото", votes: null,
        imageUrl: "https://example.test/photo.jpg", imageMediaId: "media-1" }],
    });
    await act(async () => root.render(
      <QueryClientProvider client={cache}><FeedPollCard postId="post" /></QueryClientProvider>
    ));
    await act(async () => {
      await vi.waitFor(() => expect(host.textContent).toContain("Вариант с фото"));
    });
    const thumbnail = host.querySelector("[data-thumbnail-width]");
    expect(thumbnail?.getAttribute("data-thumbnail-width")).toBe("44");
    expect(thumbnail?.getAttribute("data-thumbnail-height")).toBe("44");
  });
  it("selects exactly one answer and submits it with authenticated feed transport", async () => {
    await act(async () => root.render(<QueryClientProvider client={cache}><FeedPollCard postId="post" /></QueryClientProvider>));
    await act(async () => { await vi.waitFor(() => expect(host.textContent).toContain("Любите собак?")); });
    const option = Array.from(host.querySelectorAll("button")).find(button => button.textContent?.includes("Да"));
    expect(option).toBeTruthy();
    await act(async () => option?.click());
    const submit = Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Проголосовать");
    await act(async () => submit?.click());
    await vi.waitFor(() => expect(votePoll).toHaveBeenCalledWith("post", { optionIds: ["a"] }));
  });
});
