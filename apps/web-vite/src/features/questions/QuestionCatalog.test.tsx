// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionCatalog } from "./QuestionCatalog";
import { QuestionDetails } from "./QuestionDetails";
import { QuestionCloseButton, BestAnswerButton } from "./QuestionManagement";
import { questionPath, routeForPath } from "../../shared/router/location";

const q = {
  id: "question-1", title: "Тянет поводок", body: "Как помочь собаке?",
  category: "Поведение", status: "answered", author: { name: "Мария", id: "private" },
  answerCount: 1, createdAt: "2026-10-16T00:00:00.000Z", closed: false,
  canManage: false, canEdit: false, blockReason: null,
  tags: [], photos: [],
};

async function render(component: "list" | "detail", fetcher: ReturnType<typeof vi.fn>) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const child = component === "list"
    ? createElement(QuestionCatalog, { userId: "user-1" })
    : createElement(QuestionDetails, { userId: "user-1", questionId: "question-1" });
  await act(async () => root.render(createElement(QueryClientProvider, { client: cache }, child)));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
  return {
    host, cache,
    async unmount() { await act(async () => root.unmount()); },
    async cleanup() { await act(async () => root.unmount()); cache.clear(); host.remove(); },
  };
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: status === 200, data }), { status });
}
afterEach(() => vi.unstubAllGlobals());

describe("questions browser views", () => {
  it("renders list, hides private author id and follows explicit question route", async () => {
    const result = await render("list", vi.fn().mockResolvedValue(json({
      items: [q], nextPage: null, canPublish: false, blockReason: null,
    })));
    try {
      expect(result.host.textContent).toContain("Тянет поводок");
      expect(result.host.textContent).not.toContain("private");
      expect(result.host.querySelector('a[href="/questions/question-1"]')).not.toBeNull();
      expect(questionPath("question-1")).toBe("/questions/question-1");
      expect(routeForPath("/questions/../secret")).toBeNull();
    } finally { await result.cleanup(); }
  });

  it("pagination fetches next page without overwriting first page", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ items: [q], nextPage: 2, canPublish: true, blockReason: null }))
      .mockResolvedValueOnce(json({ items: [{ ...q, id: "question-2", title: "Второй вопрос" }],
        nextPage: null, canPublish: true, blockReason: null }));
    const result = await render("list", fetcher);
    try {
      expect(result.host.textContent).toContain(q.title);
      const more = Array.from(result.host.querySelectorAll("button"))
        .find(button => button.textContent?.includes("Ещё вопросы"));
      expect(more).not.toBeUndefined();
      await act(async () => more?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
      expect(fetcher.mock.calls[1][0]).toContain("page=2");
      expect(result.host.textContent).toContain(q.title);
      expect(result.host.textContent).toContain("Второй вопрос");
    } finally { await result.cleanup(); }
  });

  it("detail shows server-authorized text and clears private Query cache on unmount", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ ...q, canReply: true, answers: [{
      id: "answer-1", body: "Без рывков", best: true, liked: false, hearts: 2,
      author: { name: "Тренер", id: "secret" }, deleted: false, hidden: false,
        parentId: null, replyToName: null,
        replyCount: 0, canEdit: false, canDelete: false, photos: [],
    }], nextAnswerPage: null }));
    const result = await render("detail", fetcher);
    try {
      expect(result.host.textContent).toContain("Без рывков");
      expect(JSON.stringify(result.cache.getQueryData([
        "questions", "detail", "user-1", "question-1", "useful",
      ]))).not.toContain("secret");
      await result.unmount();
      await new Promise(resolve => setTimeout(resolve, 5));
      expect(result.cache.getQueryData(["questions", "detail", "user-1", "question-1", "useful"]))
        .toBeUndefined();
      result.cache.clear(); result.host.remove();
    } catch (error) { await result.cleanup(); throw error; }
  });

  it("loads more answers and deduplicates Core-pinned best answer", async () => {
    const best = { id: "answer-best", body: "Лучший совет", best: true,
      liked: false, hearts: 4,
      author: { name: "Кинолог", id: "secret" }, deleted: false, hidden: false,
        parentId: null, replyToName: null,
        replyCount: 0, canEdit: false, canDelete: false, photos: [] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ ...q, canReply: true, answers: [best], nextAnswerPage: 2 }))
      .mockResolvedValueOnce(json({ ...q, canReply: true, answers: [best, {
        ...best, id: "answer-other", body: "Другой совет", best: false,
      }], nextAnswerPage: null }));
    const result = await render("detail", fetcher);
    try {
      expect(result.host.textContent).toContain("Лучший совет");
      const more = Array.from(result.host.querySelectorAll("button"))
        .find(button => button.textContent?.includes("Ещё ответы"));
      expect(more).not.toBeUndefined();
      await act(async () => more?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
      expect(fetcher.mock.calls[1][0]).toContain("page=2");
      expect(result.host.textContent).toContain("Другой совет");
      expect(result.host.textContent?.match(/Лучший совет/g)).toHaveLength(1);
    } finally { await result.cleanup(); }
  });

  it("replies to a selected root answer with the shared replyToId", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "550e8400-e29b-41d4-a716-446655440000",
    });
    const fetcher = vi.fn((_path: string, options?: RequestInit) => Promise.resolve(
      options?.method === "POST" ? json({ id: "nested-created" }) : json({
        ...q, canReply: true, answers: [{
          id: "answer-root", body: "Корневой комментарий",
          author: { id: "trainer-1", name: "Кинолог" },
          best: false, deleted: false, hidden: false, liked: false, hearts: 0,
          parentId: null, replyToName: null, replyCount: 0,
          canEdit: false, canDelete: false, photos: [],
        }], nextAnswerPage: null,
      }),
    ));
    const result = await render("detail", fetcher);
    try {
      const select = Array.from(result.host.querySelectorAll("button"))
        .find(b => b.getAttribute("aria-label") === "Ответить на комментарий");
      expect(select).toBeDefined();
      await act(async () => select?.click());
      expect(result.host.textContent).toContain("Ответ для Кинолог");
      const input = result.host.querySelector<HTMLTextAreaElement>("#question-reply")!;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      await act(async () => {
        setter.call(input, "Спасибо за помощь");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => result.host.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      const sent = fetcher.mock.calls.find(call => call[1]?.method === "POST");
      expect(sent?.[0]).toBe("/api/v1/questions/question-1/answers");
      expect(JSON.parse(String(sent?.[1]?.body))).toEqual({
        body: "Спасибо за помощь", replyToId: "answer-root",
        photoIds: [], clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.host.textContent).toContain("Ответ отправлен");
      expect(result.host.textContent).not.toContain("Ответ для Кинолог");
    } finally { await result.cleanup(); }
  });

  it("does not duplicate inline child records from Core detail inside main root list", async () => {
    const root = { id: "root-1", body: "Корень обсуждения",
      author: { id: "author-1", name: "Автор" }, best: false,
      liked: false, hearts: 0, deleted: false, hidden: false,
      parentId: null, replyToName: null, replyCount: 1,
      canEdit: false, canDelete: false, photos: [],
    };
    const child = { ...root, id: "child-1", body: "Вложенный совет",
      best: true, parentId: "root-1", replyCount: 0,
    };
    const fetcher = vi.fn().mockResolvedValue(json({
      ...q, canReply: true, answers: [root, child], nextAnswerPage: null,
    }));
    const screen = await render("detail", fetcher);
    try {
      const main = screen.host.querySelector(
        "[aria-label='Ответы на вопрос'] > ul.compact-grid",
      );
      expect(main?.querySelectorAll(":scope > li")).toHaveLength(1);
      expect(main?.textContent).toContain("Корень обсуждения");
      expect(main?.textContent).not.toContain("Вложенный совет");
      const best = screen.host.querySelector("[aria-label='Лучший вложенный ответ']");
      expect(best?.textContent).toContain("Вложенный совет");
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { await screen.cleanup(); }
  });

  it("sort switches to authoritative newest server order with distinct cache", async () => {
    const makeAnswer = (id: string, body: string) => ({
      id, body, best: false, liked: false, hearts: 0,
      author: { id: "other-person", name: "Собачник" },
      deleted: false, hidden: false, parentId: null, replyToName: null,
      replyCount: 0, canEdit: false, canDelete: false, photos: [],
    });
    const fetcher = vi.fn((url: string, _init?: RequestInit) => Promise.resolve(json({
      ...q, canReply: true, nextAnswerPage: null,
      answers: url.includes("sort=new")
        ? [makeAnswer("new", "Новый ответ от Core")]
        : [makeAnswer("useful", "Полезный ответ от Core")],
    })));
    const screen = await render("detail", fetcher);
    try {
      expect(screen.host.textContent).toContain("Полезный ответ от Core");
      expect(screen.host.querySelector('.web4-question-answer-sort button[aria-pressed="true"]')
        ?.textContent).toBe("Полезные");
      const latest = [...screen.host.querySelectorAll<HTMLButtonElement>(
        ".web4-question-answer-sort button",
      )].find(button => button.textContent === "Новые");
      await act(async () => latest?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 35)); });
      expect(screen.host.textContent).toContain("Новый ответ от Core");
      expect(screen.host.textContent).not.toContain("Полезный ответ от Core");
      expect(fetcher.mock.calls.some(([url]) => url.includes("?page=1&sort=new")))
        .toBe(true);
      expect(screen.cache.getQueryData(["questions", "detail", "user-1", "question-1", "new"]))
        .toBeDefined();
      expect(fetcher.mock.calls.every(([, options]) => options?.method !== "POST"))
        .toBe(true);
    } finally { await screen.cleanup(); }
  });

  it("renders authorized inline child from original Core GET once and dedupes additional fetch", async () => {
    const root = { id: "root-1", body: "Родительский совет", best: false,
      author: { id: "owner-2", name: "Кинолог", avatarUrl: "/uploads/users/demo/avatar.webp" }, liked: false, hearts: 1,
      deleted: false, hidden: false, parentId: null, replyToName: null,
      replyCount: 2, canEdit: false, canDelete: false, photos: [],
    };
    const child = { ...root, id: "child-1", body: "Уже загруженный ответ",
      parentId: "root-1", replyCount: 0, replyToName: "Кинолог",
    };
    const other = { ...child, id: "child-2", body: "Дополнительный ответ" };
    const fetcher = vi.fn((url: string) => Promise.resolve(json(
      url.includes("/replies?") ? {items:[child,other],nextPage:null}
        : {...q,canReply:true,answers:[root,child],nextAnswerPage:null},
    )));
    const screen = await render("detail", fetcher);
    try {
      expect(screen.host.querySelectorAll(".web4-question-answer-list > li"))
        .toHaveLength(1);
      expect(screen.host.querySelector(".web4-question-inline-replies")?.textContent)
        .toContain("Уже загруженный ответ");
      const mainAnswer = screen.host.querySelector(".web4-question-answer-list > li");
      expect(mainAnswer?.firstElementChild?.tagName).toBe("HEADER");
      expect(mainAnswer?.querySelector(".web4-question-answer-avatar img")?.getAttribute("src"))
        .toBe("/uploads/users/demo/avatar.webp");
      expect(mainAnswer?.querySelector(":scope > .web4-question-answer-body > p")?.textContent)
        .toBe("Родительский совет");
      const inlineAnswer = mainAnswer?.querySelector(".web4-question-inline-reply");
      expect(inlineAnswer?.firstElementChild?.tagName).toBe("HEADER");
      expect(inlineAnswer?.querySelector(".web4-question-answer-avatar img")?.getAttribute("src"))
        .toBe("/uploads/users/demo/avatar.webp");
      expect(inlineAnswer?.querySelector(".web4-question-reply-context")?.textContent)
        .toBe("В ответ Кинолог");
      expect(inlineAnswer?.querySelector(".web4-question-answer-body > p")?.textContent)
        .toBe("Уже загруженный ответ");
      expect(fetcher).toHaveBeenCalledTimes(1);
      const more = [...screen.host.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent === "Ещё ответы в ветке");
      expect(more).toBeDefined();
      await act(async () => more?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 35)); });
      expect(screen.host.textContent?.match(/Уже загруженный ответ/g)).toHaveLength(1);
      expect(screen.host.textContent).toContain("Дополнительный ответ");
      const fetchedAnswer = screen.host.querySelector(
        ".web4-question-thread-replies > .web4-question-inline-reply",
      );
      expect(fetchedAnswer?.firstElementChild?.tagName).toBe("HEADER");
      expect(fetchedAnswer?.querySelector(".web4-question-answer-avatar img")?.getAttribute("src"))
        .toBe("/uploads/users/demo/avatar.webp");
      const fetchedImage = fetchedAnswer?.querySelector(".web4-question-answer-avatar img");
      await act(async () => fetchedImage?.dispatchEvent(new Event("error", { bubbles: true })));
      expect(fetchedAnswer?.querySelector(".web4-question-answer-avatar img")).toBeNull();
      expect(fetchedAnswer?.querySelector(".web4-question-answer-avatar")?.textContent)
        .toBe("К");
      expect(fetchedAnswer?.querySelector(".web4-question-reply-context")?.textContent)
        .toBe("В ответ Кинолог");
      expect(fetchedAnswer?.querySelector(".web4-question-answer-body > p")?.textContent)
        .toBe("Дополнительный ответ");
      expect(fetcher.mock.calls[1][0]).toContain("/answers/root-1/replies?page=1");
    } finally { await screen.cleanup(); }
  });

  it("hides reply form when Core says user cannot answer", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({
      ...q, canReply: false, answers: [], nextAnswerPage: null,
    }));
    const result = await render("detail", fetcher);
    try {
      expect(result.host.textContent).toContain("Ответы сейчас недоступны для вашего аккаунта");
      expect(result.host.querySelector("#question-reply")).toBeNull();
      expect(result.host.querySelector("form")).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { await result.cleanup(); }
  });

  it("closed discussion does not show a reply input", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({
      ...q, closed: true, canReply: false, answers: [], nextAnswerPage: null,
    }));
    const result = await render("detail", fetcher);
    try {
      expect(result.host.textContent).toContain("Обсуждение закрыто");
      expect(result.host.querySelector("form")).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { await result.cleanup(); }
  });

  it("submits answer only after Core permission and refreshes server-owned discussion", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "550e8400-e29b-41d4-a716-446655440000" });
    const fetcher = vi.fn((_path: string, options?: RequestInit) => Promise.resolve(
      options?.method === "POST"
        ? json({ id: "answer-new" })
        : json({ ...q, canReply: true, answers: [], nextAnswerPage: null }),
    ));
    const result = await render("detail", fetcher);
    try {
      const input = result.host.querySelector<HTMLTextAreaElement>("#question-reply")!;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      await act(async () => {
        setter.call(input, "Приучайте постепенно");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => result.host.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      const post = fetcher.mock.calls.find(call => call[1]?.method === "POST");
      expect(post?.[0]).toBe("/api/v1/questions/question-1/answers");
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        body: "Приучайте постепенно", photoIds: [],
        clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.host.textContent).toContain("Ответ отправлен");
      expect(input.value).toBe("");
      expect(fetcher.mock.calls.filter(call => call[1]?.method !== "POST").length)
        .toBeGreaterThan(1);
    } finally { await result.cleanup(); }
  });

  it("retries same answer using identical request UUID after 503 without optimistic success", async () => {
    const UUID = "550e8400-e29b-41d4-a716-446655440000";
    vi.stubGlobal("crypto", { randomUUID: () => UUID });
    let writes = 0;
    const fetcher = vi.fn((_path: string, options?: RequestInit) => Promise.resolve(
      options?.method === "POST"
        ? (++writes === 1 ? json(null, 503) : json({ id: "answer-new" }))
        : json({ ...q, canReply: true, answers: [], nextAnswerPage: null }),
    ));
    const result = await render("detail", fetcher);
    try {
      const input = result.host.querySelector<HTMLTextAreaElement>("#question-reply")!;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      await act(async () => {
        setter.call(input, "Спокойные упражнения");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const submit = async () => {
        await act(async () => result.host.querySelector("form")!.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ));
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      };
      await submit();
      expect(result.host.querySelector('[role="alert"]')?.textContent).toContain("Не удалось");
      expect(result.host.textContent).not.toContain("Ответ отправлен");
      expect(input.value).toBe("Спокойные упражнения");
      await submit();
      const writesRequests = fetcher.mock.calls.filter(call => call[1]?.method === "POST");
      expect(writesRequests).toHaveLength(2);
      expect(writesRequests.map(call => JSON.parse(String(call[1]?.body)).clientRequestId))
        .toEqual([UUID, UUID]);
      expect(result.host.textContent).toContain("Ответ отправлен");
    } finally { await result.cleanup(); }
  });

  it("blocked account cannot react to another author's answer", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({
      ...q, canManage: false, canReply: false, blockReason: "restricted",
      answers: [{ id: "answer-1", body: "Helpful", author: {
        id: "trainer-1", name: "Trainer",
      }, liked: false, hearts: 1, best: false, deleted: false, hidden: false,
        parentId: null, replyToName: null,
        replyCount: 0, canEdit: false, canDelete: false, photos: [] }],
      nextAnswerPage: null,
    }));
    const result = await render("detail", fetcher);
    try {
      const button = result.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Поставить сердечко"]',
      );
      expect(button?.disabled).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { await result.cleanup(); }
  });

  it("own answer is not eligible for hearts even before Core rejection", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ ...q, canReply: true,
      nextAnswerPage: null, answers: [{ id: "answer-1", body: "Мой ответ",
        author: { id: "user-1", name: "Я" },
        liked: false, hearts: 0, best: false, deleted: false, hidden: false,
        parentId: null, replyToName: null,
        replyCount: 0, canEdit: true, canDelete: false, photos: [],
      }],
    }));
    const result = await render("detail", fetcher);
    try {
      const heart = result.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Поставить сердечко"]',
      );
      expect(heart).not.toBeNull();
      expect(heart?.disabled).toBe(true);
      expect(heart?.getAttribute("aria-pressed")).toBe("false");
      expect(heart?.getAttribute("aria-description"))
        .toBe("Своему ответу нельзя поставить сердечко");
      expect(heart?.closest(".answer-heart")?.getAttribute("title"))
        .toBe("Своему ответу нельзя поставить сердечко");
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { await result.cleanup(); }
  });

  it("hearts update only after server ACK and refetch, no optimistic count", async () => {
    let liked = false;
    const fetcher = vi.fn((_path: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        liked = true;
        return Promise.resolve(json({ liked: true, hearts: 2 }));
      }
      return Promise.resolve(json({ ...q, canReply: true,
        nextAnswerPage: null, answers: [{ id: "answer-1", body: "Полезный ответ",
          author: { id: "trainer-1", name: "Тренер" }, liked,
          hearts: liked ? 2 : 1, best: false, deleted: false, hidden: false,
        parentId: null, replyToName: null,
        replyCount: 0, canEdit: false, canDelete: false, photos: [],
        }],
      }));
    });
    const result = await render("detail", fetcher);
    try {
      const heart = result.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Поставить сердечко"]',
      );
      expect(heart?.disabled).toBe(false);
      expect(heart?.textContent).toContain("1");
      expect(heart?.getAttribute("aria-pressed")).toBe("false");
      await act(async () => heart?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      const post = fetcher.mock.calls.find(call => call[1]?.method === "POST");
      expect(post?.[0]).toBe("/api/v1/questions/answers/answer-1/heart");
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({ liked: true });
      const pressed = result.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Убрать сердечко"]',
      );
      expect(pressed?.getAttribute("aria-pressed")).toBe("true");
      expect(pressed?.textContent).toContain("2");
      expect(fetcher.mock.calls.filter(call => call[1]?.method !== "POST").length)
        .toBeGreaterThan(1);
    } finally { await result.cleanup(); }
  });

  it("failed heart leaves server state untouched and shows retryable error", async () => {
    const fetcher = vi.fn((_path: string, options?: RequestInit) => Promise.resolve(
      options?.method === "POST" ? json(null, 503)
        : json({ ...q, canReply: true, nextAnswerPage: null,
          answers: [{ id: "answer-1", body: "Ответ", author: {
            id: "trainer-1", name: "Тренер",
          }, liked: false, hearts: 4, best: false, deleted: false, hidden: false,
        parentId: null, replyToName: null,
        replyCount: 0, canEdit: false, canDelete: false, photos: [] }],
        }),
    ));
    const result = await render("detail", fetcher);
    try {
      await act(async () => result.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Поставить сердечко"]',
      )?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(result.host.querySelector('button[aria-label="Поставить сердечко"][aria-pressed="false"]')?.textContent).toContain("4");
      expect(result.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось изменить сердечко");
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally { await result.cleanup(); }
  });

  it("does not show management operations to nonowner or blocked owner", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ ...q, canReply: true, canManage: false,
        answers: [], nextAnswerPage: null }))
      .mockResolvedValueOnce(json({ ...q, canReply: false, canManage: true,
        blockReason: "restricted", answers: [], nextAnswerPage: null }));
    const other = await render("detail", fetcher);
    try {
      expect(other.host.textContent).not.toContain("Закрыть обсуждение");
      expect(other.host.textContent).not.toContain("Выбрать лучший ответ");
    } finally { await other.cleanup(); }
    const blocked = await render("detail", fetcher);
    try {
      expect(blocked.host.textContent).not.toContain("Закрыть обсуждение");
      expect(blocked.host.querySelector("#question-reply")).toBeNull();
    } finally { await blocked.cleanup(); }
  });

  it("owner closes question only after server acknowledgement and refresh", async () => {
    let closed = false;
    const fetcher = vi.fn((_path: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        closed = true;
        return Promise.resolve(json({ id: "question-1" }));
      }
      return Promise.resolve(json({ ...q, closed, canReply: !closed,
        canManage: true, answers: [], nextAnswerPage: null }));
    });
    const result = await render("detail", fetcher);
    try {
      const close = Array.from(result.host.querySelectorAll("button"))
        .find(button => button.textContent?.includes("Закрыть обсуждение"));
      expect(close).not.toBeUndefined();
      await act(async () => close?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      const post = fetcher.mock.calls.find(call => call[1]?.method === "POST");
      expect(post?.[0]).toBe("/api/v1/questions/question-1/close");
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({ closed: true });
      expect(result.host.textContent).toContain("Открыть обсуждение");
      expect(result.host.textContent).toContain("Обсуждение закрыто");
      expect(result.host.querySelector("#question-reply")).toBeNull();
    } finally { await result.cleanup(); }
  });

  it("owner can choose a best answer; rewards and authorization remain server-owned", async () => {
    let best = false;
    const fetcher = vi.fn((_path: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        best = true;
        return Promise.resolve(json({ id: "question-1" }));
      }
      return Promise.resolve(json({ ...q, canManage: true, canReply: true,
        answers: [{ id: "answer-1", body: "Упражнение", author: {
          id: "trainer-1", name: "Тренер",
        }, best, liked: false, hearts: 0, deleted: false, hidden: false,
        parentId: null, replyToName: null,
        replyCount: 0, canEdit: false, canDelete: false, photos: [] }],
        nextAnswerPage: null,
      }));
    });
    const result = await render("detail", fetcher);
    try {
      const pick = Array.from(result.host.querySelectorAll("button"))
        .find(button => button.textContent?.includes("Выбрать лучший ответ"));
      expect(pick).not.toBeUndefined();
      await act(async () => pick?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      const post = fetcher.mock.calls.find(call => call[1]?.method === "POST");
      expect(post?.[0]).toBe("/api/v1/questions/question-1/best");
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({ answerId: "answer-1" });
      expect(result.host.textContent).toContain("Снять отметку лучшего ответа");
      expect(result.host.textContent).toContain("Лучший ответ");
    } finally { await result.cleanup(); }
  });

  it("management failure preserves server state and shows a retryable error", async () => {
    const fetcher = vi.fn((_path: string, options?: RequestInit) => Promise.resolve(
      options?.method === "POST" ? json(null, 403) : json({
        ...q, canManage: true, canReply: true, answers: [], nextAnswerPage: null,
      }),
    ));
    const result = await render("detail", fetcher);
    try {
      const close = Array.from(result.host.querySelectorAll("button"))
        .find(button => button.textContent?.includes("Закрыть обсуждение"));
      await act(async () => close?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(result.host.textContent).toContain("Закрыть обсуждение");
      expect(result.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось изменить состояние обсуждения");
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally { await result.cleanup(); }
  });

  it("failed detail request shows error, never fake discussion", async () => {
    const result = await render("detail", vi.fn().mockResolvedValue(json(null, 404)));
    try {
      expect(result.host.querySelector('[role="alert"]')).not.toBeNull();
      expect(result.host.textContent).not.toContain("Без рывков");
    } finally { await result.cleanup(); }
  });
});


// QA030_MANAGEMENT_SAME_TURN: existing real mounted Q&A consumer + synthetic fetch.
const managedAnswer = {
  id: "answer-1", body: "Полезный совет", author: { id: "trainer-1", name: "Кинолог" },
  best: false, liked: false, hearts: 0, deleted: false, hidden: false,
  parentId: null, replyToName: null, replyCount: 0, canEdit: false,
  canDelete: false, photos: [],
};
function pendingManagement() {
  let resolve!: (result: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
const managementWrites = (fetcher: ReturnType<typeof vi.fn>) =>
  fetcher.mock.calls.filter(call => (call[1] as RequestInit | undefined)?.method === "POST");
function managementButton(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(item => item.textContent?.includes(text));
  if (!button) throw Error("Missing management control: " + text);
  return button;
}

describe("QA030_MANAGEMENT_SAME_TURN question owner closure and best answer", () => {
  it.each(["close", "best"])("%s: two same-turn clicks on actual question view send one POST", async kind => {
    const pending = pendingManagement();
    let acknowledged = false;
    const fetcher = vi.fn((path: string, init?: RequestInit) => {
      if (init?.method === "POST") return pending.promise;
      return Promise.resolve(json({ ...q, canManage: true, canReply: !acknowledged,
        closed: kind === "close" && acknowledged,
        answers: [{ ...managedAnswer, best: kind === "best" && acknowledged }],
        nextAnswerPage: null }));
    });
    const result = await render("detail", fetcher);
    try {
      const text = kind === "close" ? "Закрыть обсуждение" : "Выбрать лучший ответ";
      const button = managementButton(result.host, text);
      await act(async () => { button.click(); button.click(); await Promise.resolve(); });
      const beforeACK = managementWrites(fetcher);
      acknowledged = true;
      await act(async () => pending.resolve(json({ id: "question-1" })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 28)); });
      expect(beforeACK).toHaveLength(1);
      expect(beforeACK[0][0]).toBe(`/api/v1/questions/question-1/${kind}`);
      expect(JSON.parse(String(beforeACK[0][1]?.body))).toEqual(
        kind === "close" ? { closed: true } : { answerId: "answer-1" },
      );
      expect(result.host.textContent).toContain(kind === "close"
        ? "Открыть обсуждение" : "Снять отметку лучшего ответа");
    } finally { await result.cleanup(); }
  });

  it("failed best ACK has no automatic retry; next explicit owner click may retry", async () => {
    let calls = 0;
    let best = false;
    const fetcher = vi.fn((path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        calls++;
        if (calls === 1) return Promise.resolve(json(null, 503));
        best = true;
        return Promise.resolve(json({ id: "question-1" }));
      }
      return Promise.resolve(json({ ...q, canManage: true, canReply: true,
        answers: [{ ...managedAnswer, best }], nextAnswerPage: null }));
    });
    const result = await render("detail", fetcher);
    try {
      await act(async () => managementButton(result.host, "Выбрать лучший ответ").click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 24)); });
      expect(calls).toBe(1);
      expect(result.host.textContent).toContain("Не удалось изменить лучший ответ");
      expect(result.host.textContent).toContain("Выбрать лучший ответ");
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(calls).toBe(1);
      await act(async () => managementButton(result.host, "Выбрать лучший ответ").click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 28)); });
      expect(calls).toBe(2);
      expect(result.host.textContent).toContain("Снять отметку лучшего ответа");
    } finally { await result.cleanup(); }
  });

  it.each(["close", "best"])("%s: old owner/question ACK cannot disable or invalidate newer target", async kind => {
    const former = pendingManagement();
    const latest = pendingManagement();
    const fetcher = vi.fn((path: string, init?: RequestInit) => {
      if (init?.method === "POST") return path.includes("question-1/")
        ? former.promise : latest.promise;
      throw Error("No GET expected for direct management buttons");
    });
    vi.stubGlobal("fetch", fetcher);
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    const draw = async (userId: string, questionId: string) => {
      await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
        kind === "close" ? createElement(QuestionCloseButton, {
          userId, questionId, closed: false,
        }) : createElement(BestAnswerButton, {
          userId, questionId, answerId: questionId === "question-1" ? "answer-1" : "answer-2",
          isBest: false,
        }),
      )));
    };
    try {
      await draw("viewer-A", "question-1");
      const label = kind === "close" ? "Закрыть обсуждение" : "Выбрать лучший ответ";
      await act(async () => { managementButton(host, label).click(); await Promise.resolve(); });
      expect(managementWrites(fetcher)).toHaveLength(1);
      await draw("viewer-B", "question-2");
      expect(managementButton(host, label).disabled).toBe(false);
      await act(async () => { managementButton(host, label).click(); await Promise.resolve(); });
      expect(managementWrites(fetcher)).toHaveLength(2);
      await act(async () => former.resolve(json({ id: "question-1" })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 24)); });
      expect(host.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
      expect(managementWrites(fetcher)).toHaveLength(2);
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["questions", "detail", "viewer-A", "question-1"],
      });
      expect(invalidate).not.toHaveBeenCalledWith({
        queryKey: ["questions", "detail", "viewer-B", "question-2"],
      });
      await act(async () => latest.resolve(json({ id: "question-2" })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 24)); });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["questions", "detail", "viewer-B", "question-2"],
      });
    } finally {
      await act(async () => root.unmount()); cache.clear(); host.remove();
    }
  });
});


// SOC040_REPLY_FLIGHT — actual nested reply composer, not pagination/heart.
function delayedReply() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
const answerReply = { id: "answer-root", body: "Корень ответа", best: false,
  liked: false, hearts: 0, deleted: false, hidden: false,
  author: { id: "trainer-1", name: "Кинолог" },
  parentId: null, replyToName: null, replyCount: 0,
  canEdit: false, canDelete: false, photos: [] };
async function typeReply(host: HTMLElement, content: string) {
  const input = host.querySelector<HTMLTextAreaElement>("#question-reply")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, content);
    input.dispatchEvent(new Event("input", { bubbles: true })); });
}
const replyPosts = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls.filter(call => (call[1] as RequestInit | undefined)?.method === "POST");

describe("SOC040_REPLY_FLIGHT nested answer submission lifecycle", () => {
  it("two native nested-reply submits within one render turn issue one POST", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "550e8400-e29b-41d4-a716-446655440000" });
    const pending = delayedReply();
    const fetcher = vi.fn((_path: string, init?: RequestInit) => init?.method === "POST"
      ? pending.promise : Promise.resolve(json({ ...q, canReply: true,
        answers: [answerReply], nextAnswerPage: null })));
    const ui = await render("detail", fetcher);
    try {
      await act(async () => [...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.getAttribute("aria-label") === "Ответить на комментарий")?.click());
      await typeReply(ui.host, "Вложенный совет");
      await act(async () => { const form = ui.host.querySelector("form");
        form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await Promise.resolve(); });
      const posts = replyPosts(fetcher);
      expect(posts).toHaveLength(1);
      expect(posts[0][0]).toBe("/api/v1/questions/question-1/answers");
      expect(JSON.parse(String(posts[0][1]?.body))).toEqual({
        body: "Вложенный совет", replyToId: "answer-root", photoIds: [],
        clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
      });
      await act(async () => pending.resolve(json({ id: "answer-added" })));
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      expect(ui.host.textContent).toContain("Ответ отправлен");
    } finally { await ui.cleanup(); }
  });

  it("replyTo switch during pending POST must retain new recipient and draft on old ACK", async () => {
    const pending = delayedReply();
    const other = { ...answerReply, id: "answer-2", body: "Второй совет",
      author: { id: "trainer-2", name: "Другой кинолог" } };
    const fetcher = vi.fn((_path: string, init?: RequestInit) => init?.method === "POST"
      ? pending.promise : Promise.resolve(json({ ...q, canReply: true,
        answers: [answerReply, other], nextAnswerPage: null })));
    const ui = await render("detail", fetcher);
    try {
      const select = () => [...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .filter(button => button.getAttribute("aria-label") === "Ответить на комментарий");
      await act(async () => select()[0]?.click());
      await typeReply(ui.host, "Старый адресат");
      await act(async () => ui.host.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ));
      expect(replyPosts(fetcher)).toHaveLength(1);
      await act(async () => select()[1]?.click());
      await typeReply(ui.host, "НОВЫЙ ЧЕРНОВИК ДРУГОМУ ОТВЕТУ");
      expect(ui.host.textContent).toContain("Ответ для Другой кинолог");
      await act(async () => pending.resolve(json({ id: "old-answer-new" })));
      await act(async () => { await new Promise(done => setTimeout(done, 27)); });
      expect(ui.host.querySelector<HTMLTextAreaElement>("#question-reply")?.value)
        .toBe("НОВЫЙ ЧЕРНОВИК ДРУГОМУ ОТВЕТУ");
      expect(ui.host.textContent).toContain("Ответ для Другой кинолог");
      expect(replyPosts(fetcher)).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });
});
