// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedPollDto } from "@gafus/types";
const { getPoll, votePoll } = vi.hoisted(() => ({ getPoll: vi.fn(), votePoll: vi.fn() }));
vi.mock("./api", () => ({ feedApi: { getPoll, votePoll } }));
vi.mock("@/shared/components/ui", () => ({
  PrimaryButton: ({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) =>
    <button disabled={disabled} onClick={onClick}>{children}</button>,
  SecondaryButton: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) =>
    <button onClick={onClick}>{children}</button>,
}));
import { FeedPollCard } from "./FeedPollCard";
const base: FeedPollDto = {
  id: "poll1", postId: "post1", question: "Где гуляете?", explanation: null,
  allowMultiple: false, isQuiz: false, isAnonymous: false, hideResults: true,
  shuffleOptions: false, endDate: null, closed: false, totalVotes: null,
  myOptionIds: [], canEdit: false, serverNow: "2026-10-14T00:00:00.000Z",
  options: [
    { id: "a", position: 0, text: "В парке", imageMediaId: null, imageUrl: null, votes: null },
    { id: "b", position: 1, text: "Дома", imageMediaId: null, imageUrl: null, votes: null },
  ],
};
let host: HTMLDivElement, root: Root, client: QueryClient;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  getPoll.mockReset(); votePoll.mockReset(); getPoll.mockResolvedValue(base);
  votePoll.mockResolvedValue({ ...base, myOptionIds: ["a"] });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); });
describe("FeedPollCard Web", () => {
  it("fetches only when mounted near viewport and sends selected answer", async () => {
    await act(async () => root.render(<QueryClientProvider client={client}><FeedPollCard postId="post1" /></QueryClientProvider>));
    await act(async () => { await vi.waitFor(() => expect(host.textContent).toContain("Где гуляете?")); });
    expect(host.textContent).toContain("Результаты пока скрыты");
    const options = [...host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')];
    expect(options).toHaveLength(2);
    await act(async () => options[0]?.click());
    await act(async () => [...host.querySelectorAll("button")].find(x => x.textContent === "Проголосовать")?.click());
    await vi.waitFor(() => expect(votePoll).toHaveBeenCalledWith("post1", { optionIds: ["a"] }));
  });
});
