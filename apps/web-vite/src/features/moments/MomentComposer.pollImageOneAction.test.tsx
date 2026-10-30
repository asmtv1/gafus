// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentComposer } from "./MomentComposer";
import { uploadMomentPollOptionImages } from "./momentPollOptionUpload";

vi.mock("./momentPollOptionUpload", () => ({uploadMomentPollOptionImages: vi.fn()}));
const UUID = "550e8400-e29b-41d4-a716-446655440000";
const draft = {id: "post1", status: "draft", version: 0, text: "", canEdit: true,
  attachments: [], pendingRevision: null};
const revised = {...draft, version: 1,
  pendingRevision: {status: "draft", text: "", attachmentIds: []}};
const poll = {id: "poll1", postId: "post1", question: "Что выбрать?",
  isQuiz: false, allowMultiple: false, isAnonymous: false, closed: false,
  canClose: true, totalVotes: 0, myOptionIds: [], explanation: null,
  options: [{id: "o1", text: "Собаку", votes: 0, imageMediaId: "media1"},
    {id: "o2", text: "Кошку", votes: 0, imageMediaId: null}]};
const response = (data: unknown, status=200) => new Response(JSON.stringify({
  success: status === 200, data, error: status === 404 ? "Not found" : null,
}), {status});
afterEach(() => vi.unstubAllGlobals());
const pause = async () => act(async () => {
  await new Promise(resolve => setTimeout(resolve, 35));
});
describe("WEB4 genuine one-action option-image poll transport ordering", () => {
  it("creates Core draft, waits image READY, saves poll with server media ID, CAS then publishes", async () => {
    (globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("crypto", {randomUUID: () => UUID});
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true, value: vi.fn(() => "blob:local-only"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true, value: vi.fn(),
    });
    let stored = false;
    const requests = vi.fn((path: string, init?: RequestInit) => {
      if (path.endsWith("/status")) return Promise.resolve(response({enabled: true}));
      if (path === "/api/v1/feed/posts") return Promise.resolve(response(draft));
      if (path === "/api/v1/feed/posts/post1/draft-poll")
        return Promise.resolve(response(stored ? poll : null));
      if (path === "/api/v1/feed/posts/post1/poll") {
        if (init?.method === "PUT") {stored = true; return Promise.resolve(response(poll));}
        return Promise.resolve(stored ? response(poll) : response(null, 404));
      }
      if (path.endsWith("/revisions")) return Promise.resolve(response(revised));
      if (path.endsWith("/publish")) return Promise.resolve(response({
        ...revised, status: "published", pendingRevision: null,
      }));
      return Promise.resolve(response(null, 503));
    });
    vi.stubGlobal("fetch", requests);
    vi.mocked(uploadMomentPollOptionImages).mockImplementation(async request => ({
      ...request.poll, options: request.poll.options.map((option, index) => {
        const {imageAsset: _asset, ...publicOption} = option;
        return {...publicOption, ...(index === 0 ? {imageMediaId: "media1"} : {})};
      }),
    }));
    window.history.replaceState(null, "", "/moments/new");
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    const click = async (text: string) => {
      const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find(item => item.textContent?.includes(text));
      expect(button, text).toBeDefined();
      await act(async () => button?.click()); await pause();
    };
    const fill = async (selector: string, value: string) => {
      const input = host.querySelector<HTMLInputElement>(selector)!;
      expect(input).not.toBeNull();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      await act(async () => {setter.call(input, value);
        input.dispatchEvent(new Event("input", {bubbles: true}));});
    };
    try {
      await act(async () => root.render(createElement(QueryClientProvider, {client},
        createElement(MomentComposer, {userId: "viewer"}))));
      await pause();
      await click("Добавить опрос");
      await fill('section.web4-inline-poll input[placeholder="Что вы думаете?"]', poll.question);
      await fill('input[aria-label="Вариант ответа 1"]', poll.options[0]!.text);
      await fill('input[aria-label="Вариант ответа 2"]', poll.options[1]!.text);
      const input = host.querySelector<HTMLInputElement>('input[aria-label="Фото варианта 1"]')!;
      const file = new File(["img"], "dog.webp", {type: "image/webp"});
      Object.defineProperty(input, "files", {configurable: true, value: [file]});
      await act(async () => input.dispatchEvent(new Event("change", {bubbles: true})));
      expect(host.querySelector('img[alt="Фото варианта 1"]')).not.toBeNull();
      const publish = [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find(item => item.textContent?.trim() === "Опубликовать");
      expect(publish?.disabled).toBe(false);
      await click("Опубликовать");
      for (let i=0; i<18 && !requests.mock.calls.some(([path]) =>
        path.endsWith("/publish")); i++) await pause();
      expect(uploadMomentPollOptionImages).toHaveBeenCalledWith(
        expect.objectContaining({postId: "post1", attachmentCount: 0}),
      );
      const writes = requests.mock.calls.filter(([,init]) =>
        init?.method && init.method !== "GET");
      expect(writes.map(([path]) => path)).toEqual([
        "/api/v1/feed/posts", "/api/v1/feed/posts/post1/poll",
        "/api/v1/feed/posts/post1/revisions", "/api/v1/feed/posts/post1/publish",
      ]);
      const saved = JSON.parse(String(writes[1]![1]?.body));
      expect(saved.options[0]).toMatchObject({text: "Собаку", imageMediaId: "media1"});
      expect(saved.options[1]).toMatchObject({text: "Кошку"});
      expect(JSON.stringify(saved)).not.toContain("blob:local-only");
      expect(JSON.parse(String(writes[2]![1]?.body))).toMatchObject({
        text: "", pollOnly: true, attachmentIds: [], expectedVersion: 0,
      });
    } finally {
      await act(async () => root.unmount()); client.clear(); host.remove();
      window.history.replaceState(null, "", "/moments/new");
    }
  });
});
