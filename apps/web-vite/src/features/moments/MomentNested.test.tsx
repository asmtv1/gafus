// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentReplies } from "./MomentReplies";
import { MomentCommentCard, type ReplyTarget } from "./MomentCommentCard";
import { MomentComments } from "./MomentComments";
import type { MomentComment } from "./momentsApi";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const author = { id: "private", name: "Автор", username: "author", role: "USER" };
const makeComment = (id: string, rootId: string | null = null) => ({
  id, postId: "post-1", text: "Текст " + id, author,
  createdAt: "2026-10-16T12:00:00.000Z", editedAt: null, deleted: false,
  rootId, replyToId: rootId, replyToName: rootId ? "Автор" : null,
  replyCount: rootId ? 0 : 1, canEdit: true, canDelete: true,
  myReaction: null, reactions: [],
});
function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200, data, error: "Server error",
  }), { status });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function mount(
  element: React.ReactElement, fetcher: ReturnType<typeof vi.fn>,
) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(createElement(
    QueryClientProvider, { client: cache }, element,
  )));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  return {
    host, cache,
    async rerender(element: React.ReactElement) {
      await act(async () => root.render(createElement(
        QueryClientProvider, { client: cache }, element,
      )));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    },
    async click(label: string) {
      const button = Array.from(host.querySelectorAll("button"))
        .find(b => b.getAttribute("aria-label") === label ||
          b.textContent?.includes(label));
      expect(button).toBeDefined();
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    },
    async change(value: string) {
      const field = host.querySelector<HTMLTextAreaElement>("textarea")!;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype, "value",
      )!.set!;
      await act(async () => {
        setter.call(field, value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    async submit() {
      await act(async () => host.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    },
    async cleanup() {
      await act(async () => root.unmount()); cache.clear(); host.remove();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("Moments nested comments and owner actions", () => {
  it("renders one compact reply target, one quick reaction and a discreet actions menu", async () => {
    const fake = vi.fn(() => Promise.resolve(envelope({
      items: [makeComment("child-1", "root-1")], nextCursor: null,
    })));
    const ui = await mount(createElement(MomentReplies, {
      userId: "viewer", postId: "post-1", rootId: "root-1", count: 1,
      onReply: vi.fn(),
    }), fake);
    try {
      await ui.click("Показать ответы");
      const reply = ui.host.querySelector(".moment-reply-item");
      expect(reply).not.toBeNull();
      expect(reply?.querySelectorAll(".web4-comment-reply-target")).toHaveLength(1);
      expect(reply?.textContent?.split("Ответ для Автор")).toHaveLength(2);
      expect(reply?.querySelector(".moment-comment-avatar")?.textContent).toBe("А");
      const management = reply?.querySelector<HTMLDetailsElement>(".moment-comment-more");
      expect(management?.open).toBe(false);
      expect(management?.querySelector('summary[aria-label="Действия с комментарием"]')).not.toBeNull();
      const deleteAction = management?.querySelector<HTMLButtonElement>(
        '[aria-label="Удалить комментарий"]',
      );
      expect(deleteAction?.classList.contains("moment-comment-delete-action")).toBe(true);
      expect(deleteAction?.hasAttribute("data-gafus-shared-button")).toBe(false);
      const reaction = reply?.querySelector('[role="group"][aria-label="Реакции комментария"]');
      expect(reaction?.querySelectorAll(":scope > button")).toHaveLength(1);
      expect(reaction?.querySelectorAll(".moment-comment-reaction-options button")).toHaveLength(4);
      expect(reaction?.querySelector(".moment-comment-reaction-picker[open]")).toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("lazy loads replies, preserves cursor pagination, deduplicates records", async () => {
    const fake = vi.fn((path: string) => Promise.resolve(
      path.includes("cursor=older")
        ? envelope({ items: [makeComment("child-1", "root-1"),
          makeComment("child-2", "root-1")], nextCursor: null })
        : envelope({ items: [makeComment("child-1", "root-1")],
          nextCursor: "older" }),
    ));
    const targets: ReplyTarget[] = [];
    const ui = await mount(createElement(MomentReplies, {
      userId: "viewer", postId: "post-1", rootId: "root-1", count: 2,
      onReply: target => targets.push(target),
    }), fake);
    try {
      expect(fake).not.toHaveBeenCalled();
      await ui.click("Показать ответы");
      expect(fake.mock.calls[0][0])
        .toBe("/api/v1/feed/comments/root-1/replies?pageSize=20");
      expect(ui.host.textContent).toContain("Текст child-1");
      await ui.click("Ещё ответы");
      expect(ui.host.querySelectorAll("ul.compact-grid > li")).toHaveLength(2);
      expect(fake.mock.calls[1][0]).toContain("cursor=older");
      await ui.click("Ответить");
      expect(targets).toEqual([{ id: "child-1", name: "Автор" }]);
      await ui.click("Скрыть ответы");
      expect(ui.host.querySelector("ul")).toBeNull();
    } finally { await ui.cleanup(); }
  });

  it.each([
    [401, "Сессия завершена. Войдите снова."],
    [403, "Нет доступа к вложенным ответам."],
    [404, "Ветка ответов недоступна."],
  ])("MN-R01 replies page2 HTTP%s hides only denied branch", async (code, message) => {
    const fake = vi.fn((path: string, options?: RequestInit) => {
      if (options?.method && options.method !== "GET") throw Error("READ_ONLY_EXPECTED");
      return Promise.resolve(envelope(path.includes("cursor=older")
        ? null : { items: [makeComment("child-1", "root-1")], nextCursor: "older" },
      path.includes("cursor=older") ? code : 200));
    });
    const onReply = vi.fn();
    const ui = await mount(createElement(MomentReplies, {
      userId: "viewer", postId: "post-1", rootId: "root-1", count: 2, onReply,
    }), fake);
    try {
      expect(fake).not.toHaveBeenCalled();
      await ui.click("Показать ответы");
      expect(ui.host.textContent).toContain("Текст child-1");
      await ui.click("Ещё ответы");
      expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain(message);
      expect(ui.host.textContent).not.toContain("Текст child-1");
      expect(ui.host.querySelector("ul.compact-grid")).toBeNull();
      expect(ui.host.textContent).not.toContain("Ответить");
      expect(ui.host.textContent).not.toContain("Server error");
      expect(ui.host.textContent).not.toContain("Ответов пока нет");
      expect([...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .some(b => b.textContent?.includes("Ещё ответы") ||
          b.textContent?.includes("Повторить"))).toBe(false);
      expect(ui.host.querySelector('a[href="/login"]') !== null).toBe(code === 401);
      expect(fake.mock.calls.map(([path]) => path)).toEqual([
        "/api/v1/feed/comments/root-1/replies?pageSize=20",
        "/api/v1/feed/comments/root-1/replies?cursor=older&pageSize=20",
      ]);
      expect(onReply).not.toHaveBeenCalled();
    } finally { await ui.cleanup(); }
  });

  it.each([
    [401, "Сессия завершена. Войдите снова."],
    [403, "Нет доступа к вложенным ответам."],
    [404, "Ветка ответов недоступна."],
  ])("MN-R02 replies page1 HTTP%s is terminal", async (code, message) => {
    const fake = vi.fn().mockResolvedValue(envelope(null, code));
    const ui = await mount(createElement(MomentReplies, {
      userId: "viewer", postId: "post-1", rootId: "root-1", count: 2,
      onReply: vi.fn(),
    }), fake);
    try {
      await ui.click("Показать ответы");
      expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain(message);
      expect(ui.host.querySelector("ul")).toBeNull();
      expect(ui.host.textContent).not.toContain("Ответов пока нет");
      expect([...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .some(b => b.textContent?.includes("Повторить") ||
          b.textContent?.includes("Ещё ответы"))).toBe(false);
      expect(ui.host.querySelector('a[href="/login"]') !== null).toBe(code === 401);
      expect(fake).toHaveBeenCalledTimes(1);
    } finally { await ui.cleanup(); }
  });

  it("MN-R03 replies page2 503 retries exact cursor without page1", async () => {
    let second = 0;
    const fake = vi.fn((path: string) => Promise.resolve(path.includes("cursor=older")
      ? ++second === 1 ? envelope(null, 503) : envelope({
        items: [makeComment("child-1", "root-1"), makeComment("child-2", "root-1")],
        nextCursor: null,
      }) : envelope({ items: [makeComment("child-1", "root-1")], nextCursor: "older" })));
    const ui = await mount(createElement(MomentReplies, {
      userId: "viewer", postId: "post-1", rootId: "root-1", count: 2,
      onReply: vi.fn(),
    }), fake);
    try {
      await ui.click("Показать ответы");
      await ui.click("Ещё ответы");
      expect(ui.host.textContent).toContain("Текст child-1");
      expect(ui.host.textContent).toContain("Не удалось загрузить следующую страницу ответов");
      expect(ui.host.querySelectorAll("ul.compact-grid > li")).toHaveLength(1);
      await ui.click("Повторить страницу ответов");
      expect(ui.host.querySelectorAll("ul.compact-grid > li")).toHaveLength(2);
      expect(ui.host.textContent?.match(/Текст child-1/g)).toHaveLength(1);
      expect(ui.host.textContent).toContain("Текст child-2");
      expect(fake.mock.calls.map(([path]) => path)).toEqual([
        "/api/v1/feed/comments/root-1/replies?pageSize=20",
        "/api/v1/feed/comments/root-1/replies?cursor=older&pageSize=20",
        "/api/v1/feed/comments/root-1/replies?cursor=older&pageSize=20",
      ]);
      expect(second).toBe(2);
    } finally { await ui.cleanup(); }
  });

  it("MN-R04 replies denial leaves another expanded root intact", async () => {
    const fake = vi.fn((path: string) => Promise.resolve(
      path.includes("root-1") && path.includes("cursor=older")
        ? envelope(null, 403)
        : path.includes("root-1")
          ? envelope({ items: [makeComment("child-1", "root-1")], nextCursor: "older" })
          : envelope({ items: [makeComment("child-2", "root-2")], nextCursor: "older" }),
    ));
    const element = createElement("div", {},
      createElement("section", { "data-root": "one" }, createElement(MomentReplies, {
        userId: "viewer", postId: "post-1", rootId: "root-1", count: 2,
        onReply: vi.fn(),
      })),
      createElement("section", { "data-root": "two" }, createElement(MomentReplies, {
        userId: "viewer", postId: "post-1", rootId: "root-2", count: 2,
        onReply: vi.fn(),
      })),
    );
    const ui = await mount(element, fake);
    try {
      await ui.click("Показать ответы");
      await ui.click("Показать ответы");
      const one = ui.host.querySelector<HTMLElement>('[data-root="one"]')!;
      const two = ui.host.querySelector<HTMLElement>('[data-root="two"]')!;
      expect(one.textContent).toContain("Текст child-1");
      expect(two.textContent).toContain("Текст child-2");
      const next = [...one.querySelectorAll<HTMLButtonElement>("button")]
        .find(b => b.textContent === "Ещё ответы");
      expect(next).toBeDefined();
      await act(async () => next?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(one.textContent).toContain("Нет доступа к вложенным ответам.");
      expect(one.textContent).not.toContain("Текст child-1");
      expect(one.querySelector("ul")).toBeNull();
      expect(two.textContent).toContain("Текст child-2");
      expect(two.querySelector("ul.compact-grid li")).not.toBeNull();
      expect(two.textContent).toContain("Ещё ответы");
      expect(fake.mock.calls.map(([path]) => path)).toEqual([
        "/api/v1/feed/comments/root-1/replies?pageSize=20",
        "/api/v1/feed/comments/root-2/replies?pageSize=20",
        "/api/v1/feed/comments/root-1/replies?cursor=older&pageSize=20",
      ]);
    } finally { await ui.cleanup(); }
  });

  it.each(["next", "retry"])("MN-FLIGHT-PRE reply root two same-turn %s clicks use one cursor GET", async mode => {
    const pending = deferred<Response>();
    let second = 0;
    const fake = vi.fn((path: string) => {
      if (!path.includes("cursor=older")) return Promise.resolve(envelope({
        items: [makeComment("child-1", "root-1")], nextCursor: "older",
      }));
      second++;
      return mode === "retry" && second === 1 ? Promise.resolve(envelope(null, 503)) : pending.promise;
    });
    const ui = await mount(createElement(MomentReplies, {
      userId: "viewer", postId: "post-1", rootId: "root-1", count: 2, onReply: vi.fn(),
    }), fake);
    try {
      await ui.click("Показать ответы");
      if (mode === "retry") await ui.click("Ещё ответы");
      const label = mode === "next" ? "Ещё ответы" : "Повторить страницу ответов";
      const button = [...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .find(node => node.getAttribute("aria-label") === label ||
          node.textContent?.trim() === label);
      expect(button).toBeDefined();
      await act(async () => { button?.click(); button?.click(); });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(fake.mock.calls.filter(([path]) => path.includes("cursor=older")))
        .toHaveLength(mode === "retry" ? 2 : 1);
      expect(ui.host.textContent).toContain("Текст child-1");
      await act(async () => pending.resolve(envelope({
        items: [makeComment("child-1", "root-1"), makeComment("child-2", "root-1")],
        nextCursor: null,
      })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.querySelectorAll("ul.compact-grid > li")).toHaveLength(2);
      expect(ui.host.textContent?.match(/Текст child-1/g)).toHaveLength(1);
      expect(ui.host.textContent).toContain("Текст child-2");
    } finally { await ui.cleanup(); }
  });

  it("MN-FLIGHT-ROOT old pending root cannot block new root or publish old data", async () => {
    const old = deferred<Response>();
    const current = deferred<Response>();
    const fake = vi.fn((path: string) => {
      const newRoot = path.includes("root-2");
      if (!path.includes("cursor=older")) return Promise.resolve(envelope({
        items: [makeComment(newRoot ? "new-1" : "child-1", newRoot ? "root-2" : "root-1")],
        nextCursor: "older",
      }));
      return newRoot ? current.promise : old.promise;
    });
    const item = (rootId: string) => createElement(MomentReplies, {
      userId: "viewer", postId: "post-1", rootId, count: 2, onReply: vi.fn(),
    });
    const ui = await mount(item("root-1"), fake);
    try {
      await ui.click("Показать ответы");
      await ui.click("Ещё ответы");
      await ui.rerender(item("root-2"));
      // The expansion state belongs to the same mounted component; new root GET is independent.
      expect(ui.host.textContent).toContain("Текст new-1");
      await ui.click("Ещё ответы");
      const busy = () => [...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .some(node => node.disabled && node.textContent?.includes("Загрузка"));
      expect(busy()).toBe(true);
      await act(async () => old.resolve(envelope({
        items: [makeComment("PRIVATE_OLD_CHILD", "root-1")], nextCursor: null,
      })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.textContent).not.toContain("PRIVATE_OLD_CHILD");
      expect(busy()).toBe(true);
      await act(async () => current.resolve(envelope({
        items: [makeComment("new-2", "root-2")], nextCursor: null,
      })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.textContent).toContain("Текст new-2");
      expect(ui.host.textContent).not.toContain("PRIVATE_OLD_CHILD");
      expect(fake.mock.calls.map(([path]) => path.includes("cursor=older")))
        .toEqual([false, true, false, true]);
    } finally { await ui.cleanup(); }
  });

  it("MN-FLIGHT-INDEPENDENT roots have separate simultaneous pending page2 fetches", async () => {
    const one = deferred<Response>();
    const two = deferred<Response>();
    const fake = vi.fn((path: string) => {
      const secondRoot = path.includes("root-2");
      if (!path.includes("cursor=older")) return Promise.resolve(envelope({
        items: [makeComment(secondRoot ? "new-1" : "child-1", secondRoot ? "root-2" : "root-1")],
        nextCursor: "older",
      }));
      return secondRoot ? two.promise : one.promise;
    });
    const rootNode = (rootId: string) => createElement("section", { "data-reply-root": rootId },
      createElement(MomentReplies, {
        userId: "viewer", postId: "post-1", rootId, count: 2, onReply: vi.fn(),
      }));
    const ui = await mount(createElement("div", {}, rootNode("root-1"), rootNode("root-2")), fake);
    try {
      const button = (rootId: string, text: string) => [
        ...ui.host.querySelectorAll<HTMLButtonElement>(`[data-reply-root="${rootId}"] button`),
      ].find(node => node.textContent?.includes(text));
      await act(async () => {
        button("root-1", "Показать ответы")?.click();
        button("root-2", "Показать ответы")?.click();
      });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      await act(async () => { button("root-1", "Ещё ответы")?.click(); button("root-1", "Ещё ответы")?.click(); button("root-2", "Ещё ответы")?.click(); });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(fake.mock.calls.filter(([path]) => path.includes("cursor=older"))).toHaveLength(2);
      await act(async () => one.resolve(envelope({ items: [makeComment("child-2", "root-1")], nextCursor: null })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.textContent).toContain("Текст child-2");
      expect([...ui.host.querySelectorAll<HTMLButtonElement>('[data-reply-root="root-2"] button')]
        .some(node => node.disabled && node.textContent?.includes("Загрузка"))).toBe(true);
      await act(async () => two.resolve(envelope({ items: [makeComment("new-2", "root-2")], nextCursor: null })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.textContent).toContain("Текст new-2");
    } finally { await ui.cleanup(); }
  });

  it("reply to root carries root ID and retains same UUID on retry", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => UUID });
    let writes = 0;
    const fake = vi.fn((path: string, options?: RequestInit) => Promise.resolve(
      options?.method === "POST"
        ? (++writes === 1 ? envelope(null, 503) :
          envelope({ id: "child-1", postId: "post-1" }))
        : envelope({ items: [makeComment("root-1")], nextCursor: null }),
    ));
    const ui = await mount(createElement(MomentComments, {
      userId: "viewer", postId: "post-1",
    }), fake);
    try {
      await ui.click("Ответить");
      expect(ui.host.textContent).toContain("Ответ для Автор");
      await ui.change("Ответ с контекстом");
      await ui.submit();
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось отправить комментарий");
      await ui.submit();
      const writesSent = fake.mock.calls.filter(call => call[1]?.method === "POST");
      expect(writesSent).toHaveLength(2);
      const bodies = writesSent.map(call => JSON.parse(String(call[1]?.body)));
      expect(bodies).toEqual([{
        text: "Ответ с контекстом", replyToId: "root-1", clientRequestId: UUID,
      }, {
        text: "Ответ с контекстом", replyToId: "root-1", clientRequestId: UUID,
      }]);
      expect(ui.host.textContent).not.toContain("Ответ для Автор");
    } finally { await ui.cleanup(); }
  });

  it("editing and deleting own comment require server response", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    const comment = makeComment("root-1");
    const fake = vi.fn((path: string, options?: RequestInit) => Promise.resolve(
      options?.method === "PATCH"
        ? envelope({ ...comment, text: "Исправлено" })
        : options?.method === "DELETE"
          ? envelope({ id: "root-1" })
          : envelope({ items: [], nextCursor: null }),
    ));
    const ui = await mount(createElement(MomentCommentCard, {
      userId: "viewer", postId: "post-1", rootId: "root-1",
      comment: {
        id: "root-1", text: "До", authorName: "Автор", username: "author",
        createdAt: "2026-10-16T12:00:00.000Z", editedAt: null, roleBadge: null,
        rootId: null, replyToId: null, replyToName: null,
        deleted: false, replyCount: 0, canEdit: true, canDelete: true,
        myReaction: null, reactions: [],
      } satisfies MomentComment, onReply: vi.fn(),
    }), fake);
    try {
      await ui.click("Редактировать комментарий");
      await ui.change("Исправлено");
      await ui.submit();
      expect(fake.mock.calls.some(call => call[1]?.method === "PATCH")).toBe(true);
      expect(JSON.parse(String(fake.mock.calls.find(call =>
        call[1]?.method === "PATCH")?.[1]?.body))).toEqual({ text: "Исправлено" });
      await ui.click("Удалить комментарий");
      expect(fake.mock.calls.some(call => call[1]?.method === "DELETE")).toBe(false);
      vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
      await ui.click("Удалить комментарий");
      expect(fake.mock.calls.some(call => call[1]?.method === "DELETE")).toBe(true);
    } finally { await ui.cleanup(); }
  });

  it("server-denied edit is fail-closed and preserves form", async () => {
    const fake = vi.fn((_path: string, options?: RequestInit) =>
      Promise.resolve(options?.method === "PATCH"
        ? envelope(null, 403) : envelope({ items: [], nextCursor: null })));
    const comment: MomentComment = {
      id: "comment-1", text: "Исходное", authorName: "Автор", username: "author",
      createdAt: "2026-10-16T12:00:00.000Z", editedAt: null, roleBadge: null,
      rootId: null, replyToId: null, replyToName: null,
      deleted: false, replyCount: 0, canEdit: true, canDelete: false,
      myReaction: null, reactions: [],
    };
    const ui = await mount(createElement(MomentCommentCard, {
      userId: "viewer", postId: "post-1", rootId: "comment-1",
      comment, onReply: vi.fn(),
    }), fake);
    try {
      await ui.click("Редактировать комментарий");
      await ui.change("Изменённый текст");
      await ui.submit();
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Изменённый текст");
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось изменить");
      expect(ui.host.textContent).not.toContain("Удалить комментарий");
      expect(ui.host.querySelector('[aria-label="Удалить комментарий"]')).toBeNull();
    } finally { await ui.cleanup(); }
  });
});

// SOC032_COMMENT_OWNER_EDIT_DELETE: existing real MomentCommentCard mounted fixture.
const ownedComment = (id = "comment-1", text = "Исходный комментарий"): MomentComment => ({
  id, text, authorName: "Автор", username: "author", roleBadge: null,
  createdAt: "2026-10-16T12:00:00.000Z", editedAt: null, rootId: null,
  replyToId: null, replyToName: null, deleted: false, replyCount: 0,
  canEdit: true, canDelete: true, myReaction: null, reactions: [],
});
// Edit ACK is a real Feed DTO (with author), not the UI's projected MomentComment.
const commentWire = (id: string, text: string) => ({
  ...ownedComment(id, text), author: { id: "author", name: "Автор", username: "author", role: "USER" },
});
const ownedCard = (id: string, userId: string, postId: string, text?: string) =>
  createElement(MomentCommentCard, { comment: ownedComment(id, text), userId, postId,
    rootId: id, onReply: vi.fn() });
const cardWrites = (fn: ReturnType<typeof vi.fn>, method: string) =>
  fn.mock.calls.filter(call => (call[1] as RequestInit | undefined)?.method === method);
function cardButton(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(node => node.getAttribute("aria-label") === label ||
          node.textContent?.trim() === label);
  if (!button) throw Error("Missing comment owner button: " + label);
  return button;
}

describe("SOC032_COMMENT_OWNER_EDIT_DELETE scoped comment card lifecycle", () => {
  it("same-turn two edit submits send only one PATCH and retain exact text", async () => {
    const held = deferred<Response>();
    const fake = vi.fn(() => held.promise);
    const ui = await mount(ownedCard("comment-1", "viewer-1", "post-1"), fake);
    try {
      await ui.click("Редактировать комментарий");
      await ui.change("Изменённый комментарий");
      await act(async () => {
        const form = ui.host.querySelector("form");
        form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await Promise.resolve();
      });
      expect(cardWrites(fake, "PATCH")).toHaveLength(1);
      expect(JSON.parse(String(cardWrites(fake, "PATCH")[0][1]?.body)))
        .toEqual({ text: "Изменённый комментарий" });
      await act(async () => held.resolve(envelope(commentWire("comment-1", "Изменённый комментарий"))));
    } finally { await ui.cleanup(); }
  });

  it("two same-turn deletes confirm once; edit then delete cannot submit simultaneously", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const held = deferred<Response>();
    const fake = vi.fn(() => held.promise);
    const ui = await mount(ownedCard("comment-1", "viewer-1", "post-1"), fake);
    try {
      await act(async () => {
        cardButton(ui.host, "Удалить комментарий").click();
        cardButton(ui.host, "Удалить комментарий").click();
        await Promise.resolve();
      });
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(cardWrites(fake, "DELETE")).toHaveLength(1);
      await act(async () => held.resolve(envelope({ id: "comment-1" })));
    } finally { await ui.cleanup(); }
    const heldEdit = deferred<Response>();
    const other = vi.fn(() => heldEdit.promise);
    const next = await mount(ownedCard("comment-1", "viewer-1", "post-1"), other);
    try {
      await next.click("Редактировать комментарий");
      await act(async () => {
        next.host.querySelector("form")?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }));
        cardButton(next.host, "Удалить комментарий").click();
        await Promise.resolve();
      });
      expect(cardWrites(other, "PATCH")).toHaveLength(1);
      expect(cardWrites(other, "DELETE")).toHaveLength(0);
      expect(confirm).toHaveBeenCalledTimes(1);
      await act(async () => heldEdit.resolve(envelope(commentWire("comment-1", "Исходный комментарий"))));
    } finally { await next.cleanup(); }
  });

  it("old owner/post/comment edit cannot erase new draft or invalidate new actor key", async () => {
    const previous = deferred<Response>();
    const current = deferred<Response>();
    const fake = vi.fn((url: string) => url.includes("comment-1")
      ? previous.promise : current.promise);
    const ui = await mount(ownedCard("comment-1", "viewer-1", "post-1"), fake);
    const invalidate = vi.spyOn(ui.cache, "invalidateQueries");
    try {
      await ui.click("Редактировать комментарий");
      await ui.change("PRIVATE_OLD_COMMENT_DRAFT");
      await ui.submit();
      expect(cardWrites(fake, "PATCH")).toHaveLength(1);
      await ui.rerender(ownedCard("comment-2", "viewer-2", "post-2", "Совсем новый комментарий"));
      await ui.click("Редактировать комментарий");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Совсем новый комментарий");
      await ui.change("Новый черновик другого владельца");
      await ui.submit();
      expect(cardWrites(fake, "PATCH")).toHaveLength(2);
      await act(async () => previous.resolve(envelope(commentWire("comment-1", "Старое"))));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Новый черновик другого владельца");
      expect(invalidate).not.toHaveBeenCalledWith({
        queryKey: ["moments", "comments", "viewer-2", "post-2"],
      });
      await act(async () => current.resolve(envelope(commentWire(
        "comment-2", "Новый черновик другого владельца"))));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.querySelector("textarea")).toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("failed PATCH keeps draft and requires explicit next submission; denied delete stays unavailable", async () => {
    let writes = 0;
    const fake = vi.fn(() => Promise.resolve(++writes === 1
      ? envelope(null, 503) : envelope(commentWire("comment-1", "Сохранён"))));
    const ui = await mount(ownedCard("comment-1", "viewer-1", "post-1"), fake);
    try {
      await ui.click("Редактировать комментарий");
      await ui.change("Сохранить черновик комментария");
      await ui.submit();
      expect(cardWrites(fake, "PATCH")).toHaveLength(1);
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Сохранить черновик комментария");
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(cardWrites(fake, "PATCH")).toHaveLength(1);
      await ui.submit();
      expect(cardWrites(fake, "PATCH")).toHaveLength(2);
    } finally { await ui.cleanup(); }
    const never = vi.fn();
    const denied = await mount(createElement(MomentCommentCard, {
      comment: { ...ownedComment(), canEdit: false, canDelete: false },
      userId: "viewer-1", postId: "post-1", rootId: "comment-1", onReply: vi.fn(),
    }), never);
    try {
      expect(denied.host.textContent).not.toContain("Редактировать комментарий");
      expect(denied.host.querySelector('[aria-label="Редактировать комментарий"]')).toBeNull();
      expect(denied.host.textContent).not.toContain("Удалить комментарий");
      expect(denied.host.querySelector('[aria-label="Удалить комментарий"]')).toBeNull();
      expect(never).not.toHaveBeenCalled();
    } finally { await denied.cleanup(); }
  });
});

// SOC041_COMMENT_REACTION_INTERLOCK: real existing comment card, synthetic fetch only.
function emojiControl(host: HTMLElement, emoji: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button[aria-label]")]
    .find(candidate => candidate.getAttribute("aria-label") === "Реакция комментария " + emoji);
  if (!button) throw Error("Missing reaction: " + emoji);
  return button;
}
const reactionWrites = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls.filter(call => (call[1] as RequestInit | undefined)?.method === "PUT");

describe("SOC041_COMMENT_REACTION_INTERLOCK current comment edit/delete/reaction", () => {
  it("two different emoji clicks in one React turn perform exactly one PUT with clicked emoji", async () => {
    const pending = deferred<Response>();
    const fake = vi.fn(() => pending.promise);
    const ui = await mount(ownedCard("comment-1", "viewer-1", "post-1"), fake);
    try {
      await act(async () => {
        emojiControl(ui.host, "❤️").click();
        emojiControl(ui.host, "😂").click();
        await Promise.resolve();
      });
      expect(reactionWrites(fake)).toHaveLength(1);
      expect(reactionWrites(fake)[0][0]).toBe("/api/v1/feed/comments/comment-1/reaction");
      expect(JSON.parse(String(reactionWrites(fake)[0][1]?.body)))
        .toEqual({ reaction: "❤️" });
      expect(emojiControl(ui.host, "❤️").getAttribute("aria-pressed")).toBe("false");
      await act(async () => pending.resolve(envelope({ reaction: "❤️" })));
    } finally { await ui.cleanup(); }
  });

  it.each(["edit→reaction", "reaction→edit", "delete→reaction", "reaction→delete"])(
    "%s: a shared same-turn flight forbids parallel competing writes", async mode => {
      const confirm = vi.fn(() => true);
      vi.stubGlobal("confirm", confirm);
      const pending = deferred<Response>();
      const fake = vi.fn((_url: string, _init?: RequestInit) => pending.promise);
      const ui = await mount(ownedCard("comment-1", "viewer-1", "post-1"), fake);
      try {
        if (mode.includes("edit")) await ui.click("Редактировать комментарий");
        await act(async () => {
          const submit = () => ui.host.querySelector("form")?.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
          if (mode === "edit→reaction") { submit(); emojiControl(ui.host, "❤️").click(); }
          if (mode === "reaction→edit") { emojiControl(ui.host, "❤️").click(); submit(); }
          if (mode === "delete→reaction") {
            cardButton(ui.host, "Удалить комментарий").click();
            emojiControl(ui.host, "❤️").click();
          }
          if (mode === "reaction→delete") {
            emojiControl(ui.host, "❤️").click();
            cardButton(ui.host, "Удалить комментарий").click();
          }
          await Promise.resolve();
        });
        const calls = fake.mock.calls.filter(call =>
          ["PUT", "PATCH", "DELETE"].includes((call[1] as RequestInit)?.method ?? ""));
        expect(calls).toHaveLength(1);
        const firstMethod = mode.startsWith("reaction") ? "PUT" :
          mode.startsWith("edit") ? "PATCH" : "DELETE";
        expect(calls[0][1]?.method).toBe(firstMethod);
        expect(confirm).toHaveBeenCalledTimes(mode === "delete→reaction" ? 1 : 0);
        await act(async () => pending.resolve(envelope(firstMethod === "PUT"
          ? { reaction: "❤️" } : firstMethod === "PATCH"
            ? commentWire("comment-1", "Исходный комментарий") : { id: "comment-1" })));
      } finally { await ui.cleanup(); }
    },
  );

  it("unknown reaction ACK causes no autoreplay; next explicit intent is permitted after settlement", async () => {
    let count = 0;
    const fake = vi.fn(() => Promise.resolve(++count === 1
      ? envelope({ reaction: "😂" }) : envelope({ reaction: "😂" })));
    const ui = await mount(ownedCard("comment-1", "viewer-1", "post-1"), fake);
    try {
      await act(async () => emojiControl(ui.host, "❤️").click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      expect(reactionWrites(fake)).toHaveLength(1);
      expect(ui.host.textContent).toContain("Не удалось изменить реакцию");
      expect(emojiControl(ui.host, "❤️").getAttribute("aria-pressed")).toBe("false");
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(reactionWrites(fake)).toHaveLength(1);
      await act(async () => emojiControl(ui.host, "😂").click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      expect(reactionWrites(fake)).toHaveLength(2);
      expect(JSON.parse(String(reactionWrites(fake)[1][1]?.body)))
        .toEqual({ reaction: "😂" });
    } finally { await ui.cleanup(); }
  });

  it("toggling an existing emoji retains explicit DELETE/null ACK and releases flight", async () => {
    const fake = vi.fn((_url: string, init?: RequestInit) => Promise.resolve(
      init?.method === "DELETE" ? envelope({ reaction: null })
        : envelope(commentWire("comment-1", "Изменено вручную")),
    ));
    const ui = await mount(createElement(MomentCommentCard, {
      comment: { ...ownedComment(), myReaction: "❤️" },
      userId: "viewer-1", postId: "post-1", rootId: "comment-1", onReply: vi.fn(),
    }), fake);
    try {
      await act(async () => emojiControl(ui.host, "❤️").click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      const removed = cardWrites(fake, "DELETE");
      expect(removed).toHaveLength(1);
      expect(removed[0][0]).toBe("/api/v1/feed/comments/comment-1/reaction");
      expect(removed[0][1]?.body).toBeUndefined();
      expect(emojiControl(ui.host, "❤️").getAttribute("aria-pressed")).toBe("true");
      await ui.click("Редактировать комментарий");
      await ui.change("Изменено вручную");
      await ui.submit();
      expect(cardWrites(fake, "PATCH")).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("old reaction ACK is isolated from a new user's/comment's pending edit and query keys", async () => {
    const old = deferred<Response>();
    const next = deferred<Response>();
    const fake = vi.fn((url: string) => url.includes("comment-1")
      ? old.promise : next.promise);
    const ui = await mount(ownedCard("comment-1", "viewer-1", "post-1"), fake);
    const invalidations = vi.spyOn(ui.cache, "invalidateQueries");
    try {
      await act(async () => { emojiControl(ui.host, "❤️").click(); await Promise.resolve(); });
      expect(reactionWrites(fake)).toHaveLength(1);
      await ui.rerender(ownedCard("comment-2", "viewer-2", "post-2", "Новая история"));
      await ui.click("Редактировать комментарий");
      await ui.change("НОВЫЙ ТЕКСТ НОВОГО ПОЛЬЗОВАТЕЛЯ");
      await act(async () => ui.host.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ));
      expect(cardWrites(fake, "PATCH")).toHaveLength(1);
      await act(async () => old.resolve(envelope({ reaction: "❤️" })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("НОВЫЙ ТЕКСТ НОВОГО ПОЛЬЗОВАТЕЛЯ");
      expect(ui.host.querySelector<HTMLButtonElement>("button[type=submit]")?.disabled)
        .toBe(true);
      expect(invalidations).not.toHaveBeenCalledWith({
        queryKey: ["moments", "comments", "viewer-2", "post-2"],
      });
      await act(async () => next.resolve(envelope(commentWire(
        "comment-2", "НОВЫЙ ТЕКСТ НОВОГО ПОЛЬЗОВАТЕЛЯ"))));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.querySelector("textarea")).toBeNull();
      expect(invalidations).toHaveBeenCalledWith({
        queryKey: ["moments", "comments", "viewer-2", "post-2"],
      });
    } finally { await ui.cleanup(); }
  });

  it("no edit/delete permission and deleted comments never gain owner writes", async () => {
    const fake = vi.fn();
    const denied = await mount(createElement(MomentCommentCard, {
      comment: { ...ownedComment(), canEdit: false, canDelete: false },
      userId: "viewer-1", postId: "post-1", rootId: "comment-1", onReply: vi.fn(),
    }), fake);
    try {
      expect(denied.host.textContent).not.toContain("Редактировать комментарий");
      expect(denied.host.querySelector('[aria-label="Редактировать комментарий"]')).toBeNull();
      expect(denied.host.textContent).not.toContain("Удалить комментарий");
      expect(denied.host.querySelector('[aria-label="Удалить комментарий"]')).toBeNull();
    } finally { await denied.cleanup(); }
    const deleted = await mount(createElement(MomentCommentCard, {
      comment: { ...ownedComment(), deleted: true },
      userId: "viewer-1", postId: "post-1", rootId: "comment-1", onReply: vi.fn(),
    }), fake);
    try {
      expect(deleted.host.textContent).toContain("Комментарий удалён");
      expect(deleted.host.querySelector('[aria-label="Реакции комментария"]')).toBeNull();
      expect(deleted.host.querySelector("form")).toBeNull();
      expect(fake).not.toHaveBeenCalled();
    } finally { await deleted.cleanup(); }
  });
});

// WEB005_COMMENT_INLINE_A11Y — current root and nested edit controls, real mounted DOM.
describe("WEB005_COMMENT_INLINE_A11Y root and nested inline edit", () => {
  it("same comment in root and thread has distinct named edit form, input, label and error IDs", async () => {
    const never = vi.fn();
    const root = (rootId: string) => createElement("section", { key: rootId },
      createElement(MomentCommentCard, { comment: ownedComment("same-comment"),
        userId: "viewer-1", postId: "post-1", rootId, onReply: vi.fn() }));
    const ui = await mount(createElement("div", null,
      root("same-comment"), root("thread-1")), never);
    try {
      const sections = [...ui.host.querySelectorAll<HTMLElement>("section")];
      expect(sections).toHaveLength(2);
      await act(async () => {
        cardButton(sections[0], "Редактировать комментарий").click();
        cardButton(sections[1], "Редактировать комментарий").click();
      });
      const fields = sections.map(section => section.querySelector<HTMLTextAreaElement>("textarea")!);
      const ids = fields.map(field => field.id);
      expect(new Set(ids).size).toBe(2);
      expect(ids.every(id => id.length > 0)).toBe(true);
      sections.forEach((section, index) => {
        const form = section.querySelector<HTMLFormElement>("form")!;
        expect(form.getAttribute("aria-label")).toBe("Редактирование комментария");
        expect(fields[index].name).toBe("comment-text");
        expect(section.querySelector("label")?.htmlFor).toBe(ids[index]);
        expect(fields[index].getAttribute("aria-describedby")).toBeNull();
      });
      expect(never).not.toHaveBeenCalled();
    } finally { await ui.cleanup(); }
  });

  it("opening edit focuses textarea; cancel restores only own trigger when editor had focus", async () => {
    const never = vi.fn();
    const ui = await mount(createElement("div", {}, ownedCard("comment-1", "viewer-1", "post-1"),
      createElement("button", { type: "button", id: "outside" }, "Другой элемент")), never);
    try {
      await ui.click("Редактировать комментарий");
      const textarea = ui.host.querySelector<HTMLTextAreaElement>("textarea")!;
      expect(document.activeElement).toBe(textarea);
      await act(async () => { cardButton(ui.host, "Отмена").focus(); cardButton(ui.host, "Отмена").click(); });
      expect(ui.host.querySelector("textarea")).toBeNull();
      expect(document.activeElement).toBe(cardButton(ui.host, "Редактировать комментарий"));
      await ui.click("Редактировать комментарий");
      expect(document.activeElement).toBe(ui.host.querySelector("textarea"));
      const outside = ui.host.querySelector<HTMLButtonElement>("#outside")!;
      await act(async () => { outside.focus(); cardButton(ui.host, "Отмена").click(); });
      expect(document.activeElement).toBe(outside);
      expect(ui.host.querySelector("textarea")).toBeNull();
      expect(never).not.toHaveBeenCalled();
    } finally { await ui.cleanup(); }
  });

  it("server error connects invalid editor to alert, retains text and focus until explicit retry and ACK", async () => {
    const pending = deferred<Response>();
    let count = 0;
    const fake = vi.fn(() => ++count === 1
      ? Promise.resolve(envelope(null, 503)) : pending.promise);
    const ui = await mount(ownedCard("comment-1", "viewer-1", "post-1"), fake);
    try {
      await ui.click("Редактировать комментарий");
      await ui.change("Текст после ошибки остаётся");
      await ui.submit();
      expect(cardWrites(fake, "PATCH")).toHaveLength(1);
      const field = ui.host.querySelector<HTMLTextAreaElement>("textarea")!;
      expect(field.value).toBe("Текст после ошибки остаётся");
      expect(field.getAttribute("aria-invalid")).toBe("true");
      const errorId = field.getAttribute("aria-describedby")!;
      expect(errorId).toBeTruthy();
      expect(ui.host.querySelector(`#${errorId.replaceAll(":", "\\:")}`)?.textContent)
        .toContain("Не удалось изменить комментарий");
      field.focus();
      await ui.submit();
      expect(cardWrites(fake, "PATCH")).toHaveLength(2);
      await act(async () => pending.resolve(envelope(commentWire("comment-1", "Текст после ошибки остаётся"))));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.querySelector("textarea")).toBeNull();
      expect(document.activeElement).toBe(cardButton(ui.host, "Редактировать комментарий"));
    } finally { await ui.cleanup(); }
  });

  it("late old target ACK never steals focus from newly opened and edited comment", async () => {
    const old = deferred<Response>();
    const next = deferred<Response>();
    const fake = vi.fn((url: string) => url.includes("comment-1") ? old.promise : next.promise);
    const ui = await mount(ownedCard("comment-1", "viewer-1", "post-1"), fake);
    try {
      await ui.click("Редактировать комментарий");
      await ui.change("Текст старого владельца");
      await ui.submit();
      await ui.rerender(ownedCard("comment-2", "viewer-2", "post-2", "Новый комментарий"));
      await ui.click("Редактировать комментарий");
      await ui.change("Текст нового владельца");
      const current = ui.host.querySelector<HTMLTextAreaElement>("textarea")!;
      current.focus();
      await act(async () => old.resolve(envelope(commentWire("comment-1", "Текст старого владельца"))));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(document.activeElement).toBe(current);
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Текст нового владельца");
      expect(cardWrites(fake, "PATCH")).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("root edit ACK does not move focus from a nested editor of the same comment", async () => {
    const old = deferred<Response>();
    const fake = vi.fn(() => old.promise);
    const ui = await mount(createElement("div", null,
      createElement("section", { "data-kind": "root" }, createElement(MomentCommentCard, {
        comment: ownedComment("same-comment"), userId: "viewer-1", postId: "post-1",
        rootId: "same-comment", onReply: vi.fn(),
      })),
      createElement("section", { "data-kind": "nested" }, createElement(MomentCommentCard, {
        comment: ownedComment("same-comment"), userId: "viewer-1", postId: "post-1",
        rootId: "another-root", onReply: vi.fn(),
      })),
    ), fake);
    try {
      const root = ui.host.querySelector<HTMLElement>('[data-kind="root"]')!;
      const nested = ui.host.querySelector<HTMLElement>('[data-kind="nested"]')!;
      await act(async () => cardButton(root, "Редактировать комментарий").click());
      const rootField = root.querySelector<HTMLTextAreaElement>("textarea")!;
      rootField.focus();
      await act(async () => root.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ));
      expect(cardWrites(fake, "PATCH")).toHaveLength(1);
      await act(async () => cardButton(nested, "Редактировать комментарий").click());
      const nestedField = nested.querySelector<HTMLTextAreaElement>("textarea")!;
      expect(document.activeElement).toBe(nestedField);
      await act(async () => old.resolve(envelope(commentWire("same-comment", "Исходный комментарий"))));
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      expect(root.querySelector("textarea")).toBeNull();
      expect(nested.querySelector("textarea")).toBe(nestedField);
      expect(document.activeElement).toBe(nestedField);
      await act(async () => { cardButton(nested, "Отмена").focus(); cardButton(nested, "Отмена").click(); });
      expect(document.activeElement).toBe(cardButton(nested, "Редактировать комментарий"));
    } finally { await ui.cleanup(); }
  });

  it("same-turn reaction then cancel cannot dismiss an editor during the existing shared flight", async () => {
    const pending = deferred<Response>();
    const fake = vi.fn(() => pending.promise);
    const ui = await mount(ownedCard("comment-1", "viewer-1", "post-1"), fake);
    try {
      await ui.click("Редактировать комментарий");
      await ui.change("Черновик под защитой");
      await act(async () => {
        emojiControl(ui.host, "❤️").click();
        cardButton(ui.host, "Отмена").click();
        await Promise.resolve();
      });
      expect(reactionWrites(fake)).toHaveLength(1);
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Черновик под защитой");
      await act(async () => pending.resolve(envelope({ reaction: "❤️" })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.querySelector("textarea")).not.toBeNull();
      await ui.click("Отмена");
      expect(ui.host.querySelector("textarea")).toBeNull();
    } finally { await ui.cleanup(); }
  });
});
