// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionCreate } from "./QuestionCreate";
const ok = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify({
      success: status === 200,
      data,
      error: "PRIVATE_ERROR_STACK",
    }),
    { status },
  );
const rights = (canPublish: boolean) => ({
  items: [],
  nextPage: null,
  canPublish,
  blockReason: null,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
let host: HTMLDivElement, root: Root, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 25));
  });
}
async function mount(userId = "A") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <QuestionCreate userId={userId} />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function fill(selector: string, value: string) {
  const node = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  expect(node).not.toBeNull();
  const proto =
    selector === "#question-body" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  await act(async () => {
    setter?.call(node, value);
    node?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function send() {
  await act(async () =>
    host
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/questions/new");
  vi.stubGlobal("crypto", { randomUUID: () => "550e8400-e29b-41d4-a716-446655440000" });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
describe("question composer owner authorization lifecycle", () => {
  it("Q-N01 cached right never exposes form or permits write before fresh GET", async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetcher);
    cache.setQueryData(["questions", "create-rights", "A"], rights(true));
    await mount();
    expect(host.textContent).toContain("Проверяем доступ");
    expect(host.querySelector("form")).toBeNull();
    await act(async () => pending.resolve(ok(rights(false))));
    await flush();
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).toContain("недоступна");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("Q-N02 HTTP401 offers login without stale form or retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(null, 401)));
    await mount();
    expect(host.textContent).toContain("Сессия завершена");
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_ERROR_STACK");
  });
  it("Q-N03 HTTP429 preserves draft and states rate limitation without secrets", async () => {
    const fetcher = vi.fn((_: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "POST" ? ok(null, 429) : ok(rights(true))),
    );
    vi.stubGlobal("fetch", fetcher);
    await mount();
    await fill("#question-title", "Не получается выгуливать");
    await fill("#question-body", "Что делать с поведением?");
    await send();
    expect(host.textContent).toContain("Лимит публикаций");
    expect(host.querySelector<HTMLInputElement>("#question-title")?.value).toBe(
      "Не получается выгуливать",
    );
    expect(host.querySelector<HTMLTextAreaElement>("#question-body")?.value).toBe(
      "Что делать с поведением?",
    );
    expect(host.textContent).not.toContain("PRIVATE_ERROR_STACK");
    expect(window.location.pathname).toBe("/questions/new");
  });
  it("Q-N04 A→B reset must isolate title, draft and previous permission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(ok(rights(true)))),
    );
    await mount("A");
    await fill("#question-title", "Секретный заголовок A");
    await fill("#question-body", "Секретный черновик A");
    await mount("B");
    expect(host.querySelector<HTMLInputElement>("#question-title")?.value).toBe("");
    expect(host.querySelector<HTMLTextAreaElement>("#question-body")?.value).toBe("");
    expect(host.textContent).not.toContain("Секретный заголовок A");
  });
  it("Q-N05 late ACK from old owner never navigates new session", async () => {
    const late = deferred<Response>();
    let gets = 0;
    const fetcher = vi.fn((_: string, init?: RequestInit) => {
      if (init?.method === "POST") return late.promise;
      gets++;
      return Promise.resolve(ok(rights(true)));
    });
    vi.stubGlobal("fetch", fetcher);
    await mount("A");
    await fill("#question-title", "Вопрос A");
    await fill("#question-body", "Дрессировка A");
    await send();
    expect(host.textContent).toContain("Публикуем");
    await mount("B");
    expect(host.querySelector<HTMLInputElement>("#question-title")?.value).toBe("");
    await act(async () => late.resolve(ok({ id: "question-A" })));
    await flush();
    expect(window.location.pathname).toBe("/questions/new");
    expect(host.textContent).not.toContain("Вопрос A");
    expect(gets).toBe(2);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("Q-N06 HTTP403 denies create without retry or privileged message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(null, 403)));
    await mount();
    expect(host.textContent).toContain("Публикация запрещена");
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).not.toContain("Проверить снова");
    expect(host.textContent).not.toContain("PRIVATE_ERROR_STACK");
  });
  it("Q-N07 HTTP409 keeps input and does not automatically replay POST", async () => {
    const fetcher = vi.fn((_: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "POST" ? ok(null, 409) : ok(rights(true))),
    );
    vi.stubGlobal("fetch", fetcher);
    await mount();
    await fill("#question-title", "Как помочь щенку?");
    await fill("#question-body", "Опишите эффективный подход");
    await send();
    expect(host.textContent).toContain("Конфликт публикации");
    expect(host.querySelector<HTMLInputElement>("#question-title")?.value).toBe(
      "Как помочь щенку?",
    );
    expect(host.querySelector<HTMLTextAreaElement>("#question-body")?.value).toBe(
      "Опишите эффективный подход",
    );
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("Q-N08 failed rights GET supports one explicit retry without submitting", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(ok(null, 503))
      .mockImplementationOnce(() => Promise.resolve(ok(rights(true))));
    vi.stubGlobal("fetch", fetcher);
    await mount();
    expect(host.querySelector("form")).toBeNull();
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Проверить снова",
    );
    expect(retry).toBeDefined();
    await act(async () => retry?.click());
    await flush();
    expect(host.querySelector("form")).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  });
});
