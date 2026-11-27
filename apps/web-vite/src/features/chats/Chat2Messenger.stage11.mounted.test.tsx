// @vitest-environment jsdom
import { Profiler, StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const scenario = vi.hoisted(() => ({
  role: "USER",
  rooms: [] as {
    id: string;
    kind: string;
    name: string;
    members: unknown[];
    unreadCount: number;
    lastMessage: null;
  }[],
  cynologist: vi.fn(),
  courses: [] as { id: string; name: string }[],
  directByUsername: vi.fn(),
  createGroup: vi.fn(),
  sent: vi.fn(),
  react: vi.fn(),
  mediaUrl: vi.fn(),
  upload: vi.fn(),
  timeline: [] as unknown[],
  readTimeline: vi.fn(),
  socketEvents: new Map<string, () => void>(),
  subEvents: new Map<string, () => void>(),
  olderPage: vi.fn(),
}));
const preprocessing = vi.hoisted(() => ({
  video: vi.fn(),
  poster: vi.fn(),
  photo: vi.fn(),
}));
vi.mock("../../shared/media/browserVideo720", () => ({
  prepareBrowserVideo720: preprocessing.video,
}));
vi.mock("../../shared/media/browserVideoPoster", () => ({
  prepareBrowserVideoPoster: preprocessing.poster,
}));
vi.mock("../../shared/media/browserPhotoWebp", () => ({
  prepareBrowserPhotoWebp: preprocessing.photo,
}));
vi.mock("../../shared/auth/useAuth", () => ({
  useCurrentUser: () => ({ data: { id: "local-test-owner", username: "qa", role: scenario.role } }),
  useLogout: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock("./chat2Api", () => ({
  chat2Api: {
    list: async () => scenario.rooms,
    courseOptions: async () => scenario.courses,
    discover: async () => [],
    users: async () => [],
    community: async () => ({ conversationId: "general-room" }),
    cynologist: scenario.cynologist,
    directByUsername: scenario.directByUsername,
    create: scenario.createGroup,
    detail: async () => ({
      id: "direct-room",
      kind: "DIRECT",
      name: null,
      members: [
        { userId: "local-test-owner", username: "qa", role: "MEMBER" },
        { userId: "target", username: "teamb", role: "MEMBER" },
      ],
      unreadCount: 0,
      lastMessage: null,
      lastSequence: "0",
      role: "MEMBER",
      visibility: "PRIVATE",
    }),
    messages: async (id: string, cursor?: { before?: string }) =>
      cursor?.before ? scenario.olderPage(id, cursor) : scenario.readTimeline(),
    send: scenario.sent,
    react: scenario.react,
    mediaUrl: scenario.mediaUrl,
    upload: scenario.upload,
    read: async () => ({ lastReadSequence: "1" }),
    connect: async () => ({ token: "qa", wsUrl: "ws://127.0.0.1:1", subscriptionMode: "proxy" }),
    subscription: async () => ({ token: "none", channel: "none" }),
  },
}));

vi.mock("centrifuge", () => ({
  Centrifuge: class {
    on(event: string, callback: () => void) { scenario.socketEvents.set(event, callback); }
    newSubscription() { return {
      on(event: string, callback: () => void) { scenario.subEvents.set(event, callback); },
      subscribe() { /* Subscription events are driven by the test fixture. */ },
    }; }
    connect() { /* Connection events are driven by the test fixture. */ }
    disconnect() { /* Connection events are driven by the test fixture. */ }
  }
}));
import { Chat2Messenger } from "./Chat2Messenger";

let root: Root;
let host: HTMLDivElement;
let cache: QueryClient;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  scenario.role = "USER";
  scenario.rooms = [];
  scenario.courses = [];
  scenario.cynologist.mockReset();
  scenario.directByUsername.mockReset();
  scenario.createGroup.mockReset().mockResolvedValue({ conversationId: "course-topic-room" });
  scenario.sent.mockReset();
  scenario.react.mockReset().mockResolvedValue({
    messageId: "message-one",
    emoji: "👍",
    active: true,
  });
  preprocessing.video.mockReset().mockImplementation(async (file: File) => file);
  preprocessing.poster
    .mockReset()
    .mockResolvedValue(new File([new Uint8Array(32)], "poster.webp", { type: "image/webp" }));
  preprocessing.photo.mockReset().mockImplementation(async (file: File) => ({
    small: { file, width: 360, height: 270 },
    medium: { file, width: 1440, height: 1080 },
  }));
  scenario.upload.mockReset();
  scenario.mediaUrl.mockReset().mockResolvedValue({
    url: "https://example.test/chat2/video.mp4",
    mime: "video/mp4",
    name: "walk.mp4",
    expiresIn: 900,
  });
  scenario.timeline = [];
  scenario.readTimeline.mockReset().mockImplementation(() => scenario.timeline);
  scenario.socketEvents.clear(); scenario.subEvents.clear();
  scenario.olderPage.mockReset().mockResolvedValue([]);
  scenario.sent.mockImplementation(async (_id, data: { text: string; clientMessageId: string }) => {
    const message = {
      id: "sent-message",
      conversationId: "direct-room",
      sequence: "1",
      authorId: "local-test-owner",
      clientMessageId: data.clientMessageId,
      text: data.text,
      replyToId: null,
      createdAt: "2026-10-27T09:00:00Z",
      editedAt: null,
      deletedAt: null,
      attachments: [],
    };
    scenario.timeline = [message];
    return message;
  });
  scenario.directByUsername.mockResolvedValue({ conversationId: "direct-room" });
  window.history.replaceState(null, "", "/chats");
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});
const commits: number[] = [];
async function render(strictMode = false) {
  const app = (
    <QueryClientProvider client={cache}>
      <Profiler id="stage11" onRender={(_, __, duration) => commits.push(duration)}><Chat2Messenger /></Profiler>
    </QueryClientProvider>
  );
  await act(async () => root.render(strictMode ? <StrictMode>{app}</StrictMode> : app));
  await act(async () => {
    await Promise.resolve();
  });
}


it("profiles a long chat during typing and reconnect with unchanged history", async () => {
  const message = (i: number) => ({
    id: "qa-history-" + i, conversationId: "direct-room", sequence: String(i),
    authorId: i % 2 ? "target" : "local-test-owner", clientMessageId: "qa-msg-" + i,
    text: "Stage11 message " + i, replyToId: null, createdAt: "2026-10-27T09:00:00Z",
    editedAt: null, deletedAt: null, attachments: [],
  });
  scenario.timeline = Array.from({ length: 180 }, (_, i) => message(i + 1));
  await render();
  const { navigate } = await import("../../shared/router/location");
  await act(async () => navigate("/chats/direct-room"));
  await vi.waitFor(() => {
    expect(host.textContent).toContain("Stage11 message 180");
    expect(scenario.subEvents.has("subscribed")).toBe(true);
  }, { timeout: 20000 });
  await act(async () => { scenario.subEvents.get("subscribed")?.(); });
  const rows = host.querySelectorAll('div[class*="message_"]');
  expect(rows.length).toBe(180);
  const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Текст сообщения"]')!;
  expect(input).toBeTruthy();
  const original = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  const format = vi.spyOn(Date.prototype, "toLocaleDateString");
  const queries = scenario.readTimeline.mock.calls.length;
  commits.length = 0;
  for (let i = 1; i <= 12; i++) {
    await act(async () => { original.call(input, "x".repeat(i)); input.dispatchEvent(new Event("input", { bubbles: true })); });
  }
  const typing = { commits: commits.length, durationMs: commits.reduce((a,b)=>a+b,0),
    dateCalls: format.mock.calls.length,
    requests: scenario.readTimeline.mock.calls.length-queries };
  expect(input.value).toBe("x".repeat(12));
  // Slow hosts may cross the real polling deadline; report those reads, but
  // do not attribute timer-triggered requests to draft input.
  expect(host.querySelectorAll('div[class*="message_"]').length).toBe(180);
  // Row-specific date formatting is performed only by the history renderer.
  expect(typing.dateCalls).toBe(0);
  commits.length = 0; format.mockClear();
  const beforeReconnect = scenario.readTimeline.mock.calls.length;
  await act(async () => { scenario.socketEvents.get("disconnected")?.(); });
  scenario.timeline = [...scenario.timeline, message(181)];
  await act(async () => {
    scenario.socketEvents.get("connected")?.();
    scenario.subEvents.get("subscribed")?.();
  });
  await vi.waitFor(() => expect(host.textContent).toContain("Stage11 message 181"), { timeout: 20000 });
  const reconnect = { commits: commits.length, durationMs: commits.reduce((a,b)=>a+b,0),
    dateCalls: format.mock.calls.length,
    requests: scenario.readTimeline.mock.calls.length-beforeReconnect };
  expect(input.value).toBe("x".repeat(12));
  expect(host.querySelectorAll('div[class*="message_"]').length).toBe(181);
  expect(reconnect.requests).toBeGreaterThanOrEqual(1);
  console.warn("STAGE11_CHAT_PROFILE", JSON.stringify({ typing, reconnect, rows: 180 }));
}, 60000);
