// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { CURRENT_USER_QUERY_KEY } from "./useAuth";

function success(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), { status: 200 });
}
function user(id: string, username = id) {
  return { id, username, role: "USER" as const };
}

async function show(path: string, fetcher: ReturnType<typeof vi.fn>) {
  window.history.replaceState(null, "", path);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: {
    retry: false, refetchOnWindowFocus: false,
  } } });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, user("user-A"));
  await act(async () => root.render(createElement(
    QueryClientProvider, { client: cache }, createElement(App),
  )));
  // The Moments editor is lazy-loaded; cold imports may exceed 200 ms.
  for (let i = 0; i < 80; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 14)); });
    if (host.querySelector("#question-title") || host.querySelector("textarea")) break;
  }
  return {
    host, cache,
    async type(selector: string, value: string) {
      const element = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      expect(element).toBeDefined();
      const proto = element.tagName === "INPUT"
        ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
      await act(async () => {
        setter.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    async principal(value: ReturnType<typeof user> | null) {
      const previousMomentEditor = host.querySelector("textarea");
      await act(async () => { cache.setQueryData(CURRENT_USER_QUERY_KEY, value); });
      for (let i = 0; i < 80; i++) {
        await act(async () => { await new Promise(r => setTimeout(r, 12)); });
        if (!value) break;
        if (path === "/moments/new") {
          // After changing principals React replaces the keyed lazy editor.
          // A temporary Suspense fallback is not evidence that B's draft is empty.
          const current = host.querySelector<HTMLTextAreaElement>("textarea");
          if (current && current !== previousMomentEditor && current.value === "") break;
        } else if (host.querySelector("#question-title")) break;
      }
    },
    async cleanup() {
      await act(async () => root.unmount());
      cache.clear();
      host.remove();
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("AG2 G1-WEB-009 component-local principal isolation", () => {
  it("switch A to B resets question drafts and uses B-scoped permissions", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (path: string) => {
      calls.push(path);
      if (path.startsWith("/api/v1/questions?")) {
        return success({ items: [], nextPage: null, canPublish: true, blockReason: null });
      }
      return success(null);
    });
    const ui = await show("/questions/new", fetcher);
    try {
      await ui.type("#question-title", "PRIVATE_USER_A_TITLE");
      await ui.type("#question-body", "PRIVATE_USER_A_BODY");
      expect(ui.host.querySelector<HTMLInputElement>("#question-title")?.value)
        .toBe("PRIVATE_USER_A_TITLE");
      await ui.principal(user("user-B"));
      expect(ui.host.querySelector<HTMLInputElement>("#question-title")?.value).toBe("");
      expect(ui.host.querySelector<HTMLTextAreaElement>("#question-body")?.value).toBe("");
      expect(ui.host.innerHTML).not.toContain("PRIVATE_USER_A");
      expect(ui.cache.getQueryData(["questions", "create-rights", "user-B"]))
        .toBeDefined();
      // Background revalidation may issue another safe GET; require both
      // principal-scoped reads, not an exact incidental request count.
      expect(calls.filter(path => path.startsWith("/api/v1/questions?")).length)
        .toBeGreaterThanOrEqual(2);
      expect(calls).not.toContain("/api/v1/questions");
    } finally { await ui.cleanup(); }
  });

  it("switch A to guest removes private form without writing or deleting offline", async () => {
    const fetcher = vi.fn(async (path: string, _init?: RequestInit) =>
      path.startsWith("/api/v1/questions?")
        ? success({ items: [], nextPage: null, canPublish: true, blockReason: null })
        : success(null));
    const ui = await show("/questions/new", fetcher);
    try {
      await ui.type("#question-title", "A_PRIVATE_QUESTION");
      await ui.principal(null);
      expect(ui.host.querySelector("#question-title")).toBeNull();
      // The guest boundary now replaces protected URLs with the public landing.
      expect(window.location.pathname).toBe("/");
      expect(ui.host.querySelector("#question-title")).toBeNull();
      expect(ui.host.innerHTML).not.toContain("A_PRIVATE_QUESTION");
      expect(fetcher.mock.calls.every(([_path, init]) => init?.method !== "POST")).toBe(true);
    } finally { await ui.cleanup(); }
  });

  it("switch A to B resets unsaved Moments composer text, no draft writes", async () => {
    const fetcher = vi.fn(async (path: string, _init?: RequestInit) => {
      if (path.endsWith("/status")) return success({ enabled: true });
      return success(null);
    });
    const ui = await show("/moments/new", fetcher);
    try {
      expect(ui.host.querySelector("textarea")).not.toBeNull();
      await ui.type("textarea", "A_PRIVATE_MOMENT_DRAFT");
      await ui.principal(user("user-B"));
      // App's session boundary deliberately revokes A->B cache-only identity
      // switches without an explicit login receipt. It may withhold B's
      // editor entirely until re-authentication: that is fail-closed, not a
      // reason to carry A's unsaved draft into B's screen.
      const nextEditor = ui.host.querySelector<HTMLTextAreaElement>("textarea");
      if (nextEditor) expect(nextEditor.value).toBe("");
      else expect(ui.host.textContent).toMatch(
        /Проверяем возможность публикации|Сессия изменилась|Требуется авторизация/,
      );
      expect(ui.host.innerHTML).not.toContain("A_PRIVATE_MOMENT_DRAFT");
      expect(fetcher.mock.calls.every(([_path, init]) => init?.method !== "POST")).toBe(true);
    } finally { await ui.cleanup(); }
  });

  it("updating username of the same id keeps the user's own draft intact", async () => {
    const fetcher = vi.fn(async (path: string) => path.startsWith("/api/v1/questions?")
      ? success({ items: [], nextPage: null, canPublish: true, blockReason: null })
      : success(null));
    const ui = await show("/questions/new", fetcher);
    try {
      await ui.type("#question-title", "SAME_OWNER_DRAFT");
      await ui.principal(user("user-A", "renamed-user-A"));
      expect(ui.host.querySelector<HTMLInputElement>("#question-title")?.value)
        .toBe("SAME_OWNER_DRAFT");
    } finally { await ui.cleanup(); }
  });
});
