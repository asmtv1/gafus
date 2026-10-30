// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionReport } from "./QuestionReport";

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200, data, error: "Server unavailable",
  }), { status });
}
async function mount(fetcher: ReturnType<typeof vi.fn>, answerId?: string) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
    createElement(QuestionReport, { questionId: "question-A", answerId }),
  )));
  return {
    host,
    async click(label: string) {
      const button = Array.from(host.querySelectorAll("button"))
        .find(value => value.textContent?.includes(label));
      expect(button).toBeDefined();
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    },
    async submit() {
      await act(async () => host.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    },
    async cleanup() {
      await act(async () => root.unmount()); cache.clear(); host.remove();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("question and answer reporting", () => {
  it("question complaint sends shared reason without answerId, then shows ACK", async () => {
    const fake = vi.fn().mockImplementation(() =>
      Promise.resolve(response({ reported: true })));
    const screen = await mount(fake);
    try {
      await screen.click("Пожаловаться на вопрос");
      expect(screen.host.querySelector("select")?.textContent).toContain("Спам");
      await screen.submit();
      expect(fake).toHaveBeenCalledTimes(1);
      expect(fake.mock.calls[0][0]).toBe("/api/v1/questions/question-A/reports");
      expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
        reason: "Спам", details: "",
      });
      expect(screen.host.textContent).toContain("Жалоба отправлена");
      expect(screen.host.querySelector("form")).toBeNull();
    } finally { await screen.cleanup(); }
  });

  it("answer complaint includes target answerId", async () => {
    const fake = vi.fn().mockImplementation(() =>
      Promise.resolve(response({ reported: true })));
    const screen = await mount(fake, "answer-A");
    try {
      await screen.click("Пожаловаться на ответ");
      await screen.submit();
      expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
        answerId: "answer-A", reason: "Спам", details: "",
      });
    } finally { await screen.cleanup(); }
  });

  it("cancel does not contact server or report optimistically", async () => {
    const fake = vi.fn();
    const screen = await mount(fake);
    try {
      await screen.click("Пожаловаться на вопрос");
      await screen.click("Отмена");
      expect(screen.host.querySelector("form")).toBeNull();
      expect(screen.host.textContent).not.toContain("Жалоба отправлена");
      expect(fake).not.toHaveBeenCalled();
    } finally { await screen.cleanup(); }
  });

  it("503 keeps report form open for retry and shows an error", async () => {
    const fake = vi.fn().mockImplementation(() => Promise.resolve(response(null, 503)));
    const screen = await mount(fake, "answer-A");
    try {
      await screen.click("Пожаловаться на ответ");
      await screen.submit();
      expect(screen.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось отправить жалобу");
      expect(screen.host.querySelector("form")).not.toBeNull();
    } finally { await screen.cleanup(); }
  });
});
