// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentsCatalog } from "./MomentsCatalog";
import { MomentDetails } from "./MomentDetails";
import { MomentActions } from "./MomentActions";
import { projectPost, type MomentItem } from "./momentsApi";

const published = {
  id: "post-A", status: "published", text: "Первый момент",
  author: { id: "private-user", username: "trainer", name: "Кинолог",
    role: "TRAINER", avatarUrl: "https://private.example/avatar" },
  attachments: [{ id: "media-A", kind: "photo", status: "ready",
    // Ready Feed V2 content is delivered by the approved CDN, never a
    // private S3/source URL or an embedded authorization token.
    thumbUrl: "https://cdn.example/feed/post-A-medium.webp" }],
  reactions: [], myReaction: null, viewCount: 10, commentCount: 3,
  createdAt: "2026-10-16T12:00:00.000Z",
  publishedAt: "2026-10-16T12:00:00.000Z",
  hasPoll: false, canEdit: false,
};
function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200, data,
  }), { status });
}
async function mount(fetcher: ReturnType<typeof vi.fn>, detail = false) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // The feed now also reads the independent server pending-post list. Keep
  // these feed-pagination/reaction fixtures scoped to their original API.
  vi.stubGlobal("fetch", (path: string, options?: RequestInit) =>
    path.startsWith("/api/v1/feed/me/pending-posts")
      ? Promise.resolve(envelope({ items: [], nextCursor: null }))
      : (fetcher as unknown as (path: string, options?: RequestInit) => Promise<Response>)(
          path, options));
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
    detail
      ? createElement(MomentDetails, { postId: "post-A", userId: "viewer" })
      : createElement(MomentsCatalog, { userId: "viewer" }),
  )));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  return {
    host, cache,
    async more() {
      const button = Array.from(host.querySelectorAll("button"))
        .find(b => b.textContent?.includes("Ещё публикации"));
      expect(button).toBeDefined();
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    },
    async cleanup() {
      await act(async () => root.unmount()); cache.clear(); host.remove();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("Web Vite Moments", () => {
  it("respects server rollout gate and never requests posts when disabled", async () => {
    const fetcher = vi.fn().mockResolvedValue(envelope({
      enabled: false, smartEnabled: false,
    }));
    const ui = await mount(fetcher);
    try {
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][0]).toBe("/api/v1/feed/status");
      expect(ui.host.textContent).toContain("Моменты сейчас недоступны");
      expect(ui.host.querySelector("ul")).toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("paginates through Core cursor, deduplicates posts and shows only elevated roles", async () => {
    const fetcher = vi.fn((path: string) => {
      if (path === "/api/v1/feed/status") {
        return Promise.resolve(envelope({ enabled: true, smartEnabled: false }));
      }
      return Promise.resolve(envelope(path.includes("cursor=next123")
        ? { items: [published, { ...published, id: "post-B", text: "Другой момент",
          author: { ...published.author, role: "USER", name: "Пользователь" } }],
          nextCursor: null }
        : { items: [published], nextCursor: "next123" }));
    });
    const ui = await mount(fetcher);
    try {
      // Retained Next header: three destinations with resolution-independent icons.
      const headerNav = ui.host.querySelector('nav[aria-label="Разделы «Моментов»"]');
      expect(headerNav?.querySelectorAll("a")).toHaveLength(3);
      expect(headerNav?.querySelectorAll("a > svg[aria-hidden=true]")).toHaveLength(3);
      expect([...headerNav!.querySelectorAll("a")].map(link => link.textContent)).toEqual([
        "Лента", "Сохранённое", "Скрытые авторы",
      ]);
      expect(headerNav?.querySelector('a[href="/moments/drafts"]')).toBeNull();
      expect(ui.host.querySelector('a[href="/feed/notifications"]')).not.toBeNull();
      expect(ui.host.querySelector('a[href="/moments/new"]')).not.toBeNull();
      expect(ui.host.textContent).toContain("Сортировать по");
      expect(ui.host.textContent).toContain("Первый момент");
      expect(ui.host.textContent).toContain("Кинолог");
      expect(ui.host.textContent).not.toContain("SECRET");
      expect(ui.host.querySelector('a[href="/moments/post-A"]')).not.toBeNull();
      expect(ui.host.querySelector<HTMLButtonElement>('[data-feed-sort][aria-pressed="true"]')?.dataset.feedSort).toBe("new");
      expect(ui.host.querySelector('[data-feed-sort="smart"]')).toBeNull();
      await ui.more();
      expect(ui.host.querySelectorAll("ul.compact-grid > li")).toHaveLength(2);
      expect(ui.host.textContent).toContain("Другой момент");
      expect(fetcher.mock.calls.some(call => call[0].includes("cursor=next123")))
        .toBe(true);
      expect(JSON.stringify(ui.cache.getQueryData([
        "moments", "list", "viewer", "new",
      ]))).not.toMatch(/private-user|private.example|SECRET/);
    } finally { await ui.cleanup(); }
  });

  it("sort changes server request, smart sort only if Core has enabled it", async () => {
    const fetcher = vi.fn((path: string) => Promise.resolve(
      path === "/api/v1/feed/status"
        ? envelope({ enabled: true, smartEnabled: true })
        : envelope({ items: [published], nextCursor: null }),
    ));
    const ui = await mount(fetcher);
    try {
      const smart = ui.host.querySelector<HTMLButtonElement>('[data-feed-sort="smart"]');
      const discussed = ui.host.querySelector<HTMLButtonElement>('[data-feed-sort="discussed"]');
      expect(smart?.textContent).toBe("Для вас");
      expect(discussed).not.toBeNull();
      await act(async () => smart?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(smart?.getAttribute("aria-pressed")).toBe("true");
      expect(fetcher.mock.calls.some(call => call[0].includes("sort=smart")))
        .toBe(true);
      await act(async () => discussed?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(fetcher.mock.calls.some(call => call[0].includes("sort=discussed")))
        .toBe(true);
    } finally { await ui.cleanup(); }
  });

  it("source Next smart settings only load with enabled gate and persist through real transport GET/PATCH/reset", async () => {
    let city = true;
    let resets = 0;
    const fetcher = vi.fn((path: string, init?: RequestInit) => {
      if (path === "/api/v1/feed/status") return Promise.resolve(envelope({
        enabled: true, smartEnabled: true,
      }));
      if (path === "/api/v1/feed/personalization" && init?.method === "PATCH") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(payload).toEqual({ useCity: false });
        city = false;
      }
      if (path === "/api/v1/feed/personalization/reset" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({});
        resets += 1;
        city = true;
        return Promise.resolve(envelope({ reset: true, resetAt: "2026-10-26T00:00:00.000Z" }));
      }
      if (path === "/api/v1/feed/personalization") return Promise.resolve(envelope({
        enabled: true, useCity: city, usePets: true, useBehavior: true, exploration: true,
      }));
      return Promise.resolve(envelope({ items: [published], nextCursor: null }));
    });
    vi.stubGlobal("confirm", vi.fn(() => true));
    const ui = await mount(fetcher);
    try {
      expect(ui.host.querySelector('[data-feed-sort="smart"]')).not.toBeNull();
      expect(fetcher.mock.calls.some(call => call[0] === "/api/v1/feed/personalization"))
        .toBe(false);
      const configure = [...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent?.trim() === "Настроить");
      expect(configure).toBeDefined();
      await act(async () => configure?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
      const cityOption = [...ui.host.querySelectorAll<HTMLLabelElement>("label")]
        .find(label => label.textContent?.includes("Мой город"));
      const cityControl = cityOption?.querySelector<HTMLInputElement>('input[type="checkbox"]');
      expect(cityControl?.checked).toBe(true);
      await act(async () => cityControl?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 55)); });
      expect(fetcher.mock.calls.some(call => call[0] === "/api/v1/feed/personalization" &&
        call[1]?.method === "PATCH")).toBe(true);
      expect(cityOption?.querySelector<HTMLInputElement>("input")?.checked).toBe(false);
      const reset = [...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent?.trim() === "Сбросить рекомендации");
      await act(async () => reset?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 55)); });
      expect(resets).toBe(1);
      expect(cityOption?.querySelector<HTMLInputElement>("input")?.checked).toBe(true);
    } finally { await ui.cleanup(); }
  });

  it("shows backend failure, never a fake empty Moments list", async () => {
    const fetcher = vi.fn((path: string) => Promise.resolve(
      path === "/api/v1/feed/status"
        ? envelope({ enabled: true })
        : envelope(null, 503),
    ));
    const ui = await mount(fetcher);
    try {
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось загрузить публикации");
      expect(ui.host.textContent).not.toContain("Публикаций пока нет");
    } finally { await ui.cleanup(); }
  });

  it("reaction updates only after server ACK and list refetch", async () => {
    let reacted = false;
    const fetcher = vi.fn((path: string, options?: RequestInit) => {
      if (path.endsWith("/status")) {
        return Promise.resolve(envelope({ enabled: true, smartEnabled: false }));
      }
      if (path.endsWith("/reaction") && options?.method === "PUT") {
        reacted = true;
        return Promise.resolve(envelope({ ...published, myReaction: "❤️",
          reactions: [{ emoji: "❤️", count: 1 }] }));
      }
      return Promise.resolve(envelope({
        items: [{ ...published, myReaction: reacted ? "❤️" : null,
          reactions: reacted ? [{ emoji: "❤️", count: 1 }] : [] }],
        nextCursor: null,
      }));
    });
    const ui = await mount(fetcher);
    try {
      await openReactionPicker(ui.host);
      const reaction = ui.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Реакция ❤️"]',
      )!;
      expect(reaction.getAttribute("aria-pressed")).toBe("false");
      await act(async () => reaction.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
      expect(ui.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Реакция ❤️: 1"]',
      )?.getAttribute("aria-pressed")).toBe("true");
      const write = fetcher.mock.calls.find(call => call[1]?.method === "PUT");
      expect(write?.[0]).toBe("/api/v1/feed/posts/post-A/reaction");
      expect(JSON.parse(String(write?.[1]?.body))).toEqual({ reaction: "❤️" });
      expect(fetcher.mock.calls.filter(call => call[0].includes("sort=new")).length)
        .toBeGreaterThan(1);
    } finally { await ui.cleanup(); }
  });

  it("server reaction errors do not change pressed state or counters", async () => {
    const fetcher = vi.fn((path: string, options?: RequestInit) =>
      Promise.resolve(path.endsWith("/status")
        ? envelope({ enabled: true })
        : options?.method === "PUT" ? envelope(null, 503)
          : envelope({ items: [published], nextCursor: null })),
    );
    const ui = await mount(fetcher);
    try {
      await openReactionPicker(ui.host);
      const before = ui.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Реакция ❤️"]',
      )!;
      await act(async () => before.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      await openReactionPicker(ui.host);
      expect(ui.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Реакция ❤️"]',
      )?.getAttribute("aria-pressed")).toBe("false");
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось изменить реакцию");
    } finally { await ui.cleanup(); }
  });

  it("bookmark uses server explicit saved=true and refetches", async () => {
    let saved = false;
    const fetcher = vi.fn((path: string, options?: RequestInit) =>
      Promise.resolve(path.endsWith("/status")
        ? envelope({ enabled: true })
        : path.endsWith("/bookmark") && options?.method === "PUT"
          ? (saved = true, envelope({ saved: true }))
          : envelope({ items: [{ ...published, bookmarked: saved }], nextCursor: null })),
    );
    const ui = await mount(fetcher);
    try {
      const button = ui.host.querySelector<HTMLButtonElement>(
        '.moment-actions > button.moment-action-save-feed[aria-pressed="false"]',
      );
      expect(button?.getAttribute("aria-label")).toBe("В закладки");
      expect(button?.getAttribute("title")).toBe("В закладки");
      expect(button?.querySelector("svg[aria-hidden=\"true\"]")).not.toBeNull();
      expect(button?.textContent?.trim()).toBe("");
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      const savedButton = ui.host.querySelector<HTMLButtonElement>(
        '.moment-actions > button.moment-action-save-feed[aria-pressed="true"]',
      );
      expect(savedButton?.getAttribute("aria-label")).toBe("Убрать из закладок");
      expect(savedButton?.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
      expect(fetcher.mock.calls.find(call => call[1]?.method === "PUT")?.[0])
        .toBe("/api/v1/feed/posts/post-A/bookmark");
    } finally { await ui.cleanup(); }
  });

  it("direct post detail is authorized, no private URLs in the cache", async () => {
    const fetcher = vi.fn((path: string) => Promise.resolve(
      path === "/api/v1/feed/status" ? envelope({ enabled: true }) : envelope(published),
    ));
    const ui = await mount(fetcher, true);
    try {
      expect(ui.host.textContent).toContain("Первый момент");
      expect(ui.host.textContent).toContain("Кинолог");
      expect(ui.host.textContent).not.toContain("private-user");
      expect(ui.host.querySelector('a[href="/moments"]')).not.toBeNull();
      expect(JSON.stringify(ui.cache.getQueryData(["moments", "post", "viewer", "post-A"])))
        .not.toContain("private.example");
    } finally { await ui.cleanup(); }
  });
});


// SOC041_ACTIONS_SINGLEFLIGHT: existing mounted catalog + owned synthetic fetch.
const actionWrites = (fetcher: ReturnType<typeof vi.fn>) =>
  fetcher.mock.calls.filter(call => (call[1] as RequestInit | undefined)?.method === "PUT");
function deferredAction() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
async function openReactionPicker(host: HTMLDivElement) {
  const add = host.querySelector<HTMLButtonElement>(".moment-reaction-add");
  if (!add) throw Error("Missing reaction picker");
  await act(async () => add.click());
}
const momentReaction = (host: HTMLDivElement, emoji: string) => {
  const button = [...host.querySelectorAll<HTMLButtonElement>(".moment-actions button")]
    .find(item => item.getAttribute("aria-label") === "Реакция " + emoji);
  if (!button) throw Error("Missing reaction control");
  return button;
};
const momentBookmark = (host: HTMLDivElement) => {
  const button = host.querySelector<HTMLButtonElement>(
    '.moment-actions button.moment-action-save[aria-pressed][aria-label]',
  );
  if (!button) throw Error("Missing bookmark control");
  return button;
};
async function mountExistingAction(post: MomentItem, userId = "viewer") {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const render = async (next: MomentItem, nextUser: string) => {
    await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
      createElement(MomentActions, { post: next, userId: nextUser }),
    )));
  };
  await render(post, userId);
  return { host, cache, render,
    cleanup: async () => { await act(async () => root.unmount()); cache.clear(); host.remove(); },
  };
}

describe("SOC041_ACTIONS_SINGLEFLIGHT existing MomentActions lifecycle", () => {
  it.each(["reaction→bookmark", "two emojis", "two bookmarks"])(
    "%s: two same-turn actions on actual catalog card dispatch exactly one write", async scenario => {
      const pending = deferredAction();
      const fetcher = vi.fn((path: string, options?: RequestInit) => {
        if (path.endsWith("/status")) return Promise.resolve(envelope({ enabled: true }));
        if (options?.method === "PUT") return pending.promise;
        return Promise.resolve(envelope({ items: [published], nextCursor: null }));
      });
      const ui = await mount(fetcher);
      try {
        if (scenario !== "two bookmarks") await openReactionPicker(ui.host);
        const first = scenario === "two bookmarks"
          ? momentBookmark(ui.host) : momentReaction(ui.host, "❤️");
        const second = scenario === "two emojis"
          ? momentReaction(ui.host, "😂") : momentBookmark(ui.host);
        await act(async () => { first.click(); second.click(); await Promise.resolve(); });
        const captured = actionWrites(fetcher);
        const expectedPath = first === momentBookmark(ui.host)
          ? "/api/v1/feed/posts/post-A/bookmark" : "/api/v1/feed/posts/post-A/reaction";
        await act(async () => pending.resolve(envelope(expectedPath.endsWith("/bookmark")
          ? { saved: true } : { ...published, myReaction: "❤️",
            reactions: [{ emoji: "❤️", count: 1 }] })));
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
        expect(captured).toHaveLength(1);
        expect(captured[0][0]).toBe(expectedPath);
        expect(JSON.parse(String(captured[0][1]?.body))).toEqual(
          expectedPath.endsWith("/bookmark") ? {} : { reaction: "❤️" },
        );
      } finally { await ui.cleanup(); }
    },
  );

  it("late old owner/post ACK cannot block new target or invalidate current owner", async () => {
    const former = deferredAction();
    const newer = deferredAction();
    const fetcher = vi.fn((path: string, options?: RequestInit) => {
      if (options?.method === "PUT") return path.includes("post-A/")
        ? former.promise : newer.promise;
      return Promise.resolve(envelope({ items: [published], nextCursor: null }));
    });
    vi.stubGlobal("fetch", fetcher);
    const ui = await mountExistingAction(projectPost(published), "viewer-A");
    const invalidate = vi.spyOn(ui.cache, "invalidateQueries");
    try {
      await openReactionPicker(ui.host);
      await act(async () => { momentReaction(ui.host, "❤️").click(); await Promise.resolve(); });
      expect(actionWrites(fetcher)).toHaveLength(1);
      await ui.render(projectPost({ ...published, id: "post-B", text: "Другой" }), "viewer-B");
      expect(momentBookmark(ui.host).disabled).toBe(false);
      await act(async () => { momentBookmark(ui.host).click(); await Promise.resolve(); });
      expect(actionWrites(fetcher)).toHaveLength(2);
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(momentBookmark(ui.host).disabled).toBe(true);
      await act(async () => former.resolve(envelope({ ...published, myReaction: "❤️",
        reactions: [{ emoji: "❤️", count: 1 }] })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(momentBookmark(ui.host).disabled).toBe(true);
      await act(async () => momentBookmark(ui.host).click());
      expect(actionWrites(fetcher)).toHaveLength(2);
      expect(momentBookmark(ui.host).getAttribute("aria-pressed")).toBe("false");
      expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["moments", "saved", "viewer-B"] });
      await act(async () => newer.resolve(envelope({ saved: true })));
      await act(async () => { await Promise.resolve(); });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["moments", "saved", "viewer-B"] });
    } finally { await ui.cleanup(); }
  });

  it("unknown reaction ACK is not replayed; after settlement explicit bookmark click can submit", async () => {
    let writes = 0;
    const fetcher = vi.fn((path: string, options?: RequestInit) => {
      if (path.endsWith("/status")) return Promise.resolve(envelope({ enabled: true }));
      if (options?.method === "PUT") {
        writes++;
        return Promise.resolve(writes === 1 ? envelope(null, 503) : envelope({ saved: true }));
      }
      return Promise.resolve(envelope({ items: [published], nextCursor: null }));
    });
    const ui = await mount(fetcher);
    try {
      await openReactionPicker(ui.host);
      await act(async () => momentReaction(ui.host, "❤️").click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(writes).toBe(1);
      expect(ui.host.textContent).toContain("Не удалось изменить реакцию");
      await openReactionPicker(ui.host);
      expect(momentReaction(ui.host, "❤️").getAttribute("aria-pressed")).toBe("false");
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(writes).toBe(1);
      await act(async () => momentBookmark(ui.host).click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(writes).toBe(2);
      expect(actionWrites(fetcher)[1][0]).toBe("/api/v1/feed/posts/post-A/bookmark");
    } finally { await ui.cleanup(); }
  });
});
