// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRouteSearch } from "../../shared/router/location";
import { focusedMomentCommentId } from "./MomentDetails";
import { MomentComments } from "./MomentComments";

const comment = {
  id: "comment-1", postId: "post-1", text: "Комментарий по ссылке",
  createdAt: "2026-10-16T12:00:00.000Z",
  author: { id: "author-A", username: "writer", name: "Автор", role: "USER" },
  rootId: null, replyToName: null, replyToId: null,
  deleted: false, replyCount: 0, canEdit: false, canDelete: false,
  myReaction: null, reactions: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("AG2 Web commentId legacy deep link characterization", () => {
  it("accepts exactly one safe commentId, rejects encoded traversal and duplicate query", () => {
    expect(focusedMomentCommentId("?commentId=comment-1")).toBe("comment-1");
    expect(focusedMomentCommentId("?commentId=valid_123&from=notification"))
      .toBe("valid_123");
    for (const url of [
      "?commentId=%2Fadmin", "?commentId=..%2Fadmin",
      "?commentId=%3Cscript%3E", "?commentId=",
      "?commentId=comment-1&commentId=comment-2",
      "?commentId=" + "a".repeat(129), "?commentId=%EF%BF%BD",
    ]) expect(focusedMomentCommentId(url)).toBeNull();
  });

  it("observes search changes on popstate even when pathname stays the same", async () => {
    window.history.replaceState(null, "", "/feed/post-1?commentId=comment-1#comments");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    function Probe() {
      const search = useRouteSearch();
      return createElement("output", {}, focusedMomentCommentId(search) ?? "none");
    }
    try {
      await act(async () => root.render(createElement(Probe)));
      expect(host.textContent).toBe("comment-1");
      expect(window.location.hash).toBe("#comments");
      await act(async () => {
        window.history.replaceState(null, "", "/feed/post-1?commentId=comment-2#comments");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(host.textContent).toBe("comment-2");
      expect(window.location.pathname).toBe("/feed/post-1");
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it("focuses a loaded root comment without extra network calls or persisting its ID", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const fetcher = vi.fn(async (_path: string) => new Response(JSON.stringify({
      success: true, data: { items: [comment], nextCursor: null },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true, value: scroll,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
        createElement(MomentComments, {
          postId: "post-1", userId: "viewer-A", focusedCommentId: "comment-1",
        }))));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      const focused = host.querySelector('[aria-label="Комментарий из уведомления"]');
      expect(focused).not.toBeNull();
      expect(focused?.textContent).toContain("Комментарий по ссылке");
      expect(document.activeElement).toBe(focused);
      expect(scroll).toHaveBeenCalledTimes(1);
      await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
        createElement(MomentComments, {
          postId: "post-1", userId: "viewer-A", focusedCommentId: null,
        }))));
      await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
        createElement(MomentComments, {
          postId: "post-1", userId: "viewer-A", focusedCommentId: "comment-1",
        }))));
      expect(scroll).toHaveBeenCalledTimes(2);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(cache.getQueryData(["moments", "comments", "viewer-B", "post-1"]))
        .toBeUndefined();
    } finally {
      await act(async () => root.unmount());
      cache.clear();
      host.remove();
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("resolves exact nested reply through registered authenticated Hono GET", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const fetcher = vi.fn(async (path: string, _request?: RequestInit) =>
      new Response(JSON.stringify({
      success: true, data: path.endsWith("/comments/reply-2")
        ? { ...comment, id: "reply-2", rootId: "off-page-root", replyToId: "off-page-root",
          text: "Вложенный ответ по ссылке" }
        : { items: [comment], nextCursor: null },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
        createElement(MomentComments, {
          postId: "post-1", userId: "viewer-A", focusedCommentId: "reply-2",
        }))));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      const focused = host.querySelector('[aria-label="Комментарий из уведомления"]');
      expect(focused?.textContent).toContain("Вложенный ответ по ссылке");
      expect(host.innerHTML).not.toMatch(/private-author|SECRET_|avatarUrl/);
      expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
        "/api/v1/feed/posts/post-1/comments?pageSize=20",
        "/api/v1/feed/comments/reply-2",
      ]);
      expect(fetcher.mock.calls.every(([, req]) =>
        !req?.method || req.method === "GET")).toBe(true);
    } finally {
      await act(async () => root.unmount());
      cache.clear();
      host.remove();
    }
  });
  it.each(["cross-post", "deleted"])(
    "hides %s notification target without leaking another post", async scenario => {
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
      const fetcher = vi.fn(async (path: string, request?: RequestInit) => {
        if (request?.method && request.method !== "GET") throw Error("NO_WRITES");
        if (path === "/api/v1/feed/comments/hidden-reply") {
          return scenario === "deleted"
            ? new Response(JSON.stringify({
              success: false, error: "SECRET_BACKEND_DETAILS",
            }), { status: 404 })
            : new Response(JSON.stringify({ success: true, data: {
              ...comment, id: "hidden-reply", postId: "other-post",
              text: "SECRET_PRIVATE_REPLY",
            } }), { status: 200 });
        }
        return new Response(JSON.stringify({ success: true,
          data: { items: [comment], nextCursor: null },
        }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetcher);
      const host = document.createElement("div"); document.body.append(host);
      const root = createRoot(host);
      const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      try {
        await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
          createElement(MomentComments, { userId: "viewer-A", postId: "post-1",
            focusedCommentId: "hidden-reply" }))));
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 45)); });
        expect(host.textContent).toContain("Комментарий недоступен");
        expect(host.innerHTML).not.toMatch(/SECRET_PRIVATE_REPLY|SECRET_BACKEND_DETAILS/);
        expect(fetcher.mock.calls.map(([path]) => path)).toContain(
          "/api/v1/feed/comments/hidden-reply");
        expect(fetcher.mock.calls.every(([, req]) => !req?.method || req.method === "GET"))
          .toBe(true);
      } finally {
        await act(async () => root.unmount()); cache.clear(); host.remove();
      }
    });

});
