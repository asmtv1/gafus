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
import { MomentComposer } from "./MomentComposer";
import { MomentDrafts } from "./MomentDrafts";
import { App } from "../../App";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const editor = {
  id: "post-1", status: "draft", version: 0, text: "",
  canEdit: true, attachments: [], pendingRevision: null,
};
const saved = {
  ...editor, version: 1, pendingRevision: {
    status: "draft", text: "Учимся спокойно ждать", attachmentIds: [],
  },
};
const response = (data: unknown, status = 200) => new Response(
  JSON.stringify({ success: status === 200, data, error: "Server unavailable" }),
  { status },
);
async function mount(
  fetcher: ReturnType<typeof vi.fn>,
  element: React.ReactElement = createElement(MomentComposer, { userId: "viewer" }),
) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("crypto", { randomUUID: () => UUID });
  window.history.replaceState(null, "", "/moments/new");
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(createElement(
    QueryClientProvider, { client: cache }, element,
  )));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  return {
    host, cache,
    async rerender(userId: string, draftId: string | null) {
      await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
        createElement(MomentComposer, { userId, draftId }))));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 22)); });
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
    async click(label: string) {
      const button = Array.from(host.querySelectorAll("button"))
        .find(value => value.textContent?.includes(label));
      expect(button).toBeDefined();
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    },
    async cleanup() {
      await act(async () => root.unmount());
      cache.clear(); host.remove();
      window.history.replaceState(null, "", "/moments/new");
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("text-only Moments create draft/revision/publish UI", () => {
  it("creates then saves revision, publishes only with explicit Core ACK", async () => {
    const fake = vi.fn((path: string, _options?: RequestInit) => Promise.resolve(
      path.endsWith("/status") ? response({ enabled: true })
        : path.endsWith("/revisions") ? response(saved)
          : path.endsWith("/publish") ? response({
            ...saved, status: "published", text: "Учимся спокойно ждать",
            pendingRevision: null,
          })
            : path === "/api/v1/feed/posts" ? response(editor)
              : response(null, 503),
    ));
    const ui = await mount(fake);
    try {
      await ui.fill("Учимся спокойно ждать");
      expect(ui.host.textContent).toContain("Опубликовать");
      await ui.click("Сохранить черновик");
      expect(ui.host.textContent).toContain("Опубликовать");
      const create = fake.mock.calls.filter(call => call[0] === "/api/v1/feed/posts");
      const revisions = fake.mock.calls.filter(call => call[0].endsWith("/revisions"));
      expect(create).toHaveLength(1);
      expect(revisions).toHaveLength(1);
      expect(JSON.parse(String(create[0]?.[1]?.body))).toEqual({ clientRequestId: UUID });
      expect(JSON.parse(String(revisions[0]?.[1]?.body))).toEqual({
        clientRequestId: UUID, expectedVersion: 0,
        text: "Учимся спокойно ждать", attachmentIds: [],
      });
      await ui.click("Опубликовать");
      expect(window.location.pathname).toBe("/moments");
      expect(fake.mock.calls.filter(call => call[0].endsWith("/publish")))
        .toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("one Next-style publish action performs authenticated create, CAS revision, then publish", async () => {
    const fake = vi.fn((path: string, _options?: RequestInit) => Promise.resolve(
      path.endsWith("/status") ? response({ enabled: true })
        : path.endsWith("/revisions") ? response(saved)
          : path.endsWith("/publish") ? response({
            ...saved, status: "published", text: "Учимся спокойно ждать", pendingRevision: null,
          })
            : path === "/api/v1/feed/posts" ? response(editor)
              : response(null, 503),
    ));
    const ui = await mount(fake);
    try {
      await ui.fill("Учимся спокойно ждать");
      expect(Array.from(ui.host.querySelectorAll<HTMLButtonElement>("button")).find(
        button => button.textContent?.trim() === "Опубликовать")?.disabled)
        .toBe(false);
      expect(fake.mock.calls.some(([path]) => path.endsWith("/publish"))).toBe(false);
      await ui.click("Опубликовать");
      for (let i = 0; i < 15 && window.location.pathname !== "/moments"; i++)
        await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      expect(window.location.pathname).toBe("/moments");
      const calls = fake.mock.calls.filter(([, init]) => init?.method !== "GET");
      expect(calls.map(([path]) => path)).toEqual([
        "/api/v1/feed/posts", "/api/v1/feed/posts/post-1/revisions",
        "/api/v1/feed/posts/post-1/publish",
      ]);
      expect(JSON.parse(String(calls[1]?.[1]?.body))).toEqual({
        clientRequestId: UUID, expectedVersion: 0,
        text: "Учимся спокойно ждать", attachmentIds: [],
      });
      expect(JSON.parse(String(calls[2]?.[1]?.body)))
        .toEqual({ clientRequestId: UUID });
    } finally { await ui.cleanup(); }
  });

  it("same-turn one-action double-click never creates two drafts or revisions", async () => {
    const revision = pendingEditor();
    const fake = vi.fn((path: string) => path.endsWith("/status")
      ? Promise.resolve(response({ enabled: true }))
      : path === "/api/v1/feed/posts" ? Promise.resolve(response(editor))
        : path.endsWith("/revisions") ? revision.promise
          : path.endsWith("/publish") ? Promise.resolve(response({
            ...saved, status: "published", text: "Учимся спокойно ждать", pendingRevision: null,
          })) : Promise.resolve(response(null, 503)));
    const ui = await mount(fake);
    try {
      await ui.fill("Учимся спокойно ждать");
      await act(async () => {
        const quick = Array.from(ui.host.querySelectorAll<HTMLButtonElement>("button")).find(
        button => button.textContent?.trim() === "Опубликовать")!;
        quick.click(); quick.click();
        await Promise.resolve();
      });
      for (let i = 0; i < 8 && !fake.mock.calls.some(([path]) => path.endsWith("/revisions")); i++)
        await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(fake.mock.calls.filter(([path]) => path === "/api/v1/feed/posts")).toHaveLength(1);
      expect(fake.mock.calls.filter(([path]) => path.endsWith("/revisions"))).toHaveLength(1);
      expect(fake.mock.calls.filter(([path]) => path.endsWith("/publish"))).toHaveLength(0);
      await act(async () => revision.resolve(response(saved)));
      for (let i = 0; i < 10 && !fake.mock.calls.some(([path]) => path.endsWith("/publish")); i++)
        await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      expect(fake.mock.calls.filter(([path]) => path.endsWith("/publish"))).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("creates photo-only draft, reserves photo and publishes with empty text", async () => {
    const withPhoto = {
      ...editor, version: 1, pendingRevision: {
        text: "", attachmentIds: ["media-1"], status: "draft",
      },
    };
    const fake = vi.fn((path: string, _options?: RequestInit) => Promise.resolve(
      path.endsWith("/status") ? response({ enabled: true })
        : path.endsWith("/uploads") ? response({
          uploadId: "upload-1", postId: "post-1", mediaId: "media-1",
          kind: "photo", status: "ready", postUrl: null,
          postFields: null, urlExpiresAt: null,
        })
          : path.endsWith("/revisions") ? response(withPhoto)
            : path.endsWith("/publish") ? response({
              ...withPhoto, status: "published", pendingRevision: null,
            })
              : path === "/api/v1/feed/posts" ? response(editor)
                : response(null, 503),
    ));
    const ui = await mount(fake);
    try {
      await ui.click("Создать черновик для медиа");
      expect(ui.host.querySelector('input[type="file"]')).not.toBeNull();
      const file = ui.host.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(file, "files", {
        configurable: true,
        value: [new File(["photo"], "dog.webp", { type: "image/webp" })],
      });
      await act(async () => file.dispatchEvent(new Event("change", { bubbles: true })));
      await ui.click("Загрузить фото");
      expect(ui.host.textContent).toContain("Опубликовать");
      const revisions = fake.mock.calls.filter(call => call[0].endsWith("/revisions"));
      expect(revisions).toHaveLength(1);
      expect(JSON.parse(String(revisions[0]?.[1]?.body))).toMatchObject({
        text: "", attachmentIds: ["media-1"], expectedVersion: 0,
      });
      await ui.click("Опубликовать");
      expect(fake.mock.calls.filter(call => call[0].endsWith("/publish")))
        .toHaveLength(1);
      expect(fake.mock.calls.filter(call => call[0] === "/api/v1/feed/posts"))
        .toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("recovers same draft and UUID after revision HTTP 503", async () => {
    let attempts = 0;
    const fake = vi.fn((path: string, _options?: RequestInit) => Promise.resolve(
      path.endsWith("/status") ? response({ enabled: true })
        : path.endsWith("/revisions")
          ? (++attempts === 1 ? response(null, 503) : response(saved))
          : path === "/api/v1/feed/posts" ? response(editor) : response(null, 503),
    ));
    const ui = await mount(fake);
    try {
      await ui.fill("Учимся спокойно ждать");
      await ui.click("Сохранить черновик");
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось сохранить");
      expect(ui.host.textContent).toContain("Черновик: post-1");
      await ui.click("Сохранить черновик");
      expect(fake.mock.calls.filter(call => call[0] === "/api/v1/feed/posts"))
        .toHaveLength(1);
      const versions = fake.mock.calls.filter(call => call[0].endsWith("/revisions"))
        .map(call => JSON.parse(String(call[1]?.body)));
      expect(versions).toHaveLength(2);
      expect(versions[0]).toEqual(versions[1]);
      expect(ui.host.textContent).toContain("Опубликовать");
    } finally { await ui.cleanup(); }
  });

  it("loads owned draft and refuses to lose previously attached media", async () => {
    const existing = {
      ...editor, version: 2, text: "",
      attachments: [{ id: "photo-1",
        fullUrl: "https://signed.example/private" }],
      pendingRevision: { text: "Медиа пост", status: "draft",
        attachmentIds: ["photo-1"] },
    };
    const fake = vi.fn((path: string, _options?: RequestInit) => Promise.resolve(
      path.endsWith("/status") ? response({ enabled: true })
        : path.endsWith("/editor") ? response(existing) : response(null, 503),
    ));
    const ui = await mount(fake, createElement(MomentComposer, {
      userId: "viewer", draftId: "post-1",
    }));
    try {
      expect(ui.host.textContent).toContain("Фото и видео");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Медиа пост");
      expect(ui.host.innerHTML).not.toContain("signed.example");
      // Merely opening an existing photo draft must never rewrite or drop it.
      expect(fake.mock.calls.filter(call => call[0].endsWith("/revisions")))
        .toHaveLength(0);
    } finally { await ui.cleanup(); }
  });

  it("disabled rollout prevents draft creation and all write operations", async () => {
    const fake = vi.fn().mockResolvedValue(response({ enabled: false }));
    const ui = await mount(fake);
    try {
      expect(ui.host.textContent).toContain("Публикации сейчас недоступны");
      expect(ui.host.querySelector("form")).toBeNull();
      expect(fake).toHaveBeenCalledTimes(1);
    } finally { await ui.cleanup(); }
  });

  it("owner-only pending list permits recovery after reload without private media", async () => {
    const fake = vi.fn((path: string, _options?: RequestInit) => Promise.resolve(
      path.endsWith("/status") ? response({ enabled: true })
        : response({ items: [editor, { ...editor, id: "post-2",
          status: "pending" }], nextCursor: null }),
    ));
    const ui = await mount(fake, createElement(MomentDrafts, { userId: "viewer" }));
    try {
      expect(ui.host.querySelector('a[href="/moments/drafts/post-1"]'))
        .not.toBeNull();
      expect(ui.host.querySelector('a[href="/moments"]')?.textContent)
        .toBe("Посмотреть прогресс в ленте");
      expect(ui.host.querySelector('a[href="/moments/drafts/post-2"]')).toBeNull();
      expect(ui.host.textContent).toContain("Обрабатывается");
      expect(fake.mock.calls.find(call => call[0].includes("pending-posts")))
        .toBeDefined();
    } finally { await ui.cleanup(); }
  });
});


// SOC041_DRAFT_TEXT_FLIGHT: same existing editor source, in-process fake responses only.
function pendingEditor() {
  let resolve!: (data: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
function writeCalls(fake: ReturnType<typeof vi.fn>, suffix: string) {
  return fake.mock.calls.filter(call => String(call[0]).endsWith(suffix));
}
function button(host: HTMLElement, label: string) {
  const match = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(node => node.textContent?.trim() === label);
  if (!match) throw Error("Missing draft action: " + label);
  return match;
}
const savedOn = (id: string, text: string) => ({ ...saved, id,
  text: "", pendingRevision: { status: "draft", text, attachmentIds: [] },
});

describe("SOC041_DRAFT_TEXT_FLIGHT existing save publish delete lifecycle", () => {
  it("same-turn two save submits send one create and one revision POST", async () => {
    const first = pendingEditor();
    const revision = pendingEditor();
    const fake = vi.fn((path: string, _init?: RequestInit) =>
      path.endsWith("/status") ? Promise.resolve(response({ enabled: true }))
        : path === "/api/v1/feed/posts" ? first.promise
          : path.endsWith("/revisions") ? revision.promise
            : Promise.resolve(response(null, 503)));
    const ui = await mount(fake);
    try {
      await ui.fill("Обычный текстовый черновик");
      await act(async () => {
        const form = ui.host.querySelector("form");
        form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await Promise.resolve();
      });
      expect(writeCalls(fake, "/api/v1/feed/posts")).toHaveLength(1);
      await act(async () => first.resolve(response(editor)));
      await act(async () => { await Promise.resolve(); });
      expect(writeCalls(fake, "/revisions")).toHaveLength(1);
      expect(JSON.parse(String(writeCalls(fake, "/revisions")[0][1]?.body))).toEqual({
        clientRequestId: UUID, expectedVersion: 0,
        text: "Обычный текстовый черновик", attachmentIds: [],
      });
      await act(async () => revision.resolve(response(savedOn("post-1", "Обычный текстовый черновик"))));
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      expect(ui.host.textContent).toContain("Опубликовать");
    } finally { await ui.cleanup(); }
  });

  it("same-turn duplicate publish only one POST and competing delete never confirms", async () => {
    const pending = pendingEditor();

    const fake = vi.fn((path: string, _init?: RequestInit) => path.endsWith("/status")
      ? Promise.resolve(response({ enabled: true }))
      : path.endsWith("/editor") ? Promise.resolve(response(savedOn("post-1", "Готовый текст")))
        : path.endsWith("/publish") ? pending.promise
          : Promise.resolve(response(null, 503)));
    const ui = await mount(fake, createElement(MomentComposer, { userId: "viewer", draftId: "post-1" }));
    try {
      await act(async () => {
        button(ui.host, "Опубликовать").click();
        button(ui.host, "Опубликовать").click();
        button(ui.host, "Удалить черновик").click();
        await Promise.resolve();
      });
      expect(writeCalls(fake, "/publish")).toHaveLength(1);
      expect(fake.mock.calls.filter(([, init]) => init?.method === "DELETE"))
        .toHaveLength(0);
      expect(ui.host.querySelector('[aria-label="Подтверждение удаления Момента"]'))
        .toBeNull();
      expect(window.location.pathname).toBe("/moments/new");
      await act(async () => pending.resolve(response({ ...savedOn("post-1", "Готовый текст"), status: "published" })));
      await act(async () => { await new Promise(done => setTimeout(done, 30)); });
      expect(window.location.pathname).toBe("/moments");
    } finally { await ui.cleanup(); }
  });

  it("double delete confirms only once, declined confirmation writes nothing", async () => {
    const pending = pendingEditor();

    const fake = vi.fn((path: string, init?: RequestInit) => path.endsWith("/status")
      ? Promise.resolve(response({ enabled: true }))
      : path.endsWith("/editor") ? Promise.resolve(response(editor))
        : init?.method === "DELETE" ? pending.promise
          : Promise.resolve(response(null, 503)));
    const ui = await mount(fake, createElement(MomentComposer, { userId: "viewer", draftId: "post-1" }));
    try {
      await act(async () => button(ui.host, "Удалить черновик").click());
      expect(ui.host.querySelector('[aria-label="Подтверждение удаления Момента"]'))
        .not.toBeNull();
      expect(fake.mock.calls.filter(([, init]) => init?.method === "DELETE"))
        .toHaveLength(0);
      await act(async () => button(ui.host, "Не удалять").click());
      expect(fake.mock.calls.filter(([, init]) => init?.method === "DELETE"))
        .toHaveLength(0);
      await act(async () => button(ui.host, "Удалить черновик").click());
      await act(async () => {
        button(ui.host, "Да, удалить публикацию").click();
        button(ui.host, "Да, удалить публикацию").click();
        await Promise.resolve();
      });
      const deletes = fake.mock.calls.filter(([, init]) => init?.method === "DELETE");
      expect(deletes).toHaveLength(1);
      expect(deletes[0][0]).toBe("/api/v1/feed/posts/post-1");
      await act(async () => pending.resolve(response({ id: "post-1" })));
      await act(async () => { await new Promise(done => setTimeout(done, 28)); });
      expect(window.location.pathname).toBe("/moments/drafts");
    } finally { await ui.cleanup(); }
  });

  it("save holds cross-command flight: same-turn delete cannot prompt or send", async () => {
    const pending = pendingEditor();

    const fake = vi.fn((path: string) => path.endsWith("/status")
      ? Promise.resolve(response({ enabled: true }))
      : path.endsWith("/editor") ? Promise.resolve(response(savedOn("post-1", "Готовый текст")))
        : path.endsWith("/revisions") ? pending.promise
          : Promise.resolve(response(null, 503)));
    const ui = await mount(fake, createElement(MomentComposer, { userId: "viewer", draftId: "post-1" }));
    try {
      await act(async () => {
        ui.host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        button(ui.host, "Удалить черновик").click();
        await Promise.resolve();
      });
      expect(writeCalls(fake, "/revisions")).toHaveLength(1);
      expect(ui.host.querySelector('[aria-label="Подтверждение удаления Момента"]'))
        .toBeNull();
      await act(async () => pending.resolve(response({ ...savedOn("post-1", "Готовый текст"), version: 2 })));
    } finally { await ui.cleanup(); }
  });

  it.each(["publish", "delete"])("old %s ACK never navigates new actor or overwrites new draft", async kind => {
    const old = pendingEditor();
    const current = pendingEditor();

    const fake = vi.fn((path: string, init?: RequestInit) =>
      path.endsWith("/status") ? Promise.resolve(response({ enabled: true }))
        : path.endsWith("/editor") ? Promise.resolve(response(
          savedOn(path.includes("post-2") ? "post-2" : "post-1",
            path.includes("post-2") ? "Вторая публикация" : "Первая публикация")))
          : kind === "publish" && path.endsWith("/publish") ||
            kind === "delete" && init?.method === "DELETE"
            ? (path.includes("post-2") ? current.promise : old.promise)
            : Promise.resolve(response(null, 503)));
    const ui = await mount(fake, createElement(MomentComposer, { userId: "viewer-1", draftId: "post-1" }));
    const invalidate = vi.spyOn(ui.cache, "invalidateQueries");
    try {
      await act(async () => button(ui.host, kind === "publish" ? "Опубликовать" : "Удалить черновик").click());
      if (kind === "delete") await act(async () => button(ui.host, "Да, удалить публикацию").click());
      await ui.rerender("viewer-2", "post-2");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Вторая публикация");
      await act(async () => button(ui.host, kind === "publish" ? "Опубликовать" : "Удалить черновик").click());
      if (kind === "delete") await act(async () => button(ui.host, "Да, удалить публикацию").click());
      await act(async () => old.resolve(response(kind === "publish"
        ? { ...savedOn("post-1", "Первая публикация"), status: "published" }
        : { id: "post-1" })));
      await act(async () => { await new Promise(done => setTimeout(done, 28)); });
      expect(window.location.pathname).toBe("/moments/new");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Вторая публикация");
      expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["moments", "list", "viewer-2"] });
      await act(async () => current.resolve(response(kind === "publish"
        ? { ...savedOn("post-2", "Вторая публикация"), status: "published" }
        : { id: "post-2" })));
      await act(async () => { await new Promise(done => setTimeout(done, 30)); });
      expect(window.location.pathname).toBe(kind === "publish" ? "/moments" : "/moments/drafts");
    } finally { await ui.cleanup(); }
  });

  it("old save revision ACK cannot replace new owner's unsaved text or version", async () => {
    const old = pendingEditor();
    const fake = vi.fn((path: string) => path.endsWith("/status")
      ? Promise.resolve(response({ enabled: true }))
      : path.endsWith("/editor") ? Promise.resolve(response(savedOn(
        path.includes("post-2") ? "post-2" : "post-1",
        path.includes("post-2") ? "Второй текст" : "Первый текст")))
        : path.endsWith("/revisions") ? old.promise
          : Promise.resolve(response(null, 503)));
    const ui = await mount(fake, createElement(MomentComposer, { userId: "viewer-1", draftId: "post-1" }));
    try {
      await ui.fill("Новая версия первого");
      await act(async () => ui.host.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })));
      expect(writeCalls(fake, "/revisions")).toHaveLength(1);
      await ui.rerender("viewer-2", "post-2");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Второй текст");
      await ui.fill("НЕЗАВЕРШЁННЫЙ ТЕКСТ ВТОРОГО");
      await act(async () => old.resolve(response({
        ...savedOn("post-1", "Новая версия первого"), version: 2,
      })));
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("НЕЗАВЕРШЁННЫЙ ТЕКСТ ВТОРОГО");
      expect(ui.host.textContent).toContain("Черновик: post-2");
      expect(ui.host.textContent).not.toContain("Черновик: post-1");
    } finally { await ui.cleanup(); }
  });

  it("409 version conflict leaves unsaved text and exact CAS/UUID until manual retry", async () => {
    let revisions = 0;
    const fake = vi.fn((path: string, _init?: RequestInit) => path.endsWith("/status")
      ? Promise.resolve(response({ enabled: true }))
      : path.endsWith("/editor") ? Promise.resolve(response(savedOn("post-1", "Первый текст")))
        : path.endsWith("/revisions") ? Promise.resolve(++revisions === 1
          ? response(null, 409)
          : response({ ...savedOn("post-1", "Второй текст"), version: 2 }))
          : Promise.resolve(response(null, 503)));
    const ui = await mount(fake, createElement(MomentComposer, { userId: "viewer", draftId: "post-1" }));
    try {
      await ui.fill("Второй текст");
      await ui.click("Сохранить черновик");
      expect(revisions).toBe(1);
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Второй текст");
      expect(ui.host.textContent).toContain("Не удалось сохранить");
      expect(ui.host.textContent).toContain("Черновик: post-1");
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      expect(revisions).toBe(1);
      await ui.click("Сохранить черновик");
      expect(revisions).toBe(2);
      const bodies = writeCalls(fake, "/revisions")
        .map(call => JSON.parse(String(call[1]?.body)));
      expect(bodies).toEqual([
        { text: "Второй текст", attachmentIds: [], expectedVersion: 1, clientRequestId: UUID },
        { text: "Второй текст", attachmentIds: [], expectedVersion: 1, clientRequestId: UUID },
      ]);
      expect(ui.host.textContent).toContain("Опубликовать");
    } finally { await ui.cleanup(); }
  });

  it("503 DELETE retains owned draft text, no auto retry; next confirmed click navigates", async () => {
    let deletes = 0;

    const fake = vi.fn((path: string, init?: RequestInit) => path.endsWith("/status")
      ? Promise.resolve(response({ enabled: true }))
      : path.endsWith("/editor") ? Promise.resolve(response(savedOn("post-1", "Сохранённый текст")))
        : init?.method === "DELETE" ? Promise.resolve(++deletes === 1
          ? response(null, 503) : response({ id: "post-1" }))
          : Promise.resolve(response(null, 503)));
    const ui = await mount(fake, createElement(MomentComposer, { userId: "viewer", draftId: "post-1" }));
    try {
      await ui.click("Удалить черновик");
      expect(deletes).toBe(0);
      await ui.click("Да, удалить публикацию");
      expect(deletes).toBe(1);
      expect(ui.host.textContent).toContain("Не удалось удалить черновик");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Сохранённый текст");
      expect(window.location.pathname).toBe("/moments/new");
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      expect(deletes).toBe(1);
      await ui.click("Удалить черновик");
      expect(deletes).toBe(1);
      await ui.click("Да, удалить публикацию");
      expect(deletes).toBe(2);
      expect(window.location.pathname).toBe("/moments/drafts");
    } finally { await ui.cleanup(); }
  });
});

// WEB005_SOC041_TEXT_DRAFT_A11Y: existing mounted authoring, no media writes.
const draftA11yFake = (text: string, delayed?: Promise<Response>) => vi.fn(
  (path: string, _options?: RequestInit) => path.endsWith("/status")
    ? Promise.resolve(response({ enabled: true }))
    : path.endsWith("/editor") ? Promise.resolve(response(editor))
      : path.endsWith("/revisions") ? delayed ?? Promise.resolve(response({
        ...saved, pendingRevision: { status: "draft", text, attachmentIds: [] },
      })) : Promise.resolve(response(null, 503)),
);
function exactAction(host: HTMLElement, name: string) {
  const control = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(item => item.textContent?.trim() === name);
  if (!control) throw Error("Missing existing composer action " + name);
  return control;
}
async function tick() {
  await act(async () => { await new Promise(done => setTimeout(done, 26)); });
}

describe("WEB005_SOC041_TEXT_DRAFT_A11Y existing text save and publish controls", () => {
  it("two same-user composers have unique field/counter/error IDs and named form", async () => {
    const fake = vi.fn((path: string) => Promise.resolve(
      path.endsWith("/status") ? response({ enabled: true })
        : path.endsWith("/editor") ? response(editor) : response(null, 503),
    ));
    const ui = await mount(fake, createElement("div", {},
      createElement(MomentComposer, { userId: "viewer", draftId: "post-1" }),
      createElement(MomentComposer, { userId: "viewer", draftId: "post-1" })));
    try {
      const fields = [...ui.host.querySelectorAll<HTMLTextAreaElement>("textarea")];
      const forms = [...ui.host.querySelectorAll<HTMLFormElement>("form")];
      expect(fields).toHaveLength(2);
      expect(forms).toHaveLength(2);
      expect(fields[0].id).not.toBe(fields[1].id);
      expect(fields.every(field => field.labels?.[0]?.textContent === "Текст публикации"))
        .toBe(true);
      const described = fields.map(field => field.getAttribute("aria-describedby")!.split(/\s+/));
      expect(described.every(ids => ids.length === 1 &&
        ui.host.querySelectorAll(`#${ids[0]}`).length === 1)).toBe(true);
      expect(described[0][0]).not.toBe(described[1][0]);
      expect(forms.every(form => form.getAttribute("aria-label") === "Сохранение текстового черновика"))
        .toBe(true);
      expect(forms.every(form => form.getAttribute("aria-busy") === "false")).toBe(true);
    } finally { await ui.cleanup(); }
  });

  it("unconfirmed save has no success announcement; 503 error describes retained text", async () => {
    const fake = vi.fn((path: string) => Promise.resolve(
      path.endsWith("/status") ? response({ enabled: true })
        : path.endsWith("/editor") ? response(editor) : response(null, 503),
    ));
    const ui = await mount(fake, createElement(MomentComposer, {
      userId: "viewer", draftId: "post-1",
    }));
    try {
      await ui.fill("Текст без подтверждения");
      expect(ui.host.textContent).not.toContain("Текст черновика сохранён");
      await ui.click("Сохранить черновик");
      expect(ui.host.textContent).not.toContain("Текст черновика сохранён");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Текст без подтверждения");
      const field = ui.host.querySelector<HTMLTextAreaElement>("textarea")!;
      const ids = field.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
      expect(ids).toHaveLength(2);
      expect(ids.some(id => ui.host.querySelector(`#${id}`)?.getAttribute("role") === "alert"))
        .toBe(true);
      expect(ui.host.querySelector<HTMLFormElement>("form")?.getAttribute("aria-busy"))
        .toBe("false");
      expect(ui.host.textContent).toContain("Опубликовать");
      expect(fake.mock.calls.filter(([path]) => path.endsWith("/publish"))).toHaveLength(0);
    } finally { await ui.cleanup(); }
  });

  it("focused save announces only server-confirmed current version, then focuses publish", async () => {
    const delayed = pendingEditor();
    const fake = draftA11yFake("Подтверждённый текст", delayed.promise);
    const ui = await mount(fake, createElement(MomentComposer, {
      userId: "viewer", draftId: "post-1",
    }));
    try {
      await ui.fill("Подтверждённый текст");
      const saveButton = exactAction(ui.host, "Сохранить черновик");
      await act(async () => { saveButton.focus(); saveButton.click(); await Promise.resolve(); });
      expect(ui.host.textContent).not.toContain("Текст черновика сохранён");
      expect(ui.host.querySelector<HTMLFormElement>("form")?.getAttribute("aria-busy"))
        .toBe("true");
      expect(ui.host.textContent).toContain("Опубликовать");
      await act(async () => delayed.resolve(response({
        ...saved, pendingRevision: { status: "draft", text: "Подтверждённый текст",
          attachmentIds: [] },
      })));
      await tick();
      expect(ui.host.querySelectorAll('[role="status"]')).not.toHaveLength(0);
      expect(ui.host.querySelectorAll('[role="status"]')).toBeDefined();
      expect(ui.host.textContent?.match(/Текст черновика сохранён/g)).toHaveLength(1);
      expect(document.activeElement).toBe(exactAction(ui.host, "Опубликовать"));
      expect(ui.host.querySelector<HTMLFormElement>("form")?.getAttribute("aria-busy"))
        .toBe("false");
      await act(async () => ui.cache.invalidateQueries({
        queryKey: ["moments", "status", "viewer"],
      }));
      await tick();
      expect(ui.host.textContent?.match(/Текст черновика сохранён/g)).toHaveLength(1);
      // The saved version must not be announced for a newly edited text.
      await ui.fill("Уже другая версия текста");
      expect(ui.host.textContent).not.toContain("Текст черновика сохранён");
      expect(ui.host.textContent).toContain("Опубликовать");
    } finally { await ui.cleanup(); }
  });

  it("background save never steals focus from a different control, even when publish appears", async () => {
    const delayed = pendingEditor();
    const fake = draftA11yFake("Текст без фокуса", delayed.promise);
    const ui = await mount(fake, createElement(MomentComposer, {
      userId: "viewer", draftId: "post-1",
    }));
    try {
      await ui.fill("Текст без фокуса");
      const external = document.createElement("button"); external.textContent = "Внешняя кнопка";
      ui.host.append(external);
      await act(async () => {
        exactAction(ui.host, "Сохранить черновик").focus();
        exactAction(ui.host, "Сохранить черновик").click();
        external.focus();
      });
      expect(document.activeElement).toBe(external);
      await act(async () => delayed.resolve(response({
        ...saved, pendingRevision: { status: "draft", text: "Текст без фокуса",
          attachmentIds: [] },
      })));
      await tick();
      expect(ui.host.textContent).toContain("Опубликовать");
      expect(ui.host.textContent).toContain("Текст черновика сохранён");
      expect(document.activeElement).toBe(external);
    } finally { await ui.cleanup(); }
  });

  it("retired user/draft ACK never announces or focuses publish in the new authoring context", async () => {
    const delayed = pendingEditor();
    const fake = vi.fn((path: string, _init?: RequestInit) => path.endsWith("/status")
      ? Promise.resolve(response({ enabled: true }))
      : path.endsWith("/editor") ? Promise.resolve(response(editor))
        : path.endsWith("/revisions") ? delayed.promise
          : Promise.resolve(response(null, 503)));
    const ui = await mount(fake, createElement(MomentComposer, {
      userId: "viewer", draftId: "post-1",
    }));
    try {
      await ui.fill("Старый черновик");
      await act(async () => {
        const button = exactAction(ui.host, "Сохранить черновик");
        button.focus(); button.click(); await Promise.resolve();
      });
      await ui.rerender("viewer-2", null);
      await ui.fill("Новый авторский текст");
      const newField = ui.host.querySelector<HTMLTextAreaElement>("textarea")!;
      newField.focus();
      await act(async () => delayed.resolve(response({
        ...saved, pendingRevision: { status: "draft", text: "Старый черновик",
          attachmentIds: [] },
      })));
      await tick();
      expect(ui.host.textContent).not.toContain("Текст черновика сохранён");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Новый авторский текст");
      expect(document.activeElement).toBe(newField);
      expect(ui.host.textContent).toContain("Опубликовать");
    } finally { await ui.cleanup(); }
  });
});


describe("SOC041_PUBLISHED_DRAFTS_NAVIGATION existing owner list", () => {
  it("published post can only be opened, never continued as an editable draft", async () => {
    const network = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method && init.method !== "GET") throw Error("WRITE_FORBIDDEN");
      if (path.endsWith("/status")) return response({ enabled: true });
      if (path.includes("/pending")) return response({
        items: [{ ...saved, status: "published", text: "Учимся спокойно ждать",
          pendingRevision: null, canEdit: false }], nextCursor: null,
      });
      return response(null, 503);
    });
    const ui = await mount(network, createElement(MomentDrafts, { userId: "viewer" }));
    try {
      expect(ui.host.textContent).toContain("Учимся спокойно ждать");
      expect(ui.host.querySelector('a[href="/moments/post-1"]')?.textContent)
        .toContain("Открыть публикацию");
      expect(ui.host.querySelector('a[href="/moments/drafts/post-1"]')).toBeNull();
      expect(network.mock.calls.every(([_, init]) => init?.method === "GET")).toBe(true);
    } finally { await ui.cleanup(); }
  });
  it("draft/failed stay editable; pending goes to the feed progress; published opens post", async () => {
    const fake = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method !== "GET") throw Error("WRITE_FORBIDDEN");
      if (path.endsWith("/status")) return response({ enabled: true });
      if (path.includes("/pending")) return response({
        items: [
          { ...editor, id: "draft-1" },
          { ...editor, id: "failed-1", status: "failed" },
          { ...editor, id: "pending-1", status: "pending", canEdit: false },
          { ...editor, id: "published-1", status: "published", canEdit: false },
        ], nextCursor: null,
      });
      return response(null, 503);
    });
    const ui = await mount(fake, createElement(MomentDrafts, { userId: "viewer" }));
    try {
      for (const id of ["draft-1", "failed-1"])
        expect(ui.host.querySelector(`a[href="/moments/drafts/${id}"]`)?.textContent)
          .toBe("Продолжить");
      expect(ui.host.textContent).toContain("Обрабатывается");
      expect(ui.host.querySelector('a[href="/moments"]')?.textContent)
        .toBe("Посмотреть прогресс в ленте");
      expect(ui.host.querySelector('a[href="/moments/drafts/pending-1"]')).toBeNull();
      expect(ui.host.querySelector('a[href="/moments/pending-1"]')).toBeNull();
      expect(ui.host.querySelector('a[href="/moments/drafts/published-1"]')).toBeNull();
      expect(ui.host.querySelector('a[href="/moments/published-1"]')?.textContent)
        .toBe("Открыть публикацию");
      expect(fake.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    } finally { await ui.cleanup(); }
  });
});


describe("SOC041_EXISTING_APP_TEXT_DRAFT_PUBLISH_POST_VERTICAL", () => {
  it("authenticated feed -> composer -> saved version -> publish ACK -> real post details -> back", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("crypto", { randomUUID: () => UUID });
    window.history.replaceState(null, "", "/moments");
    const createdText = "Учимся спокойно ждать";
    let published = false;
    const posted = {
      id: "post-1", status: "published", text: createdText,
      author: { id: "actor-1", name: "Тренер", username: "trainer", role: "TRAINER" },
      createdAt: "2026-10-20T12:00:00Z", publishedAt: "2026-10-20T12:02:00Z",
      reactions: [], attachments: [], myReaction: null, bookmarked: false,
      hasPoll: false, canEdit: false, viewCount: 0, commentCount: 0,
      accessToken: "DO_NOT_EXPOSE_PRIVATE",
    };
    const calls: { path: string; method: string }[] = [];
    const fake = vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ path, method });
      if(path === "/api/v1/feed/status")return response({ enabled: true, smartEnabled: false });
      if(path.includes("/posts?pageSize=20&sort="))return response({
        items: published ? [posted] : [], nextCursor: null,
      });
      if(path === "/api/v1/feed/posts" && method === "POST")return response(editor);
      if(path === "/api/v1/feed/posts/post-1/revisions" && method === "PUT")return response(saved);
      if(path === "/api/v1/feed/posts/post-1/publish" && method === "POST"){
        published = true;
        return response({ ...saved, status: "published", text: createdText,
          pendingRevision: null });
      }
      if(path === "/api/v1/feed/posts/post-1" && method === "GET")return response(posted);
      if(path.startsWith("/api/v1/feed/posts/post-1/comments") && method === "GET")
        return response({ items: [], nextCursor: null });
      throw Error("UNEXPECTED_API:" + method + ":" + path);
    });
    vi.stubGlobal("fetch", fake);
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const cache = new QueryClient({ defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    } });
    cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "actor-1", username: "trainer", role: "USER" });
    const settle = async () => act(async () => {
      await new Promise(done => setTimeout(done, 28));
    });
    const clickLink = async (href: string) => {
      const link = host.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)!;
      expect(link).not.toBeNull();
      await act(async () => link.dispatchEvent(new MouseEvent("click", {
        bubbles: true, cancelable: true, button: 0,
      })));
      await settle();
    };
    const clickButton = async (label: string) => {
      const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find(el => el.textContent?.trim() === label);
      expect(button).toBeDefined();
      await act(async () => button?.click());
      await settle();
    };
    try {
      await act(async () => root.render(createElement(
        QueryClientProvider, { client: cache }, createElement(App),
      )));
      // App mounts MomentsCatalog via React.lazy. A bounded 8 × 28 ms loop
      // races module transformation on a cold Vitest run; wait for readiness,
      // not an assumed import duration. Still fail if the actual CTA is absent.
      // The accessible name is stable; the visible Next-style text is now
      // «Новая публикация». This must remain a REAL enabled RouteLink.
      for (let n = 0; n < 60 && !host.querySelector(
        'a[href="/moments/new"][aria-label="Создать публикацию"]'); n++)
        await settle();

      expect(host.querySelector('a[href="/moments/new"][aria-label="Создать публикацию"]'))
        .not.toBeNull();
      await clickLink("/moments/new");
      expect(window.location.pathname).toBe("/moments/new");
      const input = host.querySelector<HTMLTextAreaElement>("textarea")!;
      expect(input).not.toBeNull();
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!
          .call(input,createdText);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await clickButton("Сохранить черновик");
      expect(calls.filter(item => item.method !== "GET")).toEqual([
        { path: "/api/v1/feed/posts", method: "POST" },
        { path: "/api/v1/feed/posts/post-1/revisions", method: "PUT" },
      ]);
      expect(host.textContent).toContain("Опубликовать");
      await clickButton("Опубликовать");
      for (let n = 0; n < 9 && window.location.pathname !== "/moments"; n++)
        await settle();
      expect(window.location.pathname).toBe("/moments");
      // Publication acknowledgment returns to the feed, not a second
      // completion/detail page. Feed owns all pending media progress.
      for (let n = 0; n < 100 &&
        !host.querySelector('[aria-label="Лента Моментов"]'); n++) await settle();
      expect(window.location.pathname).toBe("/moments");
      expect(host.innerHTML).not.toContain("DO_NOT_EXPOSE_PRIVATE");
      expect(calls.filter(item => item.method !== "GET").map(item => item.path)).toEqual([
        "/api/v1/feed/posts", "/api/v1/feed/posts/post-1/revisions",
        "/api/v1/feed/posts/post-1/publish",
      ]);
      await clickLink("/moments");
      expect(window.location.pathname).toBe("/moments");
      for (let n = 0; n < 9 && !host.textContent?.includes(createdText); n++)await settle();
      expect(host.textContent).toContain(createdText);
      expect(host.innerHTML).not.toContain("DO_NOT_EXPOSE_PRIVATE");
    } finally {
      await act(async () => root.unmount());
      cache.clear(); host.remove();
      window.history.replaceState(null, "", "/");
    }
  });
});
