// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomentPoll } from "./MomentPoll";

const image = "https://cdn.example.invalid/moments/image.webp?sig=synthetic";
const raw = (url: string | null = image) => ({
  id: "poll1", postId: "post1", question: "Собака на фото?",
  allowMultiple: false, isQuiz: false, isAnonymous: true,
  closed: false, totalVotes: null, explanation: null, myOptionIds: [],
  options: [
    { id: "opt1", text: "Первый", votes: null, imageMediaId: "media1", imageUrl: url },
    { id: "opt2", text: "Второй", votes: null, imageMediaId: null, imageUrl: null },
  ],
});
let root: Root, host: HTMLDivElement, cache: QueryClient;
let network: ReturnType<typeof vi.fn<(path: string) => Promise<Response>>>;
const flush = async () => act(async () => {
  await new Promise(resolve => setTimeout(resolve, 35));
});
async function mount() {
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <MomentPoll userId="user1" postId="post1" />
  </QueryClientProvider>));
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  network = vi.fn();
  vi.stubGlobal("fetch", network);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear(); host.remove(); vi.unstubAllGlobals();
});
describe("WEB4 signed poll option images live read", () => {
  it("displays eligible signed photos without caching private tokens", async () => {
    network.mockImplementation(async path => {
      expect(path).toBe("/api/v1/feed/posts/post1/poll");
      return new Response(JSON.stringify({ success: true, data: raw() }), { status: 200 });
    });
    await mount();
    expect(network.mock.calls).toHaveLength(2);
    const img = host.querySelector<HTMLImageElement>("img.moment-poll-option-image");
    expect(img?.getAttribute("src")).toBe(image);
    expect(img?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(host.textContent).toContain("Собака на фото?");
    expect(host.textContent).toContain("Проголосовать");
    expect(JSON.stringify(cache.getQueryData(["moments", "poll", "user1", "post1"])))
      .not.toMatch(/cdn\.example|synthetic|media1/);
  });
  it("rejects unsafe option URL but keeps voting UI and hides signed media", async () => {
    network.mockImplementation(async () => new Response(JSON.stringify({
      success: true, data: raw("javascript:alert(1)"),
    }), { status: 200 }));
    await mount();
    expect(host.querySelector("img.moment-poll-option-image")).toBeNull();
    expect(host.textContent).toContain("Изображения вариантов недоступны");
    expect(host.textContent).toContain("Проголосовать");
    expect(host.innerHTML).not.toContain("javascript:");
  });
});
