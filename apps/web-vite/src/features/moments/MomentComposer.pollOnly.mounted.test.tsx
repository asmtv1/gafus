// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomentComposer } from "./MomentComposer";

const emptyEditor = {
  id: "post-1", status: "draft", text: "", version: 0,
  canEdit: true, attachments: [], pendingRevision: null,
};
const poll = {
  id: "poll-1", postId: "post-1", question: "Как гулять с собакой?",
  allowMultiple: false, isQuiz: false, isAnonymous: false,
  closed: false, hideResults: false, shuffleOptions: false,
  explanation: null, endDate: null, totalVotes: null, myOptionIds: [],
  serverNow: "2026-10-25T01:00:00.000Z", canEdit: true,
  options: [
    { id: "opt-1", position: 0, text: "Постепенно", votes: null },
    { id: "opt-2", position: 1, text: "Регулярно", votes: null },
  ],
};
let node: HTMLDivElement;
let root: Root;
let cache: QueryClient;
let fetcher: ReturnType<typeof vi.fn>;
let storedPoll: boolean;
let version: number;
let status: string;
let lostRevisionAck: boolean;
const result = (data: unknown, code = 200) => new Response(JSON.stringify({
  success: code === 200, data,
}), { status: code });
const editor = () => ({ ...emptyEditor, version, status,
  pendingRevision: version ? { text: "", status: "draft", attachmentIds: [] } : null,
});
async function tick() {
  await act(async () => new Promise(done => setTimeout(done, 35)));
}
async function click(label: string) {
  const button = [...node.querySelectorAll<HTMLButtonElement>("button")]
    .find(item => item.textContent?.trim() === label);
  expect(button, label).toBeDefined();
  await act(async () => button?.click()); await tick();
}
async function fill(selector: string, value: string) {
  const input = node.querySelector<HTMLInputElement>(selector);
  expect(input, selector).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function mount() {
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <MomentComposer userId="owner_A" />
  </QueryClientProvider>));
  await tick();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/moments/new");
  storedPoll = false; version = 0; status = "draft"; lostRevisionAck = false;
  fetcher = vi.fn(async (path: string, req: RequestInit) => {
    if (path === "/api/v1/feed/status") return result({ enabled: true, smartEnabled: false });
    if (path === "/api/v1/feed/posts" && req.method === "POST")
      return result(editor());
    if (path === "/api/v1/feed/posts/post-1/draft-poll" && req.method === "GET")
      return result(storedPoll ? poll : null); // Author-scoped 200/null is verified absent.
    if (path === "/api/v1/feed/posts/post-1/poll" && req.method === "GET")
      return storedPoll ? result(poll) : result(null, 404);
    if (path === "/api/v1/feed/posts/post-1/poll" && req.method === "PUT") {
      const body = JSON.parse(String(req.body));
      expect(body).toMatchObject({ expectedVersion: 0, question: poll.question });
      storedPoll = true; return result(poll);
    }
    if (path === "/api/v1/feed/posts/post-1/revisions" && req.method === "PUT") {
      const body = JSON.parse(String(req.body));
      expect(body).toMatchObject({ text: "", attachmentIds: [], pollOnly: true,
        expectedVersion: 0, clientRequestId: expect.any(String) });
      version = 1;
      if (lostRevisionAck) throw Error("LOST_REVISION_ACK");
      return result(editor());
    }
    if (path === "/api/v1/feed/posts/post-1/publish" && req.method === "POST") {
      expect(storedPoll).toBe(true);
      expect(version).toBe(1);
      status = "published";
      return result({ ...editor(), pendingRevision: null });
    }
    throw Error("UNKNOWN_" + req.method + "_" + path);
  });
  vi.stubGlobal("fetch", fetcher);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root.unmount()); cache.clear(); node.remove(); vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
async function makePoll() {
  await mount();
  await click("Создать черновик для медиа");
  await click("Добавить опрос");
  await fill("#moment-poll-question", poll.question);
  await fill("#moment-poll-option-0", "Постепенно");
  await fill("#moment-poll-option-1", "Регулярно");
  await click("Сохранить опрос");
}
describe("poll-only Next flow through existing original Hono Feed contract", () => {
  it("new draft v0 → saved poll → pollOnly revision → publish; no text post", async () => {
    await makePoll();
    expect(node.textContent).toContain("Опрос уже сохранён");
    expect(node.textContent).toContain("Подготовить публикацию с опросом");
    await click("Подготовить публикацию с опросом");
    expect(node.textContent).toContain("Опубликовать");
    await click("Опубликовать");
    expect(status).toBe("published");
    const writes = fetcher.mock.calls.filter(([_, req]) =>
      req.method === "PUT" || req.method === "POST");
    expect(writes.map(([path]) => path)).toEqual([
      "/api/v1/feed/posts", "/api/v1/feed/posts/post-1/poll",
      "/api/v1/feed/posts/post-1/revisions", "/api/v1/feed/posts/post-1/publish",
    ]);
    expect(node.textContent).not.toContain("Не удалось подтвердить редакцию");
  });
  it("uncertain revision ACK never submits a second PUT or publishes", async () => {
    lostRevisionAck = true;
    await makePoll();
    await click("Подготовить публикацию с опросом");
    expect(node.textContent).toContain("Не удалось подтвердить редакцию только с опросом");
    expect(status).toBe("draft");
    expect([...node.querySelectorAll("button")].filter(button =>
      button.textContent?.trim() === "Опубликовать" && !button.disabled)).toHaveLength(0);
    const revisions = fetcher.mock.calls.filter(([path]) =>
      path === "/api/v1/feed/posts/post-1/revisions");
    expect(revisions).toHaveLength(1);
    expect(fetcher.mock.calls.some(([path]) => path.endsWith("/publish"))).toBe(false);
  });
});
