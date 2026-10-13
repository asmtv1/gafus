// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { getPoll, votePoll } = vi.hoisted(() => ({ getPoll: vi.fn(), votePoll: vi.fn() }));
vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles },
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Pressable: ({ children, onPress, disabled }: { children: React.ReactNode; onPress: () => void; disabled?: boolean }) =>
    <button onClick={onPress} disabled={disabled}>{children}</button>,
  Alert: { alert: vi.fn() },
}));
vi.mock("@/shared/config", () => ({ COLORS: {}, FONTS: {} }));
vi.mock("@/shared/components", () => ({
  Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) =>
    <button onClick={onPress} disabled={disabled}>{label}</button>,
}));
vi.mock("@/shared/components/media/CdnImage", () => ({ CdnImage: () => null }));
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
