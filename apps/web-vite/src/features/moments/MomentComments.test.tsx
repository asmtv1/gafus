// @vitest-environment jsdom
import { withRejectedRefreshCookie } from "../../test/rejectedRefreshCookie";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentComments } from "./MomentComments";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const author = { id: "private-author", username: "trainer", name: "Кинолог",
  role: "TRAINER", avatarUrl: "https://private.example/signed-avatar" };
const comment = {
  id: "comment-1", postId: "post-1", text: "Хороший совет",
  createdAt: "2026-10-16T12:00:00.000Z",
  author, rootId: null, replyToName: null, replyToId: null,
  deleted: false, replyCount: 0, canEdit: false, canDelete: false,
  myReaction: null, reactions: [],
};
function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200, data, error: "Server temporarily unavailable",
  }), { status });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function mount(fetcher: ReturnType<typeof vi.fn>) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", withRejectedRefreshCookie(fetcher));
  vi.stubGlobal("crypto", { randomUUID: () => UUID });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
    createElement(MomentComments, { userId: "viewer-1", postId: "post-1" }),
  )));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  return {
    host, cache,
    async rerender(userId: string, postId: string) {
      await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
        createElement(MomentComments, { userId, postId }))));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    },
    async fill(value: string) {
      const input = host.querySelector<HTMLTextAreaElement>("textarea")!;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      await act(async () => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    async submit() {
      await act(async () => host.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    },
    async more() {
      const button = Array.from(host.querySelectorAll("button"))
        .find(value => value.textContent?.includes("Ещё комментарии"));
      expect(button).toBeDefined();
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    },
    async cleanup() {
      await act(async () => root.unmount()); cache.clear(); host.remove();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("Web Moments comments with shared Core", () => {
  it("shows an indeterminate progress bar while comment attachments are processing", async () => {
    const pendingComment = { ...comment, createdAt: new Date().toISOString(), media: [
      { id: "photo-1", kind: "photo", status: "processing" },
      { id: "video-1", kind: "video", status: "uploaded" },
    ] };
    let state: "processing" | "failed" | "ready" = "processing";
    const fake = vi.fn(async () => envelope({ items: [{
      ...pendingComment,
      media: pendingComment.media.map(item => ({ ...item, status: state })),
    }], nextCursor: null }));
    const ui = await mount(fake);
    try {
      const progress = ui.host.querySelector<HTMLElement>(
        '[role="progressbar"][aria-label="Обработка медиа в комментарии"]',
      );
      expect(progress).not.toBeNull();
      expect(progress?.hasAttribute("aria-valuenow")).toBe(false);
      expect(progress?.getAttribute("aria-valuetext"))
        .toContain("процент пока неизвестен");
      expect(progress?.querySelector(".moment-comment-processing-bar")).not.toBeNull();
      expect(ui.host.textContent).toContain("Обрабатываем 2 вложения");
      expect(ui.host.textContent).toContain("Фото или видео появится здесь после обработки");
      expect(fake).toHaveBeenCalledTimes(1);
      state = "failed";
      await act(async () => ui.cache.invalidateQueries({
        queryKey: ["moments", "comments", "viewer-1", "post-1"],
      }));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.querySelector('[role="progressbar"]')).toBeNull();
      expect(ui.host.textContent).toContain("Не удалось обработать одно из вложений");
      state = "ready";
      await act(async () => ui.cache.invalidateQueries({
        queryKey: ["moments", "comments", "viewer-1", "post-1"],
      }));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.querySelector('[role="progressbar"]')).toBeNull();
      expect(ui.host.textContent).not.toContain("Не удалось обработать одно из вложений");
    } finally { await ui.cleanup(); }
  });

  it("shows a single-item processing bar without manufacturing completion percent", async () => {
    const fake = vi.fn(async () => envelope({ items: [{
      ...comment, createdAt: new Date().toISOString(),
      media: [{ id: "photo-1", kind: "photo", status: "reserved" }],
    }], nextCursor: null }));
    const ui = await mount(fake);
    try {
      expect(ui.host.textContent).toContain("Обрабатываем 1 вложение");
      const bar = ui.host.querySelector('[role="progressbar"]');
      expect(bar).not.toBeNull();
      expect(bar?.hasAttribute("aria-valuenow")).toBe(false);
      expect(ui.host.textContent).not.toContain("100%");
    } finally { await ui.cleanup(); }
  });

  it("replaces a stale endless spinner with a delayed-processing explanation", async () => {
    const fake = vi.fn(async () => envelope({ items: [{
      ...comment, createdAt: "2026-10-16T12:00:00.000Z",
      media: [{ id: "photo-1", kind: "photo", status: "uploaded" }],
    }], nextCursor: null }));
    const ui = await mount(fake);
    try {
      expect(ui.host.textContent).toContain("Обработка вложений задерживается");
      expect(ui.host.querySelector('[role="progressbar"]')).toBeNull();
      expect(ui.host.textContent).toContain("Комментарий сохранён");
    } finally { await ui.cleanup(); }
  });

  it("lists comments with pagination, removes duplicate IDs and private author fields", async () => {
    const fake = vi.fn((path: string) => Promise.resolve(
      envelope(path.includes("cursor=next_cursor")
        ? { items: [comment, { ...comment, id: "comment-2", text: "Второй" }],
          nextCursor: null }
        : { items: [comment], nextCursor: "next_cursor" }),
    ));
    const ui = await mount(fake);
    try {
      expect(ui.host.textContent).toContain("Хороший совет");
      expect(ui.host.textContent).toContain("Кинолог");
      expect(ui.host.innerHTML).not.toContain("private-author");
      expect(JSON.stringify(ui.cache.getQueryData([
        "moments", "comments", "viewer-1", "post-1",
      ]))).not.toMatch(/private-author|private.example/);
      await ui.more();
      expect(ui.host.querySelectorAll(".compact-grid > li")).toHaveLength(2);
      expect(ui.host.textContent).toContain("Второй");
      expect(fake.mock.calls[1][0]).toContain("cursor=next_cursor");
    } finally { await ui.cleanup(); }
  });

  it.each([
    [401, "Сессия завершена. Войдите снова."],
    [403, "Нет доступа к комментариям."],
    [404, "Комментарии недоступны."],
  ])("MC-R01 comments page2 HTTP%s denies old list/form", async (code, message) => {
    const fake = vi.fn((path: string, options?: RequestInit) => {
      if (options?.method && options.method !== "GET") throw Error("READ_ONLY_TEST");
      return Promise.resolve(path.includes("cursor=next_cursor")
        ? envelope(null, code)
        : envelope({ items: [comment], nextCursor: "next_cursor" }));
    });
    const ui = await mount(fake);
    try {
      expect(ui.host.textContent).toContain("Хороший совет");
      expect(ui.host.querySelector("form")).not.toBeNull();
      await ui.more();
      expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain(message);
      expect(ui.host.textContent).not.toContain("Хороший совет");
      expect(ui.host.querySelector("ul.compact-grid")).toBeNull();
      expect(ui.host.textContent).not.toContain("Ответить");
      expect(ui.host.querySelector("form")).toBeNull();
      expect(ui.host.querySelector("textarea")).toBeNull();
      expect(ui.host.textContent).not.toContain("Комментариев пока нет");
      expect(ui.host.textContent).not.toContain("Server temporarily unavailable");
      expect([...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .some(b => b.textContent?.includes("Ещё комментарии") ||
          b.textContent?.includes("Повторить"))).toBe(false);
      expect(ui.host.querySelector('a[href="/login"]') !== null).toBe(code === 401);
      expect(fake.mock.calls.map(([url]) => url)).toEqual([
        "/api/v1/feed/posts/post-1/comments?pageSize=20",
        "/api/v1/feed/posts/post-1/comments?cursor=next_cursor&pageSize=20",
      ]);
      expect(fake.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
    } finally { await ui.cleanup(); }
  });

  it.each([
    [401, "Сессия завершена. Войдите снова."],
    [403, "Нет доступа к комментариям."],
    [404, "Комментарии недоступны."],
  ])("MC-R02 comments page1 HTTP%s denies composer", async (code, message) => {
    const fake = vi.fn().mockResolvedValue(envelope(null, code));
    const ui = await mount(fake);
    try {
      expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain(message);
      expect(ui.host.querySelector("form")).toBeNull();
      expect(ui.host.querySelector("ul.compact-grid")).toBeNull();
      expect(ui.host.textContent).not.toContain("Комментариев пока нет");
      expect([...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .some(b => b.textContent?.includes("Повторить") ||
          b.textContent?.includes("Ещё комментарии"))).toBe(false);
      expect(ui.host.querySelector('a[href="/login"]') !== null).toBe(code === 401);
      expect(fake).toHaveBeenCalledTimes(1);
    } finally { await ui.cleanup(); }
  });

  it("MC-R03 comments page2 503 keeps old page and retries same cursor", async () => {
    let second = 0;
    const fake = vi.fn((path: string) => Promise.resolve(path.includes("cursor=next_cursor")
      ? ++second === 1 ? envelope(null, 503) : envelope({
        items: [comment, { ...comment, id: "comment-2", text: "Второй комментарий" }],
        nextCursor: null,
      }) : envelope({ items: [comment], nextCursor: "next_cursor" })));
    const ui = await mount(fake);
    try {
      await ui.more();
      expect(ui.host.textContent).toContain("Хороший совет");
      expect(ui.host.querySelector("form")).not.toBeNull();
      expect(ui.host.textContent).toContain("Не удалось загрузить следующую страницу комментариев");
      const retry = [...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .find(b => b.textContent === "Повторить страницу комментариев");
      expect(retry).toBeDefined();
      await act(async () => retry?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.querySelectorAll("ul.compact-grid > li")).toHaveLength(2);
      expect(ui.host.textContent?.match(/Хороший совет/g)).toHaveLength(1);
      expect(ui.host.textContent).toContain("Второй комментарий");
      expect(fake.mock.calls.map(([url]) => url)).toEqual([
        "/api/v1/feed/posts/post-1/comments?pageSize=20",
        "/api/v1/feed/posts/post-1/comments?cursor=next_cursor&pageSize=20",
        "/api/v1/feed/posts/post-1/comments?cursor=next_cursor&pageSize=20",
      ]);
      expect(fake.mock.calls.every(([url]) =>
        url.startsWith("/api/v1/feed/posts/post-1/comments?"))).toBe(true);
      expect(second).toBe(2);
    } finally { await ui.cleanup(); }
  });

  it.each(["next", "retry"])("MC-FLIGHT-PRE comments two same-turn %s clicks use one cursor GET", async mode => {
    const pending = deferred<Response>();
    let second = 0;
    const fake = vi.fn((path: string, opts?: RequestInit) => {
      if (opts?.method && opts.method !== "GET") throw Error("READ_ONLY_EXPECTED");
      if (!path.includes("cursor=next_cursor"))
        return Promise.resolve(envelope({ items: [comment], nextCursor: "next_cursor" }));
      second++;
      return mode === "retry" && second === 1 ? Promise.resolve(envelope(null, 503)) : pending.promise;
    });
    const ui = await mount(fake);
    try {
      if (mode === "retry") await ui.more();
      const label = mode === "next" ? "Ещё комментарии" : "Повторить страницу комментариев";
      const button = [...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .find(node => node.textContent?.trim() === label);
      expect(button).toBeDefined();
      await act(async () => { button?.click(); button?.click(); });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(fake.mock.calls.filter(([path]) => path.includes("cursor=next_cursor")))
        .toHaveLength(mode === "retry" ? 2 : 1);
      expect(ui.host.textContent).toContain("Хороший совет");
      expect(ui.host.querySelector("form")).not.toBeNull();
      await act(async () => pending.resolve(envelope({
        items: [comment, { ...comment, id: "comment-2", text: "Второй ответ" }], nextCursor: null,
      })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.querySelectorAll("ul.compact-grid > li")).toHaveLength(2);
      expect(ui.host.textContent?.match(/Хороший совет/g)).toHaveLength(1);
      expect(ui.host.textContent).toContain("Второй ответ");
      expect(fake.mock.calls.every(([, opts]) => opts?.method !== "POST")).toBe(true);
    } finally { await ui.cleanup(); }
  });

  it("MC-FLIGHT-IDENTITY pending old post cannot block new post or publish old data", async () => {
    const old = deferred<Response>();
    const current = deferred<Response>();
    const fake = vi.fn((path: string) => {
      const isNew = path.includes("/post-2/");
      if (!path.includes("cursor=next_cursor")) return Promise.resolve(envelope({
        items: [{ ...comment, postId: isNew ? "post-2" : "post-1", id: isNew ? "new-1" : "comment-1",
          text: isNew ? "Новый пост комментарий" : "Хороший совет" }],
        nextCursor: "next_cursor",
      }));
      return isNew ? current.promise : old.promise;
    });
    const ui = await mount(fake);
    try {
      await ui.more();
      await ui.rerender("viewer-2", "post-2");
      expect(ui.host.textContent).toContain("Новый пост комментарий");
      await ui.more();
      const busy = () => [...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .some(node => node.disabled && node.textContent?.includes("Загрузка"));
      expect(busy()).toBe(true);
      await act(async () => old.resolve(envelope({
        items: [{ ...comment, text: "PRIVATE_OLD_POST" }], nextCursor: null,
      })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.textContent).not.toContain("PRIVATE_OLD_POST");
      expect(busy()).toBe(true);
      await act(async () => current.resolve(envelope({
        items: [{ ...comment, postId: "post-2", id: "new-2", text: "Только новый комментарий" }],
        nextCursor: null,
      })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.textContent).toContain("Только новый комментарий");
      expect(ui.host.textContent).not.toContain("PRIVATE_OLD_POST");
      expect(fake.mock.calls.map(([path]) => path.includes("cursor=next_cursor")))
        .toEqual([false, true, false, true]);
    } finally { await ui.cleanup(); }
  });

  it("success confirms comment, refetches server and clears composer", async () => {
    let published = false;
    const fake = vi.fn((path: string, options?: RequestInit) => Promise.resolve(
      options?.method === "POST"
        ? (published = true, envelope({ id: "comment-1", postId: "post-1" }))
        : envelope({
          items: published ? [comment] : [], nextCursor: null,
        }),
    ));
    const ui = await mount(fake);
    try {
      await ui.fill("Спасибо за информацию");
      await ui.submit();
      const write = fake.mock.calls.find(call => call[1]?.method === "POST");
      expect(write?.[0]).toBe("/api/v1/feed/posts/post-1/comments");
      expect(JSON.parse(String(write?.[1]?.body))).toEqual({
        text: "Спасибо за информацию", clientRequestId: UUID,
      });
      expect(ui.host.textContent).toContain("Хороший совет");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("");
      expect(fake.mock.calls.filter(call => call[1]?.method !== "POST").length)
        .toBeGreaterThan(1);
    } finally { await ui.cleanup(); }
  });

  it("shows a compact accessible editor and opens hidden file chooser from paperclip", async () => {
    const fake = vi.fn().mockResolvedValue(envelope({ items: [], nextCursor: null }));
    const ui = await mount(fake);
    try {
      const form = ui.host.querySelector<HTMLFormElement>("form.moment-comment-composer");
      expect(form).not.toBeNull();
      expect(form?.querySelector(".moment-comment-composer-bar textarea")).not.toBeNull();
      expect(form?.querySelector(".moment-comment-send[aria-label='Отправить комментарий']")).not.toBeNull();
      const fileInput = form?.querySelector<HTMLInputElement>("input.moment-comment-file-input");
      expect(fileInput).not.toBeNull();
      const openDialog = vi.spyOn(fileInput!, "click").mockImplementation(() => undefined);
      const button = form!.querySelector<HTMLButtonElement>(
        "button[aria-label='Прикрепить фото или видео к комментарию']",
      );
      expect(button?.type).toBe("button");
      await act(async () => button?.click());
      expect(openDialog).toHaveBeenCalledTimes(1);
    } finally { await ui.cleanup(); }
  });

  it("uploads a media-only comment through shared S3 POST and links mediaId", async () => {
    const selected = new File(["photo-bytes"], "dog.webp", { type: "image/webp" });
    const ticket = {
      uploadId: "upload-1", mediaId: "photo-1", postId: "post-1",
      kind: "photo", status: "reserved",
      postUrl: "https://test-storage.invalid/upload",
      postFields: { key: "posts/viewer-1/post-1/incoming/file" },
      urlExpiresAt: "2099-12-30T00:00:00.000Z",
      reservationExpiresAt: "2099-12-31T00:00:00.000Z",
    };
    const sent: FormData[] = [];
    class FakeUpload {
      upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
      status = 204;
      withCredentials = false;
      timeout = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      open() {}
      send(data: FormData) { sent.push(data); this.onload?.(); }
    }
    vi.stubGlobal("XMLHttpRequest", FakeUpload);
    let publish: RequestInit | undefined;
    const fake = vi.fn((path: string, options?: RequestInit) => {
      if (path.endsWith("/uploads") && options?.method === "POST")
        return Promise.resolve(envelope(ticket));
      if (path.endsWith("/complete"))
        return Promise.resolve(envelope({
          ...ticket, status: "processing", postUrl: null, postFields: null,
        }));
      if (path.endsWith("/comments") && options?.method === "POST") {
        publish = options;
        return Promise.resolve(envelope({ id: "comment-1", postId: "post-1" }));
      }
      return Promise.resolve(envelope({ items: [], nextCursor: null }));
    });
    const ui = await mount(fake);
    try {
      const picker = ui.host.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(picker, "files", { configurable: true, value: [selected] });
      await act(async () => picker.dispatchEvent(new Event("change", { bubbles: true })));
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.required).toBe(false);
      await ui.submit();
      const reserve = fake.mock.calls.find(call => call[0].endsWith("/uploads"));
      expect(JSON.parse(String(reserve?.[1]?.body))).toMatchObject({
        purpose: "comment", filename: "dog.webp", kind: "photo",
      });
      expect(sent).toHaveLength(1);
      expect(sent[0]?.get("file")).toBeInstanceOf(File);
      expect(JSON.parse(String(publish?.body))).toMatchObject({
        text: "", mediaIds: ["photo-1"],
      });
      expect(ui.host.querySelector<HTMLInputElement>('input[type="file"]')?.disabled).toBe(false);
    } finally { await ui.cleanup(); }
  });

  it("retrying after 503 reuses UUID and retains text without optimistic additions", async () => {
    let writes = 0;
    const fake = vi.fn((_path: string, options?: RequestInit) => Promise.resolve(
      options?.method === "POST"
        ? (++writes === 1 ? envelope(null, 503)
          : envelope({ id: "comment-1", postId: "post-1" }))
        : envelope({ items: [], nextCursor: null }),
    ));
    const ui = await mount(fake);
    try {
      await ui.fill("Не потерять комментарий");
      await ui.submit();
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось отправить комментарий");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Не потерять комментарий");
      expect(ui.host.textContent).not.toContain("Хороший совет");
      await ui.submit();
      const attempts = fake.mock.calls.filter(call => call[1]?.method === "POST");
      expect(attempts).toHaveLength(2);
      expect(attempts.map(call => JSON.parse(String(call[1]?.body)).clientRequestId))
        .toEqual([UUID, UUID]);
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("");
    } finally { await ui.cleanup(); }
  });

  it("HTTP failures show an alert, not an invented empty comment list", async () => {
    const ui = await mount(vi.fn().mockResolvedValue(envelope(null, 503)));
    try {
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось загрузить комментарии");
      expect(ui.host.textContent).not.toContain("Комментариев пока нет");
    } finally { await ui.cleanup(); }
  });
});

// SOC041_COMMENT_TEXT_ADD — real existing composer, synthetic fetch only.
const commentPosts = (fetcher: ReturnType<typeof vi.fn>) =>
  fetcher.mock.calls.filter(call => (call[1] as RequestInit | undefined)?.method === "POST");
async function doubleSubmit(host: HTMLElement) {
  await act(async () => {
    const form = host.querySelector("form");
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}
function replyButton(host: HTMLElement, name = "Ответить") {
  const result = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(button => button.textContent?.trim() === name);
  if (!result) throw Error("Comment reply control missing: " + name);
  return result;
}

describe("SOC041_COMMENT_TEXT_ADD existing root and nested reply submission", () => {
  it.each(["root", "reply"])("%s two same-turn submits generate one POST before ACK", async mode => {
    const pending = deferred<Response>();
    const fake = vi.fn((_url: string, init?: RequestInit) => init?.method === "POST"
      ? pending.promise : Promise.resolve(envelope({ items: [comment], nextCursor: null })));
    const ui = await mount(fake);
    try {
      if (mode === "reply") {
        await act(async () => replyButton(ui.host).click());
        expect(ui.host.textContent).toContain("Ответ для Кинолог");
      }
      await ui.fill(mode === "root" ? "Новый обычный комментарий" : "Вложенный ответ");
      await doubleSubmit(ui.host);
      const writes = commentPosts(fake);
      expect(writes).toHaveLength(1);
      expect(writes[0][0]).toBe("/api/v1/feed/posts/post-1/comments");
      expect(JSON.parse(String(writes[0][1]?.body))).toEqual({
        text: mode === "root" ? "Новый обычный комментарий" : "Вложенный ответ",
        ...(mode === "reply" ? { replyToId: "comment-1" } : {}),
        clientRequestId: UUID,
      });
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe(mode === "root" ? "Новый обычный комментарий" : "Вложенный ответ");
      await act(async () => pending.resolve(envelope({ id: "comment-created", postId: "post-1" })));
      await act(async () => { await new Promise(done => setTimeout(done, 28)); });
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("");
    } finally { await ui.cleanup(); }
  });

  it("pending old root ACK does not erase new nested reply target or its draft", async () => {
    const pending = deferred<Response>();
    const fake = vi.fn((_url: string, init?: RequestInit) => init?.method === "POST"
      ? pending.promise : Promise.resolve(envelope({ items: [comment], nextCursor: null })));
    const ui = await mount(fake);
    try {
      await ui.fill("OLD_ROOT_DRAFT");
      await ui.submit();
      expect(commentPosts(fake)).toHaveLength(1);
      await act(async () => replyButton(ui.host).click());
      await ui.fill("NEW_NESTED_DRAFT");
      expect(ui.host.textContent).toContain("Ответ для Кинолог");
      await act(async () => pending.resolve(envelope({ id: "old-comment", postId: "post-1" })));
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("NEW_NESTED_DRAFT");
      expect(ui.host.textContent).toContain("Ответ для Кинолог");
      expect(commentPosts(fake)).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("retired old owner/post pending POST cannot erase new owner's draft or invalidate its keys", async () => {
    const old = deferred<Response>();
    const latest = deferred<Response>();
    const fake = vi.fn((url: string, init?: RequestInit) => init?.method === "POST"
      ? (url.includes("post-2") ? latest.promise : old.promise)
      : Promise.resolve(envelope({ items: [{ ...comment,
        postId: url.includes("post-2") ? "post-2" : "post-1",
        id: url.includes("post-2") ? "comment-2" : "comment-1",
      }], nextCursor: null })));
    const ui = await mount(fake);
    const invalidate = vi.spyOn(ui.cache, "invalidateQueries");
    try {
      await ui.fill("PRIVATE_OLD_OWNER_COMMENT");
      await ui.submit();
      expect(commentPosts(fake)).toHaveLength(1);
      await ui.rerender("viewer-2", "post-2");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("");
      await ui.fill("NEW_OWNER_COMMENT");
      await act(async () => ui.host.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ));
      expect(commentPosts(fake)).toHaveLength(2);
      await act(async () => old.resolve(envelope({ id: "old-comment", postId: "post-1" })));
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("NEW_OWNER_COMMENT");
      expect(invalidate).not.toHaveBeenCalledWith({
        queryKey: ["moments", "comments", "viewer-2", "post-2"],
      });
      await act(async () => latest.resolve(envelope({ id: "new-comment", postId: "post-2" })));
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("");
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["moments", "comments", "viewer-2", "post-2"],
      });
    } finally { await ui.cleanup(); }
  });

  it("unknown nested reply ACK preserves original UUID until explicit retry", async () => {
    let count = 0;
    const fake = vi.fn((_url: string, init?: RequestInit) => Promise.resolve(
      init?.method === "POST" ? ++count === 1 ? envelope(null, 503)
        : envelope({ id: "comment-created", postId: "post-1" })
        : envelope({ items: [comment], nextCursor: null }),
    ));
    const ui = await mount(fake);
    try {
      await act(async () => replyButton(ui.host).click());
      await ui.fill("Текст не терять");
      await ui.submit();
      expect(count).toBe(1);
      expect(ui.host.textContent).toContain("Не удалось отправить комментарий");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Текст не терять");
      expect(ui.host.textContent).toContain("Ответ для Кинолог");
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      expect(count).toBe(1);
      await ui.submit();
      expect(commentPosts(fake)).toHaveLength(2);
      expect(commentPosts(fake).map(call => JSON.parse(String(call[1]?.body)))).toEqual([
        { text: "Текст не терять", replyToId: "comment-1", clientRequestId: UUID },
        { text: "Текст не терять", replyToId: "comment-1", clientRequestId: UUID },
      ]);
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("");
    } finally { await ui.cleanup(); }
  });
});
