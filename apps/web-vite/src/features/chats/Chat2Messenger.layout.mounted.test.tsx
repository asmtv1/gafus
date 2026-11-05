// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  olderPage: vi.fn(),
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
      cursor?.before ? scenario.olderPage(id, cursor) : scenario.timeline,
    send: scenario.sent,
    react: scenario.react,
    mediaUrl: scenario.mediaUrl,
    upload: scenario.upload,
    read: async () => ({ lastReadSequence: "1" }),
    connect: async () => {
      throw new Error("test offline");
    },
    subscription: async () => ({ token: "none", channel: "none" }),
  },
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
    messageId: "message-one", emoji: "👍", active: true,
  });
  scenario.upload.mockReset();
  scenario.mediaUrl.mockReset().mockResolvedValue({
    url: "https://example.test/chat2/video.mp4", mime: "video/mp4", name: "walk.mp4", expiresIn: 900,
  });
  scenario.timeline = [];
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
async function render(strictMode = false) {
  const app = (
    <QueryClientProvider client={cache}>
      <Chat2Messenger />
    </QueryClientProvider>
  );
  await act(async () => root.render(strictMode ? <StrictMode>{app}</StrictMode> : app));
  await act(async () => {
    await Promise.resolve();
  });
}

describe("Chat2 GAFUS header and quick actions", () => {
  it("inherits brand buttons in the header and keeps both actions working", async () => {
    await render();
    const newMessage = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Новое сообщение"]',
    );
    const newGroup = host.querySelector<HTMLButtonElement>('button[aria-label="Создать группу"]');
    expect(newMessage?.dataset.gafusSharedButton).toBe("caramel");
    expect(newGroup?.dataset.gafusSharedButton).toBe("primary");
    expect(newMessage?.className).toContain("iconAction");
    expect(newGroup?.className).toContain("iconAction");
    expect(newMessage?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(newGroup?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    await act(async () => newMessage?.click());
    expect(host.querySelector('input[placeholder="Найти пользователя"]')).not.toBeNull();
    await act(async () => newGroup?.click());
    expect(host.querySelector("form h2")?.textContent).toBe("Новый групповой чат");
  });

  it("keeps course names visible and labels full course-chat actions", async () => {
    scenario.courses = [
      { id: "demo-course", name: "Факультет спокойствия (демо)" },
      { id: "long-course", name: "Почему собака не слушается: понимание и управление поведением" },
    ];
    await render();
    await act(async () => {
      const shortcut = [...host.querySelectorAll<HTMLButtonElement>(
        '[class*="shortcuts_"] button',
      )].find((element) => element.textContent?.includes("Чаты курсов"));
      shortcut?.click();
    });
    await vi.waitFor(() => {
      expect(host.querySelectorAll('button[class*="catalogRow_"]')).toHaveLength(2);
    });
    const rows = [...host.querySelectorAll<HTMLButtonElement>('button[class*="catalogRow_"]')];
    expect(rows[0].querySelector("strong")?.textContent).toBe("Факультет спокойствия (демо)");
    expect(rows[1].getAttribute("title")).toBe(scenario.courses[1].name);
    expect(rows[1].getAttribute("aria-label")).toContain(scenario.courses[1].name);
    expect(rows[1].textContent).toContain("Открыть чат");
  });

  it("renders compact navigation with one search icon and consistent shortcut icons", async () => {
    scenario.role = "ADMIN";
    await render();
    const search = host.querySelector<HTMLLabelElement>('label[class*="search_"]');
    expect(search?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(search?.querySelector('input[aria-label="Поиск"]')).not.toBeNull();
    const shortcuts = host.querySelector('[class*="shortcuts_"]');
    const actions = [...(shortcuts?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    expect(actions).toHaveLength(4);
    for (const [index, label] of [
      "Модерация жалоб",
      "Чат с кинологом",
      "Чаты курсов",
      "Найти сообщества",
    ].entries()) {
      expect(actions[index].textContent).toContain(label);
      expect(actions[index].querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(actions[index].querySelector('span[class*="shortcutIcon_"]')).not.toBeNull();
    }
  });

  it("keeps the default community in the conversation list, not in lower shortcuts", async () => {
    scenario.rooms = [{
      id: "general-room",
      kind: "COMMUNITY",
      name: "Общий чат GAFUS",
      members: [{ userId: "local-test-owner", username: "qa", role: "MEMBER" }],
      unreadCount: 0,
      lastMessage: null,
    }];
    await render();
    const row = await vi.waitFor(() => {
      const found = [...host.querySelectorAll<HTMLButtonElement>('button[class*="chatRow_"]')]
        .find((button) => button.textContent?.includes("Общий чат GAFUS"));
      expect(found).toBeDefined();
      return found!;
    });
    expect(host.querySelector('[class*="shortcuts_"]')?.textContent)
      .not.toContain("Общий чат GAFUS");
    await act(async () => row.click());
    expect(window.location.pathname).toBe("/chats/general-room");
  });

  it("uses a compact accessible avatar picker with preview, validation and removal", async () => {
    const makeUrl = vi.fn(() => "blob:http://localhost/group-avatar");
    const revokeUrl = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(class extends URL {}, {
        createObjectURL: makeUrl,
        revokeObjectURL: revokeUrl,
      }),
    );
    await render();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Создать группу"]')?.click(),
    );
    const form = host.querySelector<HTMLFormElement>('form[class*="form_"]');
    const editor = form?.querySelector('[class*="avatarEditor_"]');
    const picker = editor?.querySelector<HTMLLabelElement>('label[class*="avatarPicker_"]');
    const fileInput = picker?.querySelector<HTMLInputElement>('input[type="file"]');
    expect(editor).not.toBeNull();
    expect(fileInput?.getAttribute("accept")).toBe("image/jpeg,image/png,image/webp");
    expect(fileInput?.getAttribute("aria-label")).toBe("Добавить аватарку группы");
    expect(fileInput?.className).toContain("avatarFileInput");
    expect(editor?.textContent).toContain("Фото группы");
    expect(editor?.textContent).toContain("Добавить фотографию");
    expect(editor?.textContent).toContain("до 5 МБ");
    expect(editor?.querySelector('svg[aria-hidden="true"]')).toBeNull();
    expect(editor?.querySelector('span[class*="avatarCamera_"] svg')).not.toBeNull();
    expect(editor?.querySelector('button[class*="avatarRemove_"]')).toBeNull();
    const invalid = new File(["not an image"], "bad.pdf", { type: "application/pdf" });
    await act(async () => {
      Object.defineProperty(fileInput!, "files", { configurable: true, value: [invalid] });
      fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(form?.querySelector('img[src^="blob:"]')).toBeNull();
    expect(host.textContent).toContain("Аватарка: JPG, PNG или WebP до 5 МБ");
    const selected = new File([new Uint8Array(128)], "photo.png", { type: "image/png" });
    await act(async () => {
      Object.defineProperty(fileInput!, "files", { configurable: true, value: [selected] });
      fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(makeUrl).toHaveBeenCalledWith(selected);
    expect(editor?.querySelector('img[src="blob:http://localhost/group-avatar"]')).not.toBeNull();
    expect(editor?.textContent).toContain("Заменить фотографию");
    await act(async () =>
      editor?.querySelector<HTMLButtonElement>('button[class*="avatarRemove_"]')?.click(),
    );
    expect(editor?.querySelector('img[src^="blob:"]')).toBeNull();
    expect(revokeUrl).toHaveBeenCalledWith("blob:http://localhost/group-avatar");
  });

  it("loads older messages when scrolling up and anchors the visible position without duplicates", async () => {
    const message = (sequence: number) => ({
      id: `history-${sequence}`, conversationId: "direct-room", sequence: String(sequence),
      authorId: "local-test-owner", clientMessageId: `msg-${sequence}`,
      text: `Сообщение ${sequence}`, replyToId: null,
      createdAt: "2026-10-27T09:00:00Z", editedAt: null, deletedAt: null,
      attachments: [],
    });
    scenario.timeline = Array.from({ length: 60 }, (_, i) => message(i + 61));
    const firstPage = Array.from({ length: 60 }, (_, i) => message(i + 1));
    const earlierPage = Array.from({ length: 12 }, (_, i) => message(i - 11));
    let resolveFirst!: (value: typeof firstPage) => void;
    scenario.olderPage.mockImplementationOnce(() =>
      new Promise<typeof firstPage>((resolve) => { resolveFirst = resolve; }),
    ).mockResolvedValueOnce(earlierPage);
    await render();
    const { navigate } = await import("../../shared/router/location");
    await act(async () => navigate("/chats/direct-room"));
    const list = host.querySelector<HTMLDivElement>('div[class*="messages_"]')!;
    expect(list).toBeTruthy();
    await vi.waitFor(() => expect(host.textContent).toContain("Сообщение 120"));
    expect(host.textContent).not.toContain("Загрузить предыдущие сообщения");
    Object.defineProperty(list, "scrollHeight", {
      configurable: true, get: () => 800 + list.querySelectorAll('div[class*="message_"]').length * 40,
    });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 400 });
    // A user scrolling downward never starts history pagination.
    await act(async () => {
      list.scrollTop = 800;
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    expect(scenario.olderPage).not.toHaveBeenCalled();
    await act(async () => {
      list.scrollTop = 90;
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
      list.scrollTop = 60;
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    expect(scenario.olderPage).toHaveBeenCalledExactlyOnceWith("direct-room", { before: "61" });
    expect(host.textContent).toContain("Загружаем историю");
    await act(async () => resolveFirst(firstPage));
    await vi.waitFor(() => expect(host.textContent).toContain("Сообщение 1"));
    expect(list.scrollTop).toBe(60 + firstPage.length * 40);
    expect(host.textContent).toContain("Сообщение 120");
    expect(list.querySelectorAll('div[class*="message_"]')).toHaveLength(120);
    await act(async () => {
      list.scrollTop = 700;
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
      list.scrollTop = 80;
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await vi.waitFor(() => expect(host.textContent).toContain("Сообщение -11"));
    expect(scenario.olderPage).toHaveBeenCalledTimes(2);
    await act(async () => {
      list.scrollTop = 750;
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
      list.scrollTop = 90;
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    expect(scenario.olderPage).toHaveBeenCalledTimes(2); // <60 terminates history.
  });

  it("offers user-created Course theme separately from official course rooms", async () => {
    await render();
    const create = host.querySelector<HTMLButtonElement>('button[aria-label="Создать группу"]');
    expect(create).not.toBeNull();
    await act(async () => create?.click());
    const form = host.querySelector('form[class*="form_"]');
    expect(form?.textContent).toContain("Новый групповой чат");
    const kind = form?.querySelector<HTMLSelectElement>("select");
    expect([...(kind?.options ?? [])].map((option) => [option.value, option.textContent])).toEqual([
      ["GROUP", "Группа"],
      ["CITY", "Город"],
      ["BREED", "Порода"],
      ["COURSE_TOPIC", "Курс"],
    ]);
    expect([...(kind?.options ?? [])].some((option) => option.value === "COURSE")).toBe(false);
  });

  it("opens the composer for ?to=teamb even when the pathname remains /chats", async () => {
    await render();
    const { navigate } = await import("../../shared/router/location");
    await act(async () => {
      navigate("/chats?to=teamb" as Parameters<typeof navigate>[0]);
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(scenario.directByUsername).toHaveBeenCalledOnce();
      expect(scenario.directByUsername).toHaveBeenCalledWith("teamb");
      expect(window.location.pathname).toBe("/chats/direct-room");
    });
    expect(host.querySelector("textarea")).not.toBeNull();
  });

  it("shows a video cover and centered Play immediately, without requiring a second fetch", async () => {
    scenario.timeline = [{
      id: "video-message", conversationId: "direct-room", sequence: "1",
      authorId: "local-test-owner", clientMessageId: "test-video", text: "",
      replyToId: null, createdAt: "2026-10-29T12:00:00Z",
      editedAt: null, deletedAt: null,
      attachments: [{ id: "attachment-video", name: "walk.mp4", kind: "video", mime: "video/mp4", bytes: 200 }],
    }];
    scenario.mediaUrl.mockResolvedValue({
      url: "https://cdn.test/original.mp4", mime: "video/mp4", name: "walk.mp4", expiresIn: 900,
      renditions: { poster: "https://cdn.test/cover.webp", video: { 360: "https://cdn.test/360.mp4" } },
    });
    await render();
    const { navigate } = await import("../../shared/router/location");
    await act(async () => navigate("/chats/direct-room"));
    await vi.waitFor(() => expect(host.querySelector('video[aria-label="walk.mp4"]')).not.toBeNull());
    const video = host.querySelector<HTMLVideoElement>('video[aria-label="walk.mp4"]')!;
    expect(scenario.mediaUrl).toHaveBeenCalledExactlyOnceWith("direct-room", "attachment-video");
    expect(video.getAttribute("src")).toBe("https://cdn.test/360.mp4");
    expect(video.getAttribute("poster")).toBe("https://cdn.test/cover.webp");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.hasAttribute("autoplay")).toBe(false);
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(host.textContent).not.toContain("▶ Воспроизвести видео");
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    });
    const overlay = host.querySelector<HTMLButtonElement>('button[aria-label="Воспроизвести walk.mp4"]');
    expect(overlay?.className).toContain("videoPlayOverlay");
    await act(async () => overlay?.click());
    expect(play).toHaveBeenCalledOnce();
    expect(host.querySelector('button[aria-label="Воспроизвести walk.mp4"]')).toBeNull();
    expect(scenario.mediaUrl).toHaveBeenCalledTimes(1);
  });

  it.each([503, 404])("gates rendered video CDN → exact quality S3 on HTTP %i", async status => {
    const base = "chat2/room/user/00000000-0000-4000-8000-000000000000/v1/";
    const cdn = "https://gonomudedoje.begetcdn.cloud/" + base;
    const s3 = "https://gafus-chat2-media-2026.s3.cloud.ru/" + base;
    scenario.timeline = [{
      id: "cdn-video-message", conversationId: "direct-room", sequence: "1",
      authorId: "local-test-owner", clientMessageId: "cdn-video", text: "",
      replyToId: null, createdAt: "2026-10-30T12:00:00Z",
      editedAt: null, deletedAt: null,
      attachments: [{ id: "cdn-video", name: "cdn.mp4", kind: "video", mime: "video/mp4", bytes: 900 }],
    }];
    scenario.mediaUrl.mockResolvedValue({
      url: cdn + "video/360.mp4", mime: "video/mp4", name: "cdn.mp4", expiresIn: 300,
      fallbackUrl: s3 + "video/360.mp4",
      renditions: {poster: cdn + "poster.webp", video: {
        360: cdn + "video/360.mp4", 720: cdn + "video/720.mp4",
      }},
      fallbackRenditions: {poster: s3 + "poster.webp", video: {
        360: s3 + "video/360.mp4", 720: s3 + "video/720.mp4",
      }},
    });
    const probe = vi.fn(async () => new Response(null, {status}));
    vi.stubGlobal("fetch", probe);
    await render();
    const { navigate } = await import("../../shared/router/location");
    await act(async () => navigate("/chats/direct-room"));
    await vi.waitFor(() => expect(host.querySelector('video[aria-label="cdn.mp4"]')).not.toBeNull());
    // Inline settings gear, with no permanently visible choices below the player.
    expect(host.querySelector('div[aria-label="Качество видео"]')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>(
      '[aria-label="Настройки качества видео"]')?.click());
    // Explicit 720p user selection must not be downgraded to 360p on S3 fallback.
    const choices = [...host.querySelectorAll<HTMLButtonElement>('div[aria-label="Качество видео"] button')];
    await act(async () => choices.find(x => x.textContent === "720p")?.click());
    const player = host.querySelector<HTMLVideoElement>('video[aria-label="cdn.mp4"]')!;
    expect(player.getAttribute("src")).toBe(cdn + "video/720.mp4");
    await act(async () => player.dispatchEvent(new Event("error")));
    if (status === 503) {
      await vi.waitFor(() => expect(host.querySelector('video[aria-label="cdn.mp4"]')?.getAttribute("src"))
        .toBe(s3 + "video/720.mp4"));
      expect(host.querySelector('video[aria-label="cdn.mp4"]')?.getAttribute("poster")).toBe(s3 + "poster.webp");
    } else {
      await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить видео"));
      expect(host.querySelector('video[aria-label="cdn.mp4"]')).toBeNull();
    }
    expect(probe).toHaveBeenCalledWith(
      `/api/v1/media-cdn-probe?url=${encodeURIComponent(cdn + "video/720.mp4")}`,
      expect.objectContaining({ method: "GET", credentials: "same-origin", redirect: "error" }),
    );
  });

  it("shows a circular arrow on only the failed photo and re-encodes its retained File",async()=>{
    const NativeURL=URL;
    class PreviewURL extends NativeURL {
      static createObjectURL=vi.fn((_file:Blob)=>"blob:chat-photo-preview");
      static revokeObjectURL=vi.fn();
    }
    vi.stubGlobal("URL",PreviewURL);
    scenario.upload.mockRejectedValueOnce(Error("S3 timeout"))
      .mockResolvedValueOnce({id:"attached-photo",name:"dog.jpg",kind:"image",mime:"image/webp",bytes:123});
    await render();
    const {navigate}=await import("../../shared/router/location");
    await act(async()=>navigate("/chats/direct-room"));
    const input=host.querySelector<HTMLInputElement>('input[aria-label="Прикрепить фото, видео или PDF"]');
    expect(input).not.toBeNull();
    const file=new File([new Uint8Array([255,216,255,1])],"dog.jpg",{type:"image/jpeg"});
    Object.defineProperty(input!,"files",{configurable:true,value:[file]});
    await act(async()=>input!.dispatchEvent(new Event("change",{bubbles:true})));
    const retry=await vi.waitFor(()=>{
      const button=host.querySelector<HTMLButtonElement>('button[aria-label="Повторить обработку фото dog.jpg"]');
      expect(button).not.toBeNull();return button!;
    });
    expect(host.querySelector('img[alt="dog.jpg"]')?.getAttribute("src"))
      .toBe("blob:chat-photo-preview");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("интернет");
    expect(scenario.upload).toHaveBeenCalledTimes(1);
    expect(scenario.upload.mock.calls[0]?.[1]).toBe(file);
    await act(async()=>retry.click());
    await vi.waitFor(()=>expect(scenario.upload).toHaveBeenCalledTimes(2));
    expect(scenario.upload.mock.calls[1]?.[1]).toBe(file);
    await vi.waitFor(()=>expect(host.querySelector('button[aria-label="Повторить обработку фото dog.jpg"]'))
      .toBeNull());
  });

  it.each([503, 404])("gates image CDN → S3 without leaking 403/404 on HTTP %i", async status => {
    const base = "chat2/room/user/00000000-0000-4000-8000-000000000000/v1/";
    const cdn = "https://gonomudedoje.begetcdn.cloud/" + base;
    const s3 = "https://gafus-chat2-media-2026.s3.cloud.ru/" + base;
    scenario.timeline = [{
      id: "cdn-image-message", conversationId: "direct-room", sequence: "1",
      authorId: "local-test-owner", clientMessageId: "cdn-image", text: "",
      replyToId: null, createdAt: "2026-10-30T12:00:00Z",
      editedAt: null, deletedAt: null,
      attachments: [{ id: "cdn-image", name: "cdn.webp", kind: "image", mime: "image/webp", bytes: 900 }],
    }];
    scenario.mediaUrl.mockResolvedValue({
      url: cdn + "image/m.webp", mime: "image/webp", name: "cdn.webp", expiresIn: 300,
      fallbackUrl: s3 + "image/m.webp",
      renditions: {image: {360: cdn + "image/s.webp", 1440: cdn + "image/m.webp"},
        imageWidths: {360: 360, 1440: 1440}},
      fallbackRenditions: {image: {360: s3 + "image/s.webp", 1440: s3 + "image/m.webp"},
        imageWidths: {360: 360, 1440: 1440}},
    });
    const probe = vi.fn(async () => new Response(null, {status}));
    vi.stubGlobal("fetch", probe);
    await render();
    const { navigate } = await import("../../shared/router/location");
    await act(async () => navigate("/chats/direct-room"));
    await vi.waitFor(() => expect(host.querySelector('img[alt="cdn.webp"]')).not.toBeNull());
    const img = host.querySelector<HTMLImageElement>('img[alt="cdn.webp"]')!;
    expect(img.getAttribute("src")).toBe(cdn + "image/s.webp");
    await act(async () => img.dispatchEvent(new Event("error")));
    if (status === 503) {
      await vi.waitFor(() => expect(host.querySelector('img[alt="cdn.webp"]')?.getAttribute("src"))
        .toBe(s3 + "image/s.webp"));
      expect(host.querySelector('img[alt="cdn.webp"]')?.getAttribute("srcset")).toContain(s3 + "image/s.webp");
    } else {
      await vi.waitFor(() => expect(host.querySelector('img[alt="cdn.webp"]')).toBeNull());
      expect(host.querySelector('img[alt="cdn.webp"]')).toBeNull();
    }
    expect(probe).toHaveBeenCalledWith(
      `/api/v1/media-cdn-probe?url=${encodeURIComponent(cdn + "image/s.webp")}`,
      expect.objectContaining({ method: "GET", credentials: "same-origin", redirect: "error" }),
    );
  });

  it("shows a retry arrow on only the failed video and re-uploads only its original File", async () => {
    const makeUrl = vi.fn((file: File) => `blob:chat-test/${file.name}`);
    vi.stubGlobal("URL", Object.assign(class extends URL {}, {
      createObjectURL: makeUrl, revokeObjectURL: vi.fn(),
    }));
    const videos = [new File([new Uint8Array(256)],"bad.mp4",{type:"video/mp4"}),
      new File([new Uint8Array(256)],"good.mp4",{type:"video/mp4"})];
    scenario.upload.mockImplementation(async (_id:string, file:File) => {
      if (file === videos[0] && scenario.upload.mock.calls.filter(([,f]) => f === videos[0]).length === 1)
        throw new Error("LOCAL_VIDEO_TIMEOUT");
      return {id:file.name,kind:"video",mime:"video/mp4",name:file.name,bytes:file.size};
    });
    await render();
    const { navigate } = await import("../../shared/router/location");
    await act(async()=>navigate("/chats/direct-room"));
    const picker=host.querySelector<HTMLInputElement>('input[type="file"][multiple]')!;
    expect(picker).not.toBeNull();
    Object.defineProperty(picker,"files",{configurable:true,value:videos});
    await act(async()=>picker.dispatchEvent(new Event("change",{bubbles:true})));
    await vi.waitFor(()=>expect(scenario.upload).toHaveBeenCalledTimes(2));
    const failed=host.querySelector<HTMLButtonElement>('[aria-label="Повторить обработку видео bad.mp4"]');
    expect(failed).not.toBeNull();
    expect(host.querySelector('[aria-label="Повторить обработку видео good.mp4"]')).toBeNull();
    expect(host.querySelector('video[aria-label="bad.mp4"]')).not.toBeNull();
    expect(host.textContent).toContain("нажмите круглую стрелку на этом ролике");
    await act(async()=>failed?.click());
    await vi.waitFor(()=>expect(scenario.upload).toHaveBeenCalledTimes(3));
    expect(scenario.upload.mock.calls[2]?.[1]).toBe(videos[0]);
    expect(scenario.upload.mock.calls.filter(([,file])=>file===videos[1])).toHaveLength(1);
    await vi.waitFor(()=>expect(host.querySelector('[aria-label="Повторить обработку видео bad.mp4"]')).toBeNull());
    expect(host.textContent).toContain("Готово");
  });
  it("keeps a recoverable video preview when the first signed URL request fails", async () => {
    scenario.timeline = [{
      id: "video-message", conversationId: "direct-room", sequence: "1",
      authorId: "local-test-owner", clientMessageId: "retry-video", text: "",
      replyToId: null, createdAt: "2026-10-29T12:00:00Z",
      editedAt: null, deletedAt: null,
      attachments: [{ id: "retry-media", name: "retry.mp4", kind: "video", mime: "video/mp4", bytes: 200 }],
    }];
    scenario.mediaUrl.mockRejectedValueOnce(new Error("temporary outage"));
    await render();
    const { navigate } = await import("../../shared/router/location");
    await act(async () => navigate("/chats/direct-room"));
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить видео"));
    expect(host.querySelector('button[aria-label="Воспроизвести retry.mp4"]')).toBeNull();
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Проверить состояние ещё раз");
    expect(retry).toBeDefined();
    await act(async () => retry?.click());
    await vi.waitFor(() => expect(host.querySelector('video[aria-label="retry.mp4"]')).not.toBeNull());
    expect(scenario.mediaUrl).toHaveBeenCalledTimes(2);
    expect(host.querySelector('button[aria-label="Воспроизвести retry.mp4"]')).not.toBeNull();
  });

  it("offers discoverable reply and reaction actions for a specific message", async () => {
    scenario.rooms = [{
      id: "direct-room", kind: "COMMUNITY", name: "Общий чат GAFUS",
      unreadCount: 0, lastMessage: null,
      members: [
        { userId: "local-test-owner", username: "qa", role: "MEMBER", avatarUrl: null },
        { userId: "target", username: "admin", role: "MEMBER", avatarUrl: null },
      ],
    }];
    scenario.timeline = [{
      id: "message-one", conversationId: "direct-room", sequence: "1",
      authorId: "target", clientMessageId: "message-test-one",
      text: "Привет из общего чата", replyToId: null,
      createdAt: "2026-10-27T09:00:00Z", editedAt: null,
      deletedAt: null, attachments: [],
    }];
    await render();
    const { navigate } = await import("../../shared/router/location");
    await act(async () => navigate("/chats/direct-room"));
    await vi.waitFor(() =>
      expect(host.querySelector('button[aria-label="Ответить на сообщение"]')).not.toBeNull());
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Ответить на сообщение"]')?.click());
    expect(host.textContent).toContain("Ответ на: Привет из общего чата");
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Поставить реакцию на сообщение"]')?.click());
    expect(host.querySelectorAll('div[aria-label="Выбор реакции"] button')).toHaveLength(7);
    const emojiButton = host.querySelector<HTMLButtonElement>(
      'div[aria-label="Выбор реакции"] button',
    );
    expect(emojiButton).not.toBeNull();
    expect(emojiButton?.getAttribute("aria-label")).toContain("👍");
    expect(emojiButton?.disabled).toBe(false);
    await act(async () => {
      emojiButton?.click();
      await Promise.resolve();
    });
    await vi.waitFor(() =>
      expect(scenario.react).toHaveBeenCalledWith("direct-room", "message-one", "👍"));
  });

  it("shows the other participant's avatar in the list and room, then falls back on image error", async () => {
    const avatarUrl = "https://static.example.test/images/target.webp";
    scenario.rooms = [
      {
        id: "direct-room",
        kind: "DIRECT",
        name: "",
        unreadCount: 0,
        lastMessage: null,
        members: [
          { userId: "local-test-owner", username: "qa", role: "MEMBER", avatarUrl: null },
          { userId: "target", username: "teamb", role: "MEMBER", avatarUrl },
        ],
      },
    ];
    await render();
    await vi.waitFor(() =>
      expect(
        host.querySelector(
          'button[class*="chatRow"] img[src="https://static.example.test/images/target.webp"]',
        ),
      ).not.toBeNull(),
    );
    const { navigate } = await import("../../shared/router/location");
    await act(async () => navigate("/chats/direct-room"));
    const header = host.querySelector("header[class*='roomHeader']");
    expect(
      header?.querySelector('img[src="https://static.example.test/images/target.webp"]'),
    ).not.toBeNull();
    await act(async () => {
      header?.querySelector("img")?.dispatchEvent(new Event("error"));
    });
    expect(header?.querySelector("img")).toBeNull();
    expect(header?.textContent).toContain("👤");
  });

  it("shows the message sender's profile photo in a community, with fallback on failure", async () => {
    const avatarUrl = "https://static.example.test/images/admin.webp";
    scenario.rooms = [{
      id: "direct-room", kind: "COMMUNITY", name: "Общий чат GAFUS",
      unreadCount: 0, lastMessage: null,
      members: [
        { userId: "local-test-owner", username: "qa", role: "MEMBER", avatarUrl: null },
        { userId: "target", username: "admin", role: "MEMBER", avatarUrl },
        { userId: "without-avatar", username: "guest", role: "MEMBER", avatarUrl: null },
      ],
    }];
    scenario.timeline = ["target", "without-avatar"].map((authorId, index) => ({
      id: "group-message-" + index,
      conversationId: "direct-room",
      sequence: String(index + 1),
      authorId,
      clientMessageId: "test-" + index,
      text: "Привет",
      replyToId: null,
      createdAt: "2026-10-27T09:00:00Z",
      editedAt: null,
      deletedAt: null,
      attachments: [],
    }));
    await render();
    const { navigate } = await import("../../shared/router/location");
    await act(async () => navigate("/chats/direct-room"));
    // querySelectorAll returns a STATIC NodeList; acquire it only after async
    // route/message rendering has completed, rather than waiting on a snapshot.
    await vi.waitFor(() =>
      expect(host.querySelectorAll('div[class*="message_"]').length).toBe(2));
    const bubbles = host.querySelectorAll('div[class*="message_"]');
    const photo = bubbles[0].querySelector<HTMLImageElement>('span[class*="miniAvatar_"] img');
    expect(photo?.getAttribute("src")).toBe(avatarUrl);
    expect(bubbles[1].querySelector('span[class*="miniAvatar_"] img')).toBeNull();
    expect(bubbles[1].querySelector('span[class*="miniAvatar_"]')?.textContent).toBe("👤");
    await act(async () => photo?.dispatchEvent(new Event("error")));
    expect(bubbles[0].querySelector('span[class*="miniAvatar_"] img')).toBeNull();
    expect(bubbles[0].querySelector('span[class*="miniAvatar_"]')?.textContent).toBe("👤");
  });

  it("keeps the group icon when no group photo exists", async () => {
    scenario.rooms = [
      {
        id: "group-room",
        kind: "GROUP",
        name: "Группа",
        unreadCount: 0,
        lastMessage: null,
        members: [
          { userId: "local-test-owner", username: "qa", role: "MEMBER", avatarUrl: null },
          {
            userId: "target",
            username: "teamb",
            role: "MEMBER",
            avatarUrl: "https://static.example.test/other.png",
          },
        ],
      },
    ];
    await render();
    await vi.waitFor(() => expect(host.querySelector('button[class*="chatRow"]')).not.toBeNull());
    expect(host.querySelector('button[class*="chatRow"] img')).toBeNull();
    expect(host.querySelector('button[class*="chatRow"]')?.textContent).toContain("👥");
  });

  it("opens the deep link with only one POST when React StrictMode replays effects", async () => {
    window.history.replaceState(null, "", "/chats?to=teamb");
    await render(true);
    await vi.waitFor(() => expect(window.location.pathname).toBe("/chats/direct-room"));
    expect(scenario.directByUsername).toHaveBeenCalledOnce();
  });

  it("shows a retry button on timeout and opens the room on a second attempt", async () => {
    scenario.directByUsername
      .mockRejectedValueOnce(new DOMException("The operation timed out", "TimeoutError"))
      .mockResolvedValueOnce({ conversationId: "direct-room" });
    await render();
    const { navigate } = await import("../../shared/router/location");
    await act(async () => {
      navigate("/chats?to=teamb" as Parameters<typeof navigate>[0]);
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось открыть переписку"));
    expect(host.textContent).toContain("Сервер чата долго не отвечает");
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Повторить"),
    );
    expect(retry).toBeTruthy();
    await act(async () => {
      retry?.click();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(window.location.pathname).toBe("/chats/direct-room"));
    expect(scenario.directByUsername).toHaveBeenCalledTimes(2);
    expect(host.querySelector('textarea[aria-label="Текст сообщения"]')).not.toBeNull();
  });

  it("allows composing, sending and displaying a message after a direct profile link", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "32a9200f-30a5-4baa-a1e5-a00179ead539" });
    await render();
    const { navigate } = await import("../../shared/router/location");
    await act(async () => {
      navigate("/chats?to=teamb" as Parameters<typeof navigate>[0]);
      await Promise.resolve();
    });
    await vi.waitFor(() =>
      expect(host.querySelector('textarea[aria-label="Текст сообщения"]')).not.toBeNull(),
    );
    const input = host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Текст сообщения"]',
    )!;
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setValue?.call(input, "Привет из личного чата");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Отправить сообщение"]')?.click();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(scenario.sent).toHaveBeenCalledOnce());
    expect(scenario.sent.mock.calls[0][0]).toBe("direct-room");
    expect(scenario.sent.mock.calls[0][1]).toMatchObject({
      text: "Привет из личного чата",
      clientMessageId: "32a9200f-30a5-4baa-a1e5-a00179ead539",
    });
    await vi.waitFor(() => expect(host.textContent).toContain("Привет из личного чата"));
  });

  it("leaves a recoverable visible error when a recipient is unavailable", async () => {
    scenario.directByUsername.mockRejectedValue(new Error("Пользователь не найден"));
    await render();
    const { navigate } = await import("../../shared/router/location");
    await act(async () => {
      navigate("/chats?to=missing" as Parameters<typeof navigate>[0]);
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(host.querySelector('[role="alert"]')?.textContent).toContain("Пользователь не найден");
    });
    expect(window.location.pathname).toBe("/chats");
  });

  it("inherits the shared Back/Menu header and centered SVG controls", async () => {
    await render();
    expect(
      host.querySelector('header[role="banner"] button[data-gafus-shared-button="back"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('header[role="banner"] button[aria-label="Открыть меню"]'),
    ).not.toBeNull();
    for (const label of ["Новое сообщение", "Создать группу"]) {
      const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      expect(button).not.toBeNull();
      expect(button?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
    const chat = host.querySelector('[aria-label="Сообщения GAFUS"]');
    expect(chat).not.toBeNull();
    // Chat 2.0 must not inherit the narrow 1040px content shell alone.
    const page = chat?.closest("main.shell");
    expect(page).not.toBeNull();
    expect(page?.classList.length).toBeGreaterThan(1);
  });

  it("shows the cynologist entitlement rejection in the visible list", async () => {
    scenario.cynologist.mockRejectedValue(new Error("Чат с кинологом недоступен по тарифу"));
    await render();
    await act(async () => {
      const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
        b.textContent?.includes("Чат с кинологом"),
      );
      expect(button?.disabled).toBe(false);
      button?.click();
      await Promise.resolve();
    });
    expect(scenario.cynologist).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Чат с кинологом недоступен по тарифу",
    );
  });

  it("routes trainer's shortcut to own assigned dialogs, never client creation", async () => {
    scenario.role = "TRAINER";
    scenario.rooms = [
      {
        id: "cyno-test",
        kind: "CYNOLOGIST",
        name: "",
        members: [],
        unreadCount: 0,
        lastMessage: null,
      },
      {
        id: "group-test",
        kind: "GROUP",
        name: "Группа",
        members: [],
        unreadCount: 0,
        lastMessage: null,
      },
    ];
    await render();
    const shortcut = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Диалоги с клиентами"),
    );
    expect(shortcut).toBeTruthy();
    await act(async () => shortcut?.click());
    expect(scenario.cynologist).not.toHaveBeenCalled();
    expect(host.querySelector('button[aria-pressed="true"]')?.textContent).toContain("Кинолог");
    expect(host.querySelectorAll('button[class*="chatRow"]')).toHaveLength(1);
  });
});
