// @vitest-environment jsdom
vi.mock("../../shared/media/browserPhotoWebp",()=>({
  prepareBrowserPhotoWebp:vi.fn(async(_original:File,edges:Record<string,number>)=>
    Object.fromEntries(Object.entries(edges).map(([name,edge])=>[
      name,{file:new File([new Uint8Array(128)],name+".webp",{type:"image/webp"}),
        width:edge,height:Math.round(edge*.75)},
    ]))),
}));
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentEditPublishedText } from "./MomentEditPublishedText";
import { MomentDetails } from "./MomentDetails";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const published = {
  id: "post-1", status: "published", text: "Старый текст",
  version: 1, canEdit: true, attachments: [{
    id: "photo-1", kind: "photo", status: "ready",
    fullUrl: "https://signed.example/secret",
  }], pendingRevision: null,
};
const pending = {
  ...published, version: 2, pendingRevision: {
    status: "draft", text: "Новый текст", attachmentIds: ["photo-1"],
  },
};
function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200, data, error: "Core denied",
  }), { status });
}
async function mount(
  fake: ReturnType<typeof vi.fn>,
  element: React.ReactElement = createElement(MomentEditPublishedText, {
    userId: "viewer", postId: "post-1",
  }),
) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fake);
  vi.stubGlobal("crypto", { randomUUID: () => UUID });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(createElement(
    QueryClientProvider, { client: cache }, element,
  )));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  return {
    host, cache,
    async rerender(userId: string, postId: string) {
      await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
        createElement(MomentEditPublishedText, { userId, postId }))));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    },
    async click(label: string) {
      const button = Array.from(host.querySelectorAll("button"))
        .find(item => item.textContent?.includes(label));
      expect(button).toBeDefined();
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    },
    async fill(value: string) {
      const target = host.querySelector<HTMLTextAreaElement>("textarea")!;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype, "value",
      )!.set!;
      await act(async () => {
        setter.call(target, value);
        target.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    async submit() {
      await act(async () => host.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    },
    async cleanup() {
      await act(async () => root.unmount()); cache.clear(); host.remove();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("published Moments owner text editor UI", () => {
  it("loads owned editor, retains media, publishes revision in two explicit server steps", async () => {
    let saved = false;
    let sent = false;
    const fake = vi.fn((path: string, options?: RequestInit) => Promise.resolve(
      options?.method === "PUT"
        ? (saved = true, ok(pending))
        : options?.method === "POST"
          ? (sent = true, ok({ ...pending, pendingRevision: {
            ...pending.pendingRevision, status: "pending",
          } }))
          : path.endsWith("/editor")
            ? ok(sent ? { ...pending, pendingRevision: {
              ...pending.pendingRevision, status: "pending",
            } } : saved ? pending : published)
            : ok(null, 404),
    ));
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать текст");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Старый текст");
      await ui.fill("Новый текст");
      await ui.submit();
      const save = fake.mock.calls.find(call => call[1]?.method === "PUT");
      expect(save?.[0]).toBe("/api/v1/feed/posts/post-1/revisions");
      expect(JSON.parse(String(save?.[1]?.body))).toEqual({
        clientRequestId: UUID, text: "Новый текст",
        expectedVersion: 1, attachmentIds: ["photo-1"],
      });
      expect(fake.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(0);
      await ui.click("Опубликовать изменения");
      expect(fake.mock.calls.some(call => call[0].endsWith("/publish"))).toBe(true);
      expect(ui.host.textContent).toContain("Новая редакция обрабатывается сервером");
      expect(ui.host.querySelector('button[type="submit"]')).toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("reorders and removes attached media using one versioned revision and a separate publish", async () => {
    const two = { ...published, attachments: [
      ...published.attachments, { id: "video-1", kind: "video", status: "ready" },
    ] };
    let savedBody: Record<string, unknown> | null = null;
    const fake = vi.fn((_path: string, options?: RequestInit) => Promise.resolve(
      options?.method === "PUT"
        ? (savedBody = JSON.parse(String(options.body)) as Record<string, unknown>,
          ok({ ...two, version: 2, pendingRevision: {
            status: "draft", text: "Старый текст", attachmentIds: savedBody.attachmentIds,
          } }))
        : savedBody ? ok({ ...two, version: 2, pendingRevision: {
            status: "draft", text: "Старый текст", attachmentIds: savedBody.attachmentIds,
          } }) : ok(two),
    ));
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать текст");
      expect(ui.host.querySelectorAll(".moment-edit-attachments li")).toHaveLength(2);
      await act(async () => ui.host.querySelector<HTMLButtonElement>(
        '[aria-label="Переместить вложение 2 вверх"]')?.click());
      await act(async () => ui.host.querySelector<HTMLButtonElement>(
        '[aria-label="Убрать вложение 2"]')?.click());
      await ui.submit();
      expect(savedBody).toMatchObject({
        expectedVersion: 1, text: "Старый текст", attachmentIds: ["video-1"],
      });
      expect(fake.mock.calls.filter(call => call[1]?.method === "PUT")).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("uploads added photo directly to signed S3 before saving the revised media list", async () => {
    let savedBody: Record<string, unknown> | null = null;
    const uploadCalls: string[] = [];
    class FakeStorageXHR {
      upload = { onprogress: null as null | ((event: ProgressEvent) => void) };
      status = 204;
      timeout = 0;
      withCredentials = false;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      ontimeout: null | (() => void) = null;
      open(method: string, url: string) {
        expect(method).toBe("POST");
        expect(url).toContain("s3.cloud.ru");
      }
      send(body: FormData) {
        expect(body.get("file")).toBeInstanceOf(File);
        uploadCalls.push("s3-post");
        this.onload?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeStorageXHR);
    const ticket = { uploadId: "upload-1", postId: "post-1", mediaId: "photo-new",
      kind: "photo", status: "reserved", postUrl: "https://s3.cloud.ru/gafus-feed-private",
      postFields: { key: "posts/author/post-1/incoming/upload-1/source.webp" },
      urlExpiresAt: new Date(Date.now() + 600_000).toISOString() };
    const fake = vi.fn((path: string, options?: RequestInit) => {
      if (path.endsWith("/uploads") && options?.method === "POST") {
        uploadCalls.push("reserve"); return Promise.resolve(ok(ticket));
      }
      if (path.endsWith("/uploads/upload-1/client-renditions") && options?.method === "POST") {
        uploadCalls.push("sign-renditions");
        return Promise.resolve(ok({
          small:{method:"POST",url:ticket.postUrl,fields:{key:"small.webp"}},
          medium:{method:"POST",url:ticket.postUrl,fields:{key:"medium.webp"}},
        }));
      }
      if (path.endsWith("/uploads/upload-1/client-complete") && options?.method === "POST") {
        uploadCalls.push("complete"); return Promise.resolve(ok({ ...ticket,
          status: "ready", postUrl: null, postFields: null, urlExpiresAt: null }));
      }
      if (path.endsWith("/revisions") && options?.method === "PUT") {
        uploadCalls.push("save-revision");
        savedBody = JSON.parse(String(options.body)) as Record<string, unknown>;
        return Promise.resolve(ok({ ...published, version: 2, pendingRevision: {
          status: "draft", text: "Старый текст", attachmentIds: savedBody.attachmentIds,
        } }));
      }
      if (path.endsWith("/editor")) {
        return Promise.resolve(ok(savedBody ? { ...published, version: 2, pendingRevision: {
          status: "draft", text: "Старый текст", attachmentIds: savedBody.attachmentIds,
        } } : published));
      }
      return Promise.resolve(ok(null, 404));
    });
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать текст");
      const input = ui.host.querySelector<HTMLInputElement>('input[type="file"]');
      expect(input).not.toBeNull();
      await act(async () => {
        Object.defineProperty(input!, "files", { configurable: true,
          value: [new File(["dog"], "dog.jpg", { type: "image/jpeg" })] });
        input!.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await ui.submit();
      expect(uploadCalls).toEqual(["reserve", "sign-renditions", "s3-post", "s3-post", "s3-post", "complete", "save-revision"]);
      expect(savedBody).toMatchObject({
        text: "Старый текст", attachmentIds: ["photo-1", "photo-new"], expectedVersion: 1,
      });
      expect(fake.mock.calls.filter(call => call[0].endsWith("/publish"))).toHaveLength(0);
    } finally { await ui.cleanup(); }
  });

  it("Next one-click edit sends one CAS revision and one publish despite double click", async () => {
    let stored = false;
    let publishedAck = false;
    const serverProcessing = { ...pending,
      pendingRevision: { ...pending.pendingRevision, status: "pending" } };
    const fake = vi.fn((path: string, options?: RequestInit) => {
      if (options?.method === "PUT") {
        stored = true; return Promise.resolve(ok(pending));
      }
      if (options?.method === "POST") {
        publishedAck = true; return Promise.resolve(ok(serverProcessing));
      }
      return Promise.resolve(path.endsWith("/editor")
        ? ok(publishedAck ? serverProcessing : stored ? pending : published)
        : ok(null, 404));
    });
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать текст");
      await ui.fill("Новый текст");
      await act(async () => {
        const primary = [...ui.host.querySelectorAll<HTMLButtonElement>("button")]
          .find(button => button.textContent?.trim() === "Опубликовать изменения сейчас");
        expect(primary?.disabled).toBe(false);
        primary?.click(); primary?.click();
      });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
      expect(fake.mock.calls.filter(call => call[1]?.method === "PUT")).toHaveLength(1);
      expect(fake.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
      expect(ui.host.textContent).toContain("Новая редакция обрабатывается сервером");
    } finally { await ui.cleanup(); }
  });

  it("Next one-click publish 503 retains committed revision and retries same UUID, no second PUT", async () => {
    let stored = false;
    let publishedAck = false;
    let postCount = 0;
    const serverProcessing = { ...pending, pendingRevision: {
      ...pending.pendingRevision, status: "pending",
    } };
    const fake = vi.fn((path: string, options?: RequestInit) => {
      if (options?.method === "PUT") {
        stored = true; return Promise.resolve(ok(pending));
      }
      if (options?.method === "POST") {
        postCount++;
        if (postCount === 1) return Promise.resolve(ok(null, 503));
        publishedAck = true; return Promise.resolve(ok(serverProcessing));
      }
      return Promise.resolve(path.endsWith("/editor")
        ? ok(publishedAck ? serverProcessing : stored ? pending : published)
        : ok(null, 404));
    });
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать текст");
      await ui.fill("Новый текст");
      await ui.click("Опубликовать изменения сейчас");
      expect(ui.host.textContent).toContain("Изменения не подтверждены полностью");
      expect(fake.mock.calls.filter(call => call[1]?.method === "PUT")).toHaveLength(1);
      await ui.click("Опубликовать изменения");
      const post = fake.mock.calls.filter(call => call[1]?.method === "POST");
      expect(post).toHaveLength(2);
      expect(post.map(call => JSON.parse(String(call[1]?.body)).clientRequestId))
        .toEqual([UUID, UUID]);
      expect(fake.mock.calls.filter(call => call[1]?.method === "PUT")).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("HTTP 409 leaves edited text visible and does not publish", async () => {
    const fake = vi.fn((_path: string, options?: RequestInit) => Promise.resolve(
      options?.method === "PUT" ? ok(null, 409) : ok(published),
    ));
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать текст");
      await ui.fill("Новое значение");
      await ui.submit();
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось сохранить");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Новое значение");
      expect(fake.mock.calls.some(call => call[0].endsWith("/publish"))).toBe(false);
    } finally { await ui.cleanup(); }
  });

  it("does not offer edit action for public posts without server canEdit", async () => {
    const publicPost = {
      ...published, canEdit: false,
      author: { id: "other", name: "Другой автор", username: "other", role: null },
      reactions: [], myReaction: null, commentCount: 0, viewCount: 0,
      bookmarked: false, hasPoll: false,
      createdAt: "2026-10-16T12:00:00.000Z",
      publishedAt: "2026-10-16T12:00:00.000Z",
    };
    const fake = vi.fn((path: string) => Promise.resolve(
      path.endsWith("/status") ? ok({ enabled: true }) : ok(publicPost),
    ));
    const ui = await mount(fake, createElement(MomentDetails, {
      userId: "viewer", postId: "post-1",
    }));
    try {
      expect(ui.host.textContent).toContain("Старый текст");
      expect(ui.host.textContent).not.toContain("Редактировать текст");
      expect(fake.mock.calls.some(call => call[0].endsWith("/editor"))).toBe(false);
    } finally { await ui.cleanup(); }
  });
});


// SOC041_PUBLISHED_TEXT_SAVE_PUBLISH: nearest real owner editor with synthetic transport.
function delayedWrite() {
  let resolve!: (reply: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
const requestsByMethod = (mock: ReturnType<typeof vi.fn>, method: string) =>
  mock.mock.calls.filter(call => (call[1] as RequestInit | undefined)?.method === method);
function exactEditorButton(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(element => element.textContent?.trim() === label);
  if (!button) throw Error("Missing published editor control " + label);
  return button;
}

describe("SOC041_PUBLISHED_TEXT_SAVE_PUBLISH existing editor mutation lifecycle", () => {
  it("two save submits in one React turn issue one PUT, keeping existing attachment order and CAS", async () => {
    const old = { ...published, attachments: [published.attachments[0], {
      id: "photo-2", kind: "photo", status: "ready",
    }] };
    const saved = { ...pending, attachments: old.attachments, pendingRevision: {
      ...pending.pendingRevision, attachmentIds: ["photo-1", "photo-2"],
    } };
    const deferred = delayedWrite();
    const fake = vi.fn((_path: string, options?: RequestInit) =>
      options?.method === "PUT" ? deferred.promise : Promise.resolve(ok(old)));
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать текст");
      await ui.fill("Новая опубликованная запись");
      await act(async () => {
        const form = ui.host.querySelector("form");
        form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await Promise.resolve();
      });
      expect(requestsByMethod(fake, "PUT")).toHaveLength(1);
      expect(JSON.parse(String(requestsByMethod(fake, "PUT")[0][1]?.body))).toEqual({
        text: "Новая опубликованная запись", expectedVersion: 1,
        clientRequestId: UUID, attachmentIds: ["photo-1", "photo-2"],
      });
      expect(requestsByMethod(fake, "POST")).toHaveLength(0);
      await act(async () => deferred.resolve(ok({ ...saved, pendingRevision: {
        ...saved.pendingRevision, text: "Новая опубликованная запись",
      } })));
    } finally { await ui.cleanup(); }
  });

  it("double same-turn publish click posts one explicit publication with original UUID", async () => {
    const deferred = delayedWrite();
    const fake = vi.fn((_path: string, options?: RequestInit) => options?.method === "POST"
      ? deferred.promise : Promise.resolve(ok(pending)));
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать текст");
      await act(async () => {
        const button = exactEditorButton(ui.host, "Опубликовать изменения");
        button.click(); button.click(); await Promise.resolve();
      });
      expect(requestsByMethod(fake, "POST")).toHaveLength(1);
      expect(requestsByMethod(fake, "PUT")).toHaveLength(0);
      const publishedCall = requestsByMethod(fake, "POST")[0];
      expect(publishedCall[0]).toBe("/api/v1/feed/posts/post-1/publish");
      expect(JSON.parse(String(publishedCall[1]?.body))).toEqual({ clientRequestId: UUID });
      await act(async () => deferred.resolve(ok({ ...pending,
        pendingRevision: { ...pending.pendingRevision, status: "pending" },
      })));
    } finally { await ui.cleanup(); }
  });

  it("retired old owner's save ACK cannot replace another owner's draft or version", async () => {
    const old = delayedWrite();
    const current = delayedWrite();
    const fresh = { ...published, id: "post-2", version: 7,
      text: "Второй исходный текст", attachments: [{ id: "photo-7", kind: "photo" }],
    };
    const fake = vi.fn((path: string, options?: RequestInit) => {
      if (options?.method === "PUT") return path.includes("post-2")
        ? current.promise : old.promise;
      return Promise.resolve(ok(path.includes("post-2") ? fresh : published));
    });
    const ui = await mount(fake);
    const invalidation = vi.spyOn(ui.cache, "invalidateQueries");
    try {
      await ui.click("Редактировать текст");
      await ui.fill("Редакция прежнего владельца");
      await ui.submit();
      expect(requestsByMethod(fake, "PUT")).toHaveLength(1);
      await ui.rerender("viewer-2", "post-2");
      await ui.click("Редактировать текст");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Второй исходный текст");
      await ui.fill("МОЙ НОВЫЙ ЧЕРНОВИК");
      await ui.submit();
      expect(requestsByMethod(fake, "PUT")).toHaveLength(2);
      expect(JSON.parse(String(requestsByMethod(fake, "PUT")[1][1]?.body))).toEqual({
        text: "МОЙ НОВЫЙ ЧЕРНОВИК", expectedVersion: 7,
        clientRequestId: UUID, attachmentIds: ["photo-7"],
      });
      await act(async () => old.resolve(ok({ ...pending,
        pendingRevision: { ...pending.pendingRevision, text: "Редакция прежнего владельца" },
      })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("МОЙ НОВЫЙ ЧЕРНОВИК");
      expect(invalidation).not.toHaveBeenCalledWith({
        queryKey: ["moments", "published-editor", "viewer-2", "post-2"],
      });
      await act(async () => current.resolve(ok({ ...fresh, version: 8, pendingRevision: {
        status: "draft", text: "МОЙ НОВЫЙ ЧЕРНОВИК", attachmentIds: ["photo-7"],
      } })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      expect(invalidation).toHaveBeenCalledWith({
        queryKey: ["moments", "published-editor", "viewer-2", "post-2"],
      });
    } finally { await ui.cleanup(); }
  });

  it("old publish ACK cannot mark a different user's unpublished editor as sent", async () => {
    const deferred = delayedWrite();
    const fresh = { ...published, id: "post-2", version: 3,
      text: "Другой пост", attachments: [{ id: "photo-3", kind: "photo" }],
      pendingRevision: null,
    };
    const fake = vi.fn((path: string, options?: RequestInit) => options?.method === "POST"
      ? deferred.promise : Promise.resolve(ok(path.includes("post-2") ? fresh : pending)));
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать текст");
      await act(async () => exactEditorButton(ui.host, "Опубликовать изменения").click());
      expect(requestsByMethod(fake, "POST")).toHaveLength(1);
      await ui.rerender("viewer-2", "post-2");
      await ui.click("Редактировать текст");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Другой пост");
      await act(async () => deferred.resolve(ok({ ...pending,
        pendingRevision: { ...pending.pendingRevision, status: "pending" },
      })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 22)); });
      expect(ui.host.textContent).not.toContain("Изменения подтверждены сервером");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Другой пост");
      expect(ui.host.textContent).not.toContain("Новая редакция обрабатывается сервером");
    } finally { await ui.cleanup(); }
  });

  it.each(["canEdit=false", "expired 403"])(
    "%s editor refusal prevents save and publication writes", async mode => {
      const fake = vi.fn((_path: string) => Promise.resolve(
        mode === "expired 403" ? ok(null, 403) : ok({ ...published, canEdit: false }),
      ));
      const ui = await mount(fake);
      try {
        await ui.click("Редактировать текст");
        expect(ui.host.querySelector("form")).toBeNull();
        expect(ui.host.textContent).not.toContain("Сохранить текст");
        expect(ui.host.textContent).not.toContain("Опубликовать изменения");
        expect(ui.host.textContent).toContain(mode === "expired 403"
          ? "Редактор недоступен" : "Право редактирования больше недоступно");
        expect(requestsByMethod(fake, "PUT")).toHaveLength(0);
        expect(requestsByMethod(fake, "POST")).toHaveLength(0);
      } finally { await ui.cleanup(); }
    },
  );

  it("503 ambiguous save and publish errors allow only explicit same-UUID retries", async () => {
    let put = 0, post = 0;
    const fake = vi.fn((_path: string, options?: RequestInit) => Promise.resolve(
      options?.method === "PUT" ? ++put === 1 ? ok(null, 503) : ok(pending)
        : options?.method === "POST" ? ++post === 1 ? ok(null, 503)
          : ok({ ...pending, pendingRevision: { ...pending.pendingRevision, status: "pending" } })
          : ok(put >= 2 ? pending : published),
    ));
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать текст");
      await ui.fill("Новый текст");
      await ui.submit();
      expect(put).toBe(1);
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Новый текст");
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      expect(put).toBe(1);
      await ui.submit();
      expect(put).toBe(2);
      expect(requestsByMethod(fake, "PUT").map(([, init]) =>
        JSON.parse(String(init?.body)).clientRequestId)).toEqual([UUID, UUID]);
      await ui.click("Опубликовать изменения");
      expect(post).toBe(1);
      expect(ui.host.textContent).toContain("Публикация редакции не подтверждена");
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      expect(post).toBe(1);
      await ui.click("Опубликовать изменения");
      expect(post).toBe(2);
      expect(requestsByMethod(fake, "POST").map(([, init]) =>
        JSON.parse(String(init?.body)).clientRequestId)).toEqual([UUID, UUID]);
    } finally { await ui.cleanup(); }
  });
});

// WEB005_PUBLISHED_EDITOR_KEYBOARD: real mounted React editor, synthetic network.
function focusButton(host: HTMLElement, text: string) {
  const item = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    .find(button => button.textContent?.trim() === text);
  if (!item) throw Error("Editor button missing: " + text);
  item.focus();
  return item;
}
function pendingEditorRead() {
  let resolve!: (reply: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}

describe("WEB005_PUBLISHED_EDITOR_KEYBOARD inline keyboard lifecycle", () => {
  it("focus transfers trigger→async loading→editable textarea once, not on background GET", async () => {
    const read = pendingEditorRead();
    let refreshed = false;
    const fetcher = vi.fn((_url: string) => refreshed
      ? Promise.resolve(ok(published)) : read.promise);
    const ui = await mount(fetcher);
    const outside = document.createElement("button");
    outside.textContent = "Внешняя кнопка";
    document.body.append(outside);
    try {
      await act(async () => focusButton(ui.host, "Редактировать текст").click());
      const loading = ui.host.querySelector<HTMLElement>('[role="status"]');
      expect(loading?.textContent).toContain("Проверяем право");
      expect(document.activeElement).toBe(loading);
      await act(async () => read.resolve(ok(published)));
      await act(async () => { await new Promise(done => setTimeout(done, 30)); });
      const field = ui.host.querySelector<HTMLTextAreaElement>("textarea");
      expect(field).not.toBeNull();
      expect(document.activeElement).toBe(field);
      expect(field?.labels?.[0]?.textContent).toContain("Текст публикации");
      expect(ui.host.querySelector("form")?.getAttribute("aria-labelledby")).toBeTruthy();
      refreshed = true;
      outside.focus();
      await ui.click("Проверить изменения");
      expect(document.activeElement).toBe(outside);
    } finally { await ui.cleanup(); outside.remove(); }
  });

  it("close from focused editor restores its own connected trigger, external focus never stolen", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(ok(published)));
    const ui = await mount(fetcher);
    const external = document.createElement("button"); document.body.append(external);
    try {
      const trigger = focusButton(ui.host, "Редактировать текст");
      await act(async () => trigger.click());
      await act(async () => { await new Promise(done => setTimeout(done, 35)); });
      expect(trigger.isConnected).toBe(true);
      const textarea = ui.host.querySelector<HTMLTextAreaElement>("textarea");
      expect(document.activeElement).toBe(textarea);
      await act(async () => focusButton(ui.host, "Закрыть редактор").click());
      expect(ui.host.querySelector("section.moment-published-editor")).toBeNull();
      expect(document.activeElement).toBe(trigger);
      await act(async () => trigger.click());
      external.focus();
      await act(async () => ui.host.querySelector<HTMLButtonElement>(
        "section.moment-published-editor button:last-child",
      )?.click());
      expect(document.activeElement).toBe(external);
    } finally { await ui.cleanup(); external.remove(); }
  });

  it("two simultaneous editors use unique labelled form/text IDs and no cross-editor focus", async () => {
    const fake = vi.fn(() => Promise.resolve(ok(published)));
    const elements = createElement("div", {},
      createElement(MomentEditPublishedText, { userId: "viewer", postId: "post-1" }),
      createElement(MomentEditPublishedText, { userId: "viewer", postId: "post-1" }));
    const ui = await mount(fake, elements);
    try {
      const triggers = Array.from(ui.host.querySelectorAll<HTMLButtonElement>("button"));
      triggers[0].focus();
      await act(async () => triggers[0].click());
      await act(async () => { await new Promise(done => setTimeout(done, 35)); });
      const firstEditor = ui.host.querySelector<HTMLElement>("section.moment-published-editor")!;
      const firstArea = firstEditor.querySelector<HTMLTextAreaElement>("textarea")!;
      expect(document.activeElement).toBe(firstArea);
      triggers[1].focus();
      await act(async () => triggers[1].click());
      await act(async () => { await new Promise(done => setTimeout(done, 35)); });
      const areas = Array.from(ui.host.querySelectorAll<HTMLTextAreaElement>("textarea"));
      expect(areas).toHaveLength(2);
      expect(new Set(areas.map(area => area.id)).size).toBe(2);
      for (const area of areas) {
        expect(area.labels?.[0]?.htmlFor).toBe(area.id);
        expect(area.getAttribute("aria-describedby")).toBeTruthy();
      }
      expect(document.activeElement).toBe(areas[1]);
      await act(async () => focusButton(firstEditor, "Закрыть редактор").click());
      expect(document.activeElement).not.toBe(areas[1]);
      expect(triggers[0].isConnected).toBe(true);
      expect(document.activeElement).toBe(triggers[0]);
    } finally { await ui.cleanup(); }
  });

  it("save transitions focused textarea to named pending revision/publish action, with no stale refocus", async () => {
    let state: typeof published | typeof pending = published;
    const fetcher = vi.fn((_url: string, options?: RequestInit) => {
      if (options?.method === "PUT") {
        state = { ...pending, pendingRevision: { ...pending.pendingRevision,
          text: "Новая редакция через клавиатуру" } };
      }
      return Promise.resolve(ok(state));
    });
    const ui = await mount(fetcher);
    const external = document.createElement("button"); document.body.append(external);
    try {
      await act(async () => focusButton(ui.host, "Редактировать текст").click());
      await act(async () => { await new Promise(done => setTimeout(done, 35)); });
      const textarea = ui.host.querySelector<HTMLTextAreaElement>("textarea")!;
      expect(document.activeElement).toBe(textarea);
      await ui.fill("Новая редакция через клавиатуру");
      await act(async () => {
        const save = focusButton(ui.host, "Сохранить текст");
        save.click();
      });
      await act(async () => { await new Promise(done => setTimeout(done, 30)); });
      expect(ui.host.querySelector("textarea")).toBeNull();
      const publish = Array.from(ui.host.querySelectorAll<HTMLButtonElement>("button"))
        .find(button => button.textContent?.trim() === "Опубликовать изменения");
      expect(publish?.disabled).toBe(false);
      expect(document.activeElement).toBe(publish);
      expect(publish?.closest('[role="region"]')?.getAttribute("aria-label")).toBeTruthy();
      external.focus();
      await ui.click("Проверить изменения");
      expect(document.activeElement).toBe(external);
    } finally { await ui.cleanup(); external.remove(); }
  });

  it("save then close in the same turn cannot bypass synchronous write flight", async () => {
    const deferred = delayedWrite();
    const fetcher = vi.fn((_url: string, options?: RequestInit) => options?.method === "PUT"
      ? deferred.promise : Promise.resolve(ok(published)));
    const ui = await mount(fetcher);
    try {
      await act(async () => focusButton(ui.host, "Редактировать текст").click());
      await act(async () => { await new Promise(done => setTimeout(done, 35)); });
      await ui.fill("Сохраняемый текст");
      await act(async () => {
        ui.host.querySelector("form")?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
        const close = ui.host.querySelector<HTMLButtonElement>(
          "section.moment-published-editor > button:last-child",
        );
        close?.click();
        await Promise.resolve();
      });
      expect(requestsByMethod(fetcher, "PUT")).toHaveLength(1);
      expect(ui.host.querySelector("section.moment-published-editor")).not.toBeNull();
      await act(async () => deferred.resolve(ok({ ...pending, pendingRevision: {
        ...pending.pendingRevision, text: "Сохраняемый текст",
      } })));
    } finally { await ui.cleanup(); }
  });

  it("retired old editor and detached trigger cannot steal focus from new owner", async () => {
    const former = pendingEditorRead();
    const next = { ...published, id: "post-2", text: "Редактор нового владельца" };
    const fetcher = vi.fn((path: string) => path.includes("post-1")
      ? former.promise : Promise.resolve(ok(next)));
    const ui = await mount(fetcher);
    const external = document.createElement("button"); document.body.append(external);
    try {
      await act(async () => focusButton(ui.host, "Редактировать текст").click());
      await act(async () => { await new Promise(done => setTimeout(done, 35)); });
      await ui.rerender("viewer-2", "post-2");
      await act(async () => focusButton(ui.host, "Редактировать текст").click());
      await act(async () => { await new Promise(done => setTimeout(done, 35)); });
      const current = ui.host.querySelector<HTMLTextAreaElement>("textarea");
      expect(document.activeElement).toBe(current);
      external.focus();
      await act(async () => former.resolve(ok(published)));
      await act(async () => { await new Promise(done => setTimeout(done, 30)); });
      expect(document.activeElement).toBe(external);
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Редактор нового владельца");
    } finally { await ui.cleanup(); external.remove(); }
  });
});

describe("WEB005_PUBLISHED_EDITOR_KEYBOARD error association and async cancellation", () => {
  it("save error is associated with its own textarea without changing the draft", async () => {
    const fake = vi.fn((_url: string, options?: RequestInit) => Promise.resolve(
      options?.method === "PUT" ? ok(null, 503) : ok(published),
    ));
    const ui = await mount(fake);
    try {
      await act(async () => focusButton(ui.host, "Редактировать текст").click());
      await act(async () => { await new Promise(done => setTimeout(done, 35)); });
      await ui.fill("Черновик для исправления ошибки");
      const area = ui.host.querySelector<HTMLTextAreaElement>("textarea")!;
      area.focus();
      await ui.submit();
      const alert = ui.host.querySelector<HTMLElement>('p[role="alert"]');
      expect(alert?.textContent).toContain("Не удалось сохранить изменения");
      expect(alert?.id).toBeTruthy();
      expect(area.getAttribute("aria-describedby")?.split(" ")).toContain(alert?.id);
      expect(area.value).toBe("Черновик для исправления ошибки");
      expect(document.activeElement).toBe(area);
      expect(requestsByMethod(fake, "PUT")).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("closing during unresolved GET restores the trigger and ignores late old editor focus", async () => {
    const read = pendingEditorRead();
    const fake = vi.fn(() => read.promise);
    const ui = await mount(fake);
    const outside = document.createElement("button"); document.body.append(outside);
    try {
      const trigger = focusButton(ui.host, "Редактировать текст");
      await act(async () => trigger.click());
      expect(document.activeElement).toBe(ui.host.querySelector('[role="status"]'));
      await act(async () => focusButton(ui.host, "Закрыть редактор").click());
      expect(document.activeElement).toBe(trigger);
      outside.focus();
      await act(async () => read.resolve(ok(published)));
      await act(async () => { await new Promise(done => setTimeout(done, 35)); });
      expect(document.activeElement).toBe(outside);
      expect(ui.host.querySelector("section.moment-published-editor")).toBeNull();
    } finally { await ui.cleanup(); outside.remove(); }
  });
});


describe("minimalist published editor layout contracts", () => {
  it("groups publish/save actions and keeps native file selection accessible", async () => {
    const fake = vi.fn().mockResolvedValue(ok(published));
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать текст");
      const panel = ui.host.querySelector<HTMLElement>("section.moment-published-editor")!;
      const heading = panel.querySelector("header h3");
      expect(panel.getAttribute("aria-labelledby")).toBe(heading?.id);
      expect(panel.querySelector('textarea[aria-describedby]')).not.toBeNull();
      const chooser = panel.querySelector<HTMLInputElement>(
        'input[type="file"][aria-label="Добавить вложения к публикации"]',
      );
      expect(chooser?.multiple).toBe(true);
      expect(chooser?.closest("label")?.textContent).toContain("Добавить фото или видео");
      const publish = Array.from(panel.querySelectorAll<HTMLButtonElement>("button"))
        .find(button => button.textContent?.includes("Опубликовать изменения сейчас"));
      const save = Array.from(panel.querySelectorAll<HTMLButtonElement>("button"))
        .find(button => button.textContent?.includes("Сохранить текст"));
      expect(publish?.parentElement).toBe(save?.parentElement);
      expect(publish?.type).toBe("button");
      expect(save?.type).toBe("submit");
      expect(panel.lastElementChild?.tagName).toBe("BUTTON");
      expect(panel.lastElementChild?.textContent).toContain("Закрыть редактор");
    } finally { await ui.cleanup(); }
  });
});
