// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { questionEditIdFromPath, questionEditPath, routeForPath } from "../../shared/router/location";

const QUESTION = {
  id: "question-A", title: "Заголовок вопроса", body: "Мой исходный текст",
  category: "Поведение", status: "waiting", answerCount: 0,
  createdAt: "2026-10-16T12:00:00.000Z",
  author: { id: "author-A", name: "Автор", username: "author" },
  tags: ["щенок"], photos: [{ id: "photo-A" }],
  closed: false, canReply: true, canManage: true, canEdit: true,
  blockReason: null, nextAnswerPage: null, answers: [],
};
const send = (data: unknown, status = 200) => new Response(JSON.stringify({
  success: status === 200, data, error: "Unavailable",
}), { status });

async function render(path: string, account: string | null,
  fetcher: ReturnType<typeof vi.fn>) {
  window.history.replaceState(null, "", path);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (account) {
    cache.setQueryData(CURRENT_USER_QUERY_KEY, {
      id: account, username: account, role: "USER",
    });
  }
  await act(async () => root.render(createElement(
    QueryClientProvider, { client: cache }, createElement(App),
  )));
  // Vite's cold lazy import of the Questions route can exceed 120ms under
  // concurrent agent typechecks. Wait for the actual screen, not a fixed
  // handful of transforms; all functional/ACL assertions remain unchanged.
  for (let attempt = 0; attempt < 60; attempt++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 45)); });
    // Guest redirection and landing chunk commit are separate async steps.
    // A successful replaceState("/") alone may still show Suspense's spinner:
    // this test must wait for the real public login link before asserting it.
    const guestLandingReady = account === null && window.location.pathname === "/" &&
      host.textContent?.includes("Войти");
    if (host.querySelector('[id^="question-edit-title-"]') ||
      host.textContent?.includes("Редактирование недоступно") ||
      guestLandingReady) break;
  }
  return {
    host, cache,
    async fill(selector: string, value: string) {
      const node = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      const proto = node.tagName === "INPUT"
        ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
      await act(async () => {
        setter.call(node, value);
        node.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    async click(text: string) {
      const node = Array.from(host.querySelectorAll("button"))
        .find(btn => btn.textContent?.includes(text));
      expect(node).toBeDefined();
      await act(async () => node?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    },
    async submit() {
      await act(async () => host.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
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

describe("AG2 legacy question edit deep link", () => {
  it("matches only one safe question ID and never an arbitrary nested path", () => {
    expect(questionEditPath("question-A")).toBe("/questions/question-A/edit");
    expect(questionEditIdFromPath("/questions/question-A/edit")).toBe("question-A");
    expect(routeForPath("/questions/question-A/edit")).toBe("/questions/question-A/edit");
    expect(routeForPath("/questions/question-A/edit/")).toBe("/questions/question-A/edit");
    for (const invalid of [
      "/questions/new/edit", "/questions/../edit", "/questions/%2Fadmin/edit",
      "/questions/question-A/edit/other", "/questions//edit", "/questions/question-A/edit-any",
    ]) expect(routeForPath(invalid)).toBeNull();
    expect(() => questionEditPath("../admin")).toThrow();
  });

  it("requires user login without fetching any question data for guests", async () => {
    const fetcher = vi.fn(async (_url: string) => send(null, 401));
    const ui = await render("/questions/question-A/edit", null, fetcher);
    try {
      // Guest course/question pages were intentionally retired: the only
      // permitted anonymous surface is the marketing presentation at `/`.
      expect(window.location.pathname).toBe("/");
      expect(ui.host.textContent).toContain("Войти");
      // Compare request paths directly: on failure we need to distinguish an
      // actual private API call from delayed auth UI. Never relax this guard.
      const leakedQuestionRequests = fetcher.mock.calls
        .map(([url]) => String(url))
        .filter(url => url.startsWith("/api/v1/questions/"));
      expect(leakedQuestionRequests).toEqual([]);
    } finally { await ui.cleanup(); }
  });

  it("opens edit form for canEdit owner, saves original tags/photos, navigates only after ACK", async () => {
    let saved = false;
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        saved = true;
        return send({ id: "question-A" });
      }
      return send({ ...QUESTION, body: saved ? "Сохранённое описание" : QUESTION.body });
    });
    const ui = await render("/questions/question-A/edit", "owner-A", fetcher);
    try {
      expect(ui.host.querySelector('[id^="question-edit-title-"]')).not.toBeNull();
      expect(ui.host.querySelector<HTMLInputElement>('[id^="question-edit-title-"]')?.value)
        .toBe("Заголовок вопроса");
      expect(ui.host.querySelector("#question-reply")).toBeNull();
      await ui.fill('[id^="question-edit-body-"]', "Сохранённое описание");
      await ui.submit();
      const mutation = fetcher.mock.calls.find(([_url, init]) => init?.method === "PATCH");
      expect(mutation?.[0]).toBe("/api/v1/questions/question-A");
      expect(JSON.parse(String(mutation?.[1]?.body))).toMatchObject({
        title: "Заголовок вопроса", body: "Сохранённое описание",
        tags: ["щенок"], photoIds: ["photo-A"],
      });
      expect(window.location.pathname).toBe("/questions/question-A");
      expect(ui.host.textContent).toContain("Сохранённое описание");
    } finally { await ui.cleanup(); }
  });

  it("canManage does not grant editing when canEdit is false", async () => {
    const fetcher = vi.fn(async (_url: string) => send({
      ...QUESTION, canEdit: false, canManage: true,
    }));
    const ui = await render("/questions/question-A/edit", "manager", fetcher);
    try {
      expect(ui.host.textContent).toContain("Редактирование недоступно");
      expect(ui.host.querySelector("form")).toBeNull();
      expect(ui.host.textContent).not.toContain("Мой исходный текст");
      // App may independently validate the session; only one owner-scoped
      // question detail GET is relevant to forbidden management controls.
      expect(fetcher.mock.calls.filter(([url]) => String(url).startsWith(
        "/api/v1/questions/question-A?"))).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("server 403 leaves draft and route intact; cancel returns to question without PATCH", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PATCH" ? send(null, 403) : send(QUESTION));
    const ui = await render("/questions/question-A/edit", "owner-A", fetcher);
    try {
      await ui.fill('[id^="question-edit-body-"]', "Черновик без сохранения");
      await ui.submit();
      expect(window.location.pathname).toBe("/questions/question-A/edit");
      expect(ui.host.querySelector<HTMLTextAreaElement>('[id^="question-edit-body-"]')?.value)
        .toBe("Черновик без сохранения");
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось изменить вопрос");
      await ui.click("Отмена");
      expect(window.location.pathname).toBe("/questions/question-A");
      expect(fetcher.mock.calls.filter(([_url, init]) => init?.method === "PATCH"))
        .toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("GET 404 displays an error, not an editable empty question", async () => {
    const fetcher = vi.fn(async (_url: string) => send(null, 404));
    const ui = await render("/questions/question-A/edit", "owner-A", fetcher);
    try {
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Вопрос не найден или недоступен");
      expect(ui.host.querySelector('[id^="question-edit-title-"]')).toBeNull();
    } finally { await ui.cleanup(); }
  });
});
