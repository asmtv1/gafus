// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionDetails } from "./QuestionDetails";
const base = (name = "Разрешённое обсуждение") => ({
  id: "question-1",
  title: name,
  body: "PRIVATE_QUESTION_BODY",
  category: "Поведение",
  status: "answered",
  answerCount: 0,
  createdAt: "2026-10-18T00:00:00Z",
  author: { id: "author-1", name: "Автор", avatarUrl: null },
  closed: false,
  canReply: true,
  canManage: false,
  canEdit: false,
  blockReason: null,
  photos: [],
  tags: [],
  answers: [],
  nextAnswerPage: null,
});
const firstAnswer = {
  id: "answer-1",
  body: "ПЕРВЫЙ ПОЛЕЗНЫЙ ОТВЕТ",
  author: { id: "a-1", name: "Ответчик" },
  best: false,
  deleted: false,
  hidden: false,
  liked: false,
  hearts: 0,
  parentId: null,
  replyToName: null,
  replyCount: 0,
  canEdit: false,
  canDelete: false,
  photos: [],
};
const ok = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify({
      success: status === 200,
      data,
      error: "SERVER_PRIVATE_DIAGNOSTIC",
    }),
    { status },
  );
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
    await new Promise((r) => setTimeout(r, 24));
  });
}
async function mount(userId = "A", editMode = false, questionId = "question-1") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <QuestionDetails userId={userId} questionId={questionId} editMode={editMode} />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
});

describe("question detail fresh authorization and cursor safety", () => {
  it.each([false, true])(
    "Q-D01 cached private detail never renders pending GET (edit=%s)",
    async (editMode) => {
      const pending = deferred<Response>();
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
      cache.setQueryData(["questions", "detail", "A", "question-1", "useful"], {
        pages: [{ ...base("STALE_PRIVATE_QUESTION"), canEdit: true, canManage: true }],
        pageParams: [1],
      });
      await mount("A", editMode);
      expect(host.textContent).toContain("Проверяем доступ");
      expect(host.textContent).not.toContain("STALE_PRIVATE_QUESTION");
      expect(host.textContent).not.toContain("PRIVATE_QUESTION_BODY");
      expect(host.querySelector("form")).toBeNull();
      await act(async () => pending.resolve(ok(null, 404)));
      await flush();
      expect(host.textContent).not.toContain("STALE_PRIVATE_QUESTION");
      expect(host.textContent).not.toContain("SERVER_PRIVATE_DIAGNOSTIC");
    },
  );
  it("Q-D02 HTTP401 does not display stale draft and routes login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(null, 401)));
    await mount();
    expect(host.textContent).toContain("Сессия завершена");
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).not.toContain("Повторить");
  });
  it.each(["next", "retry"])("Q-FLIGHT-PRE detail same-turn double %s emits one page2 GET", async mode => {
    const deferredPage2 = deferred<Response>();
    let nextCalls = 0;
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") throw Error("READ_ONLY_TEST");
      if (!url.includes("page=2")) return Promise.resolve(ok({
        ...base(), answers: [firstAnswer], nextAnswerPage: 2,
      }));
      nextCalls++;
      if (mode === "retry" && nextCalls === 1) return Promise.resolve(ok(null, 503));
      return deferredPage2.promise;
    });
    vi.stubGlobal("fetch", fetcher);
    await mount();
    const find = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === label);
    if (mode === "retry") { await act(async () => find("Ещё ответы")?.click()); await flush(); }
    const button = find(mode === "next" ? "Ещё ответы" : "Повторить страницу");
    expect(button).toBeDefined();
    await act(async () => { button?.click(); button?.click(); });
    await flush();
    expect(fetcher.mock.calls.filter(([url]) => url.includes("page=2"))).toHaveLength(
      mode === "retry" ? 2 : 1,
    );
    expect(host.textContent).toContain("ПЕРВЫЙ ПОЛЕЗНЫЙ ОТВЕТ");
    await act(async () => deferredPage2.resolve(ok({
      ...base(), answers: [{ ...firstAnswer, id: "answer-2", body: "ВТОРОЙ ОТВЕТ" }],
      nextAnswerPage: null,
    })));
    await flush();
    expect(host.textContent).toContain("ВТОРОЙ ОТВЕТ");
    expect(host.textContent?.match(/ПЕРВЫЙ ПОЛЕЗНЫЙ ОТВЕТ/g)).toHaveLength(1);
    expect(fetcher.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  });

  it("Q-FLIGHT-IDENTITY old question page2 cannot block new actor/question or show old", async () => {
    const old = deferred<Response>();
    const next = deferred<Response>();
    const fetcher = vi.fn((url: string) => {
      const changed = url.includes("/question-2?");
      if (url.includes("page=2")) return changed ? next.promise : old.promise;
      return Promise.resolve(ok({
        ...base(changed ? "НОВЫЙ ВОПРОС" : "СТАРЫЙ ВОПРОС"),
        id: changed ? "question-2" : "question-1",
        answers: [{ ...firstAnswer, id: changed ? "new-1" : "answer-1",
          body: changed ? "НОВЫЙ ОТВЕТ" : "ПЕРВЫЙ ПОЛЕЗНЫЙ ОТВЕТ" }],
        nextAnswerPage: 2,
      }));
    });
    vi.stubGlobal("fetch", fetcher);
    await mount();
    const more = () => [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Ещё ответы");
    await act(async () => more()?.click()); await flush();
    await mount("B", false, "question-2");
    expect(host.textContent).toContain("НОВЫЙ ВОПРОС");
    await act(async () => more()?.click()); await flush();
    const busy = () => [...host.querySelectorAll<HTMLButtonElement>("button")].some(
      button => button.disabled && button.textContent?.includes("Загрузка"),
    );
    expect(busy()).toBe(true);
    await act(async () => old.resolve(ok({ ...base(), answers: [
      { ...firstAnswer, id: "old-late", body: "PRIVATE_OLD_QUESTION" },
    ], nextAnswerPage: null })));
    await flush();
    expect(host.textContent).not.toContain("PRIVATE_OLD_QUESTION");
    expect(busy()).toBe(true);
    await act(async () => next.resolve(ok({ ...base("НОВЫЙ ВОПРОС"), id: "question-2",
      answers: [{ ...firstAnswer, id: "new-2", body: "ВТОРОЙ ОТВЕТ НОВОГО" }],
      nextAnswerPage: null })));
    await flush();
    expect(host.textContent).toContain("ВТОРОЙ ОТВЕТ НОВОГО");
    expect(fetcher.mock.calls.map(([url]) => url.includes("page=2")))
      .toEqual([false, true, false, true]);
  });

  it("Q-D03 second-page failure retains first verified answer and manual retry", async () => {
    let second = 0;
    const fetcher = vi.fn((path: string, options?: RequestInit) => {
      if (options?.method === "POST") throw Error("READ test must not issue POST");
      if (path.includes("page=2")) {
        second++;
        return Promise.resolve(
          second === 1
            ? ok(null, 503)
            : ok({
                ...base(),
                answers: [{ ...firstAnswer, id: "answer-2", body: "ВТОРОЙ ОТВЕТ" }],
                nextAnswerPage: null,
              }),
        );
      }
      return Promise.resolve(ok({ ...base(), answers: [firstAnswer], nextAnswerPage: 2 }));
    });
    vi.stubGlobal("fetch", fetcher);
    await mount();
    const more = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Ещё ответы",
    );
    expect(more).toBeDefined();
    await act(async () => more?.click());
    await flush();
    expect(host.textContent).toContain("ПЕРВЫЙ ПОЛЕЗНЫЙ ОТВЕТ");
    expect(host.textContent).toContain("Не удалось загрузить следующие ответы");
    expect(host.querySelector("form")).not.toBeNull();
    expect(host.textContent).not.toContain("SERVER_PRIVATE_DIAGNOSTIC");
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Повторить страницу",
    );
    expect(retry).toBeDefined();
    await act(async () => retry?.click());
    await flush();
    expect(host.textContent).toContain("ВТОРОЙ ОТВЕТ");
    expect(host.textContent?.match(/ПЕРВЫЙ ПОЛЕЗНЫЙ ОТВЕТ/g)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.map(([url]) => url.includes("page=2")))
      .toEqual([false, true, true]);
    expect(fetcher.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
  });
  it.each([
    [401, "Сессия завершена. Войдите снова."],
    [403, "Нет доступа к обсуждению."],
    [404, "Вопрос не найден или недоступен."],
  ])("Q-D06 page-two HTTP%s hides prior discussion and actions", async (status, message) => {
    const fetcher = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === "POST") throw Error("READ test must not issue POST");
      if (url.includes("page=2")) return Promise.resolve(ok(null, status));
      return Promise.resolve(ok({
        ...base("PRIVATE_PAGE_ONE_TITLE"),
        answers: [firstAnswer],
        nextAnswerPage: 2,
      }));
    });
    vi.stubGlobal("fetch", fetcher);
    await mount();
    expect(host.textContent).toContain("PRIVATE_PAGE_ONE_TITLE");
    expect(host.textContent).toContain("ПЕРВЫЙ ПОЛЕЗНЫЙ ОТВЕТ");
    expect(host.querySelector("form")).not.toBeNull();
    const more = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Ещё ответы");
    expect(more).toBeDefined();
    await act(async () => more?.click());
    await flush();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(host.textContent).not.toContain("PRIVATE_PAGE_ONE_TITLE");
    expect(host.textContent).not.toContain("PRIVATE_QUESTION_BODY");
    expect(host.textContent).not.toContain("ПЕРВЫЙ ПОЛЕЗНЫЙ ОТВЕТ");
    expect(host.textContent).not.toContain("SERVER_PRIVATE_DIAGNOSTIC");
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector(".compact-grid")).toBeNull();
    expect(host.textContent).not.toContain("Не удалось загрузить следующие ответы");
    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(host.querySelector('a[href="/login"]') !== null).toBe(status === 401);
    expect(fetcher.mock.calls.map(([url]) => url.includes("page=2")))
      .toEqual([false, true]);
  });
  it("Q-D04 switching principal clears previous draft and permissions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(ok(base()))),
    );
    await mount("A");
    const input = host.querySelector<HTMLTextAreaElement>("#question-reply");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    await act(async () => {
      setter?.call(input, "СЕКРЕТНЫЙ ЧЕРНОВИК A");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.textContent).toContain("СЕКРЕТНЫЙ ЧЕРНОВИК A");
    await mount("B");
    expect(host.querySelector<HTMLTextAreaElement>("#question-reply")?.value).toBe("");
    expect(host.textContent).not.toContain("СЕКРЕТНЫЙ ЧЕРНОВИК A");
  });
  it("Q-D05 late POST from old owner cannot clear or publish new owner's draft", async () => {
    const oldPost = deferred<Response>();
    vi.stubGlobal("crypto", { randomUUID: () => "550e8400-e29b-41d4-a716-446655440000" });
    const fetcher = vi.fn((_url: string, options?: RequestInit) =>
      options?.method === "POST" ? oldPost.promise : Promise.resolve(ok(base())),
    );
    vi.stubGlobal("fetch", fetcher);
    await mount("A");
    const input = host.querySelector<HTMLTextAreaElement>("#question-reply");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    await act(async () => {
      setter?.call(input, "ЧЕРНОВИК A");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      host
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    await flush();
    expect(host.textContent).toContain("Отправляем");
    await mount("B");
    const newInput = host.querySelector<HTMLTextAreaElement>("#question-reply");
    expect(newInput?.value).toBe("");
    await act(async () => {
      setter?.call(newInput, "СОБСТВЕННЫЙ ЧЕРНОВИК B");
      newInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => oldPost.resolve(ok({ id: "a-answer-new" })));
    await flush();
    expect(host.textContent).toContain("СОБСТВЕННЫЙ ЧЕРНОВИК B");
    expect(host.textContent).not.toContain("Ответ отправлен");
    expect(host.textContent).not.toContain("ЧЕРНОВИК A");
    expect(fetcher.mock.calls.filter(([, opt]) => opt?.method === "POST")).toHaveLength(1);
  });
});
