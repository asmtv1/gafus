// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TrainerArticleEditorRoute, type TrainerArticleWriteTransport,
} from "./TrainerArticleEditorRoute";

const actor = { id: "trainer-a", role: "TRAINER" as const };
const headers = { "cache-control": "private, no-store" };
const id = "cm1rtx5qq00024ph6y2swjp43";
const article = {
  id, title: "Первый курс", contentType: "HTML" as const,
  content: "<p>Статья</p>", visibility: "PAID" as const,
  videoUrl: null, logoImg: "", imageUrls: [],
  slug: "my-first-article", description: "Полный текст статьи",
};
let stored: typeof article | null;
let stale: boolean;
let readStatus: number;
let writeStatus: number;
const read = vi.fn(async () => ({
  status: stored === null ? 404 : readStatus,
  headers, body: stored === null ? { success: false } : { success: true, data: stored },
}));
const write = vi.fn(async (request: Parameters<TrainerArticleWriteTransport>[0]) => {
  if (writeStatus === 200 && !stale) {
    if (request.method === "DELETE") stored = null;
    else {
      const update = request.body as Omit<typeof article, "id">;
      stored = { ...article, ...update };
    }
  }
  return { status: writeStatus, headers, body: { success: writeStatus === 200 } };
});
let host: HTMLDivElement;
let root: Root;
const session = () => ({ actor, token: "opaque", authEpoch: "epoch-1" });
async function mount(props: Partial<Parameters<typeof TrainerArticleEditorRoute>[0]> = {}) {
  await act(async () => root.render(createElement(TrainerArticleEditorRoute, {
    pathname: "/main-panel/articles/" + id + "/edit",
    actor, token: "opaque", authEpoch: "epoch-1", enabled: true,
    articleReadTransport: read, articleWriteTransport: write,
    getCurrentSession: session, ...props,
  })));
}
async function change(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(label: string) {
  const button = Array.from(host.querySelectorAll("button"))
    .find(x => x.textContent?.includes(label));
  expect(button, label).toBeTruthy();
  await act(async () => button!.click());
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  stored = { ...article }; stale = false;
  readStatus = 200; writeStatus = 200;
  read.mockClear(); write.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
describe("trainer article edit Vite flow", () => {
  it("loads owner article, saves content and verifies server readback", async () => {
    await mount();
    expect(host.textContent).toContain("Редактирование статьи");
    const title = host.querySelector<HTMLInputElement>('input[maxlength="500"]')!;
    await change(title, "Новый заголовок");
    await act(async () => host.querySelector<HTMLFormElement>("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })));
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toMatchObject({
      method: "PUT", path: "/api/v1/trainer/articles/manage/" + id,
      body: { title: "Новый заголовок", slug: article.slug },
    });
    expect(read.mock.calls.length).toBeGreaterThan(1);
    expect(host.textContent).toContain("подтверждены сервером");
  });
  it("never deletes without confirmation and confirms deletion using GET 404", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await mount();
    await click("Удалить статью");
    expect(write).not.toHaveBeenCalled();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await click("Удалить статью");
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toMatchObject({
      method: "DELETE", path: "/api/v1/trainer/articles/manage/" + id,
    });
    expect(host.textContent).toContain("Удаление статьи подтверждено");
    expect(host.querySelector('a[href="/main-panel/articles"]')).toBeTruthy();
  });
  it("never claims update success without matching fresh server state", async () => {
    stale = true;
    await mount();
    const title = host.querySelector<HTMLInputElement>('input[maxlength="500"]')!;
    await change(title, "Новая статья");
    await click("Сохранить");
    expect(write).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("Изменения подтверждены");
  });
  it("denies retired session and Hono 403 without cached contents", async () => {
    readStatus = 403;
    await mount();
    expect(host.textContent).toContain("запрещён");
    expect(host.textContent).not.toContain("Первый курс");
    await mount({ getCurrentSession: () => null });
    expect(host.textContent).toContain("недоступен");
    expect(write).not.toHaveBeenCalled();
  });
});
