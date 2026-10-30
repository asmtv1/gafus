// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionCreate } from "./QuestionCreate";
import { installQuestionPhotoV2Browser, photoV2Reservation,
  photoV2Confirmation } from "./questionPhotoV2.test-helper";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let cache: QueryClient;

function api(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200, data, error: "Сервер временно недоступен",
  }), { status });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/questions/new");
  vi.stubGlobal("crypto", { randomUUID: () => UUID });
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear(); host.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

async function mount(fetcher: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetcher);
  await act(async () => root.render(createElement(
    QueryClientProvider, { client: cache },
    createElement(QuestionCreate, { userId: "user-1" }),
  )));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
}

async function fill(selector: string, value: string, textarea = false) {
  const node = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  const proto = textarea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  await act(async () => host.querySelector("form")?.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  ));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
}

describe("question publication through shared Core/Hono", () => {
  it("cannot publish when backend says account is blocked", async () => {
    const fake = vi.fn().mockResolvedValue(api({
      items: [], nextPage: null, canPublish: false, blockReason: "blocked",
    }));
    await mount(fake);
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("недоступна");
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("retains original Next title-details-category-tags-photo ordering and placeholders", async () => {
    const fake = vi.fn(async () => api({ items: [], nextPage: null, canPublish: true, blockReason: null }));
    await mount(fake);
    const form = host.querySelector('section[aria-label="Создать вопрос"] form')!;
    expect(form).not.toBeNull();
    const ids = [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      '#question-title,#question-body,#question-category,#question-tags',
    )].map(el => el.id);
    expect(ids).toEqual(['question-title', 'question-body', 'question-category', 'question-tags']);
    expect(host.querySelector<HTMLSelectElement>("#question-category")?.value).toBe("Другое");
    expect(host.querySelector<HTMLTextAreaElement>('#question-body')?.placeholder)
      .toBe('Опишите ситуацию и что уже пробовали');
    expect(form.querySelector('.web4-question-fields-row')?.children).toHaveLength(2);
    expect(form.querySelector('.web4-question-photos-block h3')?.textContent).toContain('Фотографии');
  });

  it("sends normalized optional tags to Core and blocks over-limit tag sets before POST", async () => {
    const fake = vi.fn((_path: string, init?: RequestInit) => Promise.resolve(
      init?.method === "POST" ? api({ id: "question-tags-ok" })
        : api({ items: [], nextPage: null, canPublish: true, blockReason: null }),
    ));
    await mount(fake);
    await fill("#question-title", "Учимся слушать команды");
    await fill("#question-body", "Поделитесь советами по занятиям", true);
    await fill("#question-tags", "#щенок, прогулка, обучение, игра, уход, шестой");
    await submit();
    expect(fake.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(0);
    expect(host.textContent).toContain("Не более 5 тегов");
    await fill("#question-tags", "#щенок, прогулка");
    await submit();
    expect(fake.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
    const write = fake.mock.calls.find(call => call[1]?.method === "POST");
    expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({
      title: "Учимся слушать команды", body: "Поделитесь советами по занятиям",
      tags: ["щенок", "прогулка"], clientRequestId: UUID,
    });
    expect(window.location.pathname).toBe("/questions/question-tags-ok");
  });

  it("submits exact Core fields and navigates only after confirmation", async () => {
    const fake = vi.fn((path: string, init?: RequestInit) => Promise.resolve(
      init?.method === "POST" ? api({ id: "question-A" })
        : api({ items: [], nextPage: null, canPublish: true, blockReason: null }),
    ));
    await mount(fake);
    await fill("#question-title", "Как научить команде?");
    await fill("#question-body", "Подскажите упражнения", true);
    expect(window.location.pathname).toBe("/questions/new");
    await submit();
    expect(window.location.pathname).toBe("/questions/question-A");
    const mutation = fake.mock.calls.find(call => call[1]?.method === "POST");
    expect(mutation?.[0]).toBe("/api/v1/questions");
    expect(JSON.parse(String(mutation?.[1]?.body))).toEqual({
      title: "Как научить команде?", body: "Подскажите упражнения",
      category: "Другое", tags: [], photoIds: [], clientRequestId: UUID,
    });
  });

  it("uploads the selected photo before sending its ID with question creation", async () => {
    const direct = installQuestionPhotoV2Browser("blob:local-upload");
    const fake = vi.fn((path: string, init?: RequestInit) => {
      if (path === "/api/v1/questions/photos/reservations")
        return Promise.resolve(photoV2Reservation("photo-1"));
      if (path === "/api/v1/questions/photos/photo-1/confirm")
        return Promise.resolve(photoV2Confirmation("photo-1"));
      if (path === "/api/v1/questions" && init?.method === "POST")
        return Promise.resolve(api({ id: "question-C" }));
      return Promise.resolve(api({
        items: [], nextPage: null, canPublish: true, blockReason: null,
      }));
    });
    await mount(fake);
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([new Uint8Array([255, 216, 255])], "dog.jpg", {
      type: "image/jpeg",
    });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(host.textContent).toContain("1 из 5");
    expect(host.querySelector("img")?.getAttribute("src")).toBe("blob:local-upload");
    expect(host.innerHTML).not.toContain("signed.example");
    await fill("#question-title", "Почему собака боится улицы?");
    await fill("#question-body", "Помогите с социализацией", true);
    await submit();
    expect(window.location.pathname).toBe("/questions/question-C");
    const write = fake.mock.calls.find(call => call[0] === "/api/v1/questions" &&
      call[1]?.method === "POST");
    expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({
      title: "Почему собака боится улицы?",
      photoIds: ["photo-1"], clientRequestId: UUID,
    });
    const reservation = fake.mock.calls.find(call=>call[0] === "/api/v1/questions/photos/reservations");
    expect(reservation?.[1]?.credentials).toBe("include");
    expect(JSON.parse(String(reservation?.[1]?.body))).toEqual({mime:"image/jpeg",bytes:3});
    expect(direct).toHaveLength(1);
    expect(direct[0]).toMatchObject({method:"POST",withCredentials:false});
    expect(direct[0]?.form?.get("key")).toBe("questions/v2/photo-1/source.jpg");
    expect((direct[0]?.form?.get("file") as File).name).toBe("dog.jpg");
    expect(fake.mock.calls.map(([path])=>path))
      .toContain("/api/v1/questions/photos/photo-1/confirm");
  });

  it("retry of identical content reuses UUID after HTTP failure", async () => {
    let writes = 0;
    const fake = vi.fn((_path: string, init?: RequestInit) => {
      if (init?.method !== "POST") return Promise.resolve(api({
        items: [], nextPage: null, canPublish: true, blockReason: null,
      }));
      return Promise.resolve(++writes === 1 ? api(null, 503) : api({ id: "question-B" }));
    });
    await mount(fake);
    await fill("#question-title", "Не слушается");
    await fill("#question-body", "Помогите с командой рядом", true);
    await submit();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(window.location.pathname).toBe("/questions/new");
    await submit();
    expect(window.location.pathname).toBe("/questions/question-B");
    const mutations = fake.mock.calls.filter(call => call[1]?.method === "POST");
    expect(mutations).toHaveLength(2);
    expect(JSON.parse(String(mutations[0]?.[1]?.body)).clientRequestId).toBe(UUID);
    expect(JSON.parse(String(mutations[1]?.[1]?.body)).clientRequestId).toBe(UUID);
  });
});


// SOC040_CREATE_FLIGHT — same current question form, only synthetic fetch.
describe("SOC040_CREATE_FLIGHT existing question publication", () => {
  it("two same-turn native submits create one POST with exactly one stable request ID", async () => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>(done => { resolve = done; });
    const fake = vi.fn((_url: string, init?: RequestInit) => init?.method === "POST"
      ? pending : Promise.resolve(api({ items: [], nextPage: null, canPublish: true,
        blockReason: null })));
    await mount(fake);
    await fill("#question-title", "Синхронное создание");
    await fill("#question-body", "Вопрос о тренировке", true);
    await act(async () => {
      const form = host.querySelector("form");
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    const posts = fake.mock.calls.filter(call => call[1]?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({
      title: "Синхронное создание", body: "Вопрос о тренировке", category: "Другое",
      tags: [], photoIds: [], clientRequestId: UUID,
    });
    expect(window.location.pathname).toBe("/questions/new");
    await act(async () => resolve(api({ id: "question-C" })));
    await act(async () => { await new Promise(done => setTimeout(done, 20)); });
    expect(window.location.pathname).toBe("/questions/question-C");
  });

  it("unknown ACK releases flight; explicit retry reuses identical ID without auto replay", async () => {
    let writes = 0;
    const fake = vi.fn((_url: string, init?: RequestInit) => Promise.resolve(
      init?.method === "POST" ? (++writes === 1 ? api(null, 503) : api({ id: "question-R" }))
        : api({ items: [], nextPage: null, canPublish: true, blockReason: null }),
    ));
    await mount(fake);
    await fill("#question-title", "Нужна помощь");
    await fill("#question-body", "Сложно заниматься", true);
    await submit();
    expect(writes).toBe(1);
    expect(host.textContent).toContain("Не удалось опубликовать вопрос");
    await act(async () => { await new Promise(done => setTimeout(done, 22)); });
    expect(writes).toBe(1);
    await submit();
    expect(writes).toBe(2);
    expect(fake.mock.calls.filter(call => call[1]?.method === "POST")
      .map(call => JSON.parse(String(call[1]?.body)).clientRequestId))
      .toEqual([UUID, UUID]);
    expect(window.location.pathname).toBe("/questions/question-R");
  });

  it("retired first author pending ACK cannot navigate new author's unsent draft", async () => {
    let complete!: (response: Response) => void;
    const pending = new Promise<Response>(done => { complete = done; });
    const fake = vi.fn((_url: string, init?: RequestInit) => init?.method === "POST"
      ? pending : Promise.resolve(api({ items: [], nextPage: null, canPublish: true,
        blockReason: null })));
    await mount(fake);
    await fill("#question-title", "Чужой заголовок");
    await fill("#question-body", "Чужой черновик", true);
    await act(async () => host.querySelector("form")?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ));
    await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
      createElement(QuestionCreate, { userId: "user-2" }))));
    await act(async () => { await new Promise(done => setTimeout(done, 20)); });
    await fill("#question-title", "Новый собственный заголовок");
    await fill("#question-body", "Новый собственный текст", true);
    await act(async () => complete(api({ id: "question-OLD" })));
    await act(async () => { await new Promise(done => setTimeout(done, 22)); });
    expect(window.location.pathname).toBe("/questions/new");
    expect(host.querySelector<HTMLInputElement>("#question-title")?.value)
      .toBe("Новый собственный заголовок");
    expect(host.querySelector<HTMLTextAreaElement>("#question-body")?.value)
      .toBe("Новый собственный текст");
    expect(fake.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
  });
});
