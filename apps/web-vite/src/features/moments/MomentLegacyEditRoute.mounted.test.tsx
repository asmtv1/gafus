// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";

const response = (data: unknown) => new Response(JSON.stringify({
  success: true, data,
}), { status: 200 });
const actor = { id: "owner-A", username: "ownerA", role: "USER" };
const state = (postStatus: "draft" | "published", allowed = true) => ({
  id: "post-1", status: postStatus, version: 1, text: "Исходный текст публикации",
  canEdit: allowed, hasPoll: false, attachments: [],
  pendingRevision: postStatus === "draft" ? {
    status: "draft", text: "Исходный текст публикации", attachmentIds: [],
  } : null,
});
let root: Root, host: HTMLDivElement, cache: QueryClient, fetcher: ReturnType<typeof vi.fn>;
const tick = async () => act(async () => {
  await new Promise(resolve => setTimeout(resolve, 55));
});
async function render(path: string) {
  window.history.replaceState(null, "", path);
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <App />
  </QueryClientProvider>));
  for (let attempt = 0; attempt < 65; attempt++) {
    if (!host.textContent?.includes("Загружаем «Моменты»") &&
        !host.textContent?.includes("Загружаем редактор") &&
        !host.textContent?.includes("Проверяем доступ")) break;
    await tick();
  }
  await tick();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, actor);
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear(); host.remove(); vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
function stubEditor(postStatus: "draft" | "published", allowed = true) {
  fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method && init.method !== "GET") throw Error("UNEXPECTED_WRITE_" + path);
    if (path === "/api/v1/feed/status") return response({ enabled: true });
    if (path === "/api/v1/feed/posts/post-1/editor")
      return response(state(postStatus, allowed));
    if (path === "/api/v1/user/onboarding-tour") return response({ completed: true });
    if (path === "/api/v1/user/profile") return response({
      id: "owner-A", username: "ownerA", profile: { fullName: "Владелец" },
    });
    throw Error("UNEXPECTED_READ_" + path);
  });
  vi.stubGlobal("fetch", fetcher);
}
describe("real App Next /feed/create?edit source route", () => {
  it("published edit opens existing ID in owner checked editor, never creates a draft", async () => {
    stubEditor("published");
    await render("/feed/create?edit=post-1");
    expect(host.textContent).toContain("Изменить публикацию");
    expect(host.querySelector<HTMLTextAreaElement>(
      ".moment-published-editor textarea")?.value).toBe("Исходный текст публикации");
    expect(fetcher.mock.calls.map(([url]) => url)).toContain(
      "/api/v1/feed/posts/post-1/editor");
    expect(fetcher.mock.calls.every(([, opts]) =>
      !opts?.method || opts.method === "GET")).toBe(true);
    expect(fetcher.mock.calls.map(([url]) => url)).not.toContain(
      "/api/v1/feed/posts");
  });
  it("draft edit keeps same ID and never creates a second draft", async () => {
    stubEditor("draft");
    await render("/feed/create?edit=post-1");
    expect(host.textContent).toContain("Черновик: post-1");
    expect(host.textContent).not.toContain("Страница не найдена");
    expect(host.querySelectorAll(".moment-edit-route-header h1")).toHaveLength(1);
    expect(host.querySelector(".web4-moment-composer .web4-compose-header")).toBeNull();
    expect(host.querySelectorAll(".moment-edit-route a[href='/moments']")).toHaveLength(0);
    const form = host.querySelector<HTMLFormElement>(
      'form[aria-label="Сохранение текстового черновика"]',
    );
    const save = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Сохранить черновик");
    const media = host.querySelector(".moment-photo-upload");
    expect(save?.form).toBe(form);
    expect(save && media && Boolean(
      save.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_PRECEDING,
    )).toBe(true);
    const file = host.querySelector<HTMLInputElement>(".moment-photo-upload-input");
    const picker = host.querySelector<HTMLLabelElement>(".moment-photo-upload-pick");
    expect(file?.type).toBe("file");
    expect(picker?.htmlFor).toBe(file?.id);
    expect(fetcher.mock.calls.map(([url]) => url)).not.toContain(
      "/api/v1/feed/posts");
    expect(fetcher.mock.calls.every(([, opts]) =>
      !opts?.method || opts.method === "GET")).toBe(true);
  });
  it("denied owner sees no edit control and no write", async () => {
    stubEditor("published", false);
    await render("/feed/create?edit=post-1");
    expect(host.textContent).toContain("Право редактирования больше недоступно");
    expect(host.querySelector(".moment-published-editor")).toBeNull();
    expect(fetcher.mock.calls.every(([, opts]) =>
      !opts?.method || opts.method === "GET")).toBe(true);
  });
  it("invalid edit key never falls through into a new-post draft", async () => {
    stubEditor("published");
    await render("/feed/create?edit=post-1&edit=post-2");
    expect(host.textContent).toContain("Недопустимая ссылка редактирования");
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("/feed/posts")))
      .toBe(false);
  });
});
