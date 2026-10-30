// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionReport } from "./QuestionReport";
const ok = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify({
      success: status === 200,
      data,
      error: "PRIVATE_BACKEND_REPORT_TRACE",
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
let root: Root, host: HTMLDivElement, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 25));
  });
}
async function mount(questionId: string, answerId?: string) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <QuestionReport questionId={questionId} answerId={answerId} />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function press(label: string) {
  const btn = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === label,
  );
  expect(btn).toBeDefined();
  await act(async () => btn?.click());
  await flush();
}
async function submit() {
  await act(async () =>
    host
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
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
describe("question report target identity during navigation", () => {
  it("Q-R01 successful report A must not hide report action for target B", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(ok({ reported: true })));
    vi.stubGlobal("fetch", fetcher);
    await mount("question-A");
    await press("Пожаловаться на вопрос");
    await submit();
    expect(host.textContent).toContain("Жалоба отправлена");
    await mount("question-B");
    expect(host.textContent).toContain("Пожаловаться на вопрос");
    expect(host.textContent).not.toContain("Жалоба отправлена");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("Q-R02 pending old target ACK cannot show success or pending on new answer", async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetcher);
    await mount("question-A", "answer-1");
    await press("Пожаловаться на ответ");
    await act(async () =>
      host
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    await flush();
    expect(host.textContent).toContain("Отправляем");
    await mount("question-B", "answer-2");
    expect(host.textContent).toContain("Пожаловаться на ответ");
    expect(host.textContent).not.toContain("Отправляем");
    await act(async () => pending.resolve(ok({ reported: true })));
    await flush();
    expect(host.textContent).not.toContain("Жалоба отправлена");
    expect(host.textContent).toContain("Пожаловаться на ответ");
    expect(fetcher.mock.calls.length).toBe(1);
  });
});


// SOC-QUESTION-REPORT-SINGLEFLIGHT: existing mounted transport; no real reports.
const reportForm = () => {
  const form = host.querySelector<HTMLFormElement>("form");
  if (!form) throw Error("Missing report form");
  return form;
};
const reportSubmit = () => reportForm().dispatchEvent(
  new Event("submit", { bubbles: true, cancelable: true }),
);
const reportBody = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

describe("SOC-QUESTION-REPORT-SINGLEFLIGHT existing submit lifecycle", () => {
  it.each([
    ["question", "question-1", undefined],
    ["answer", "question-1", "answer-1"],
  ] as const)("%s two same-turn submits produce only one POST and one confirmed ACK", async (_kind, questionId, answerId) => {
    const pending = deferred<Response>();
    const fetcher = vi.fn((..._args: unknown[]) => pending.promise);
    vi.stubGlobal("fetch", fetcher);
    await mount(questionId, answerId);
    await press(answerId ? "Пожаловаться на ответ" : "Пожаловаться на вопрос");
    await act(async () => {
      reportSubmit();
      reportSubmit();
      await Promise.resolve();
    });
    const postsBeforeAck = fetcher.mock.calls.length;
    await act(async () => pending.resolve(ok({ reported: true })));
    await flush();
    expect(postsBeforeAck).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`/api/v1/questions/${questionId}/reports`);
    expect(reportBody(fetcher.mock.calls[0])).toEqual({
      ...(answerId ? { answerId } : {}), reason: "Спам", details: "",
    });
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(host.textContent).toContain("Жалоба отправлена на рассмотрение.");
  });

  it("503 and unknown ACK retain reason/details; only next explicit submit retries", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok(null, 503))
      .mockResolvedValueOnce(ok({ reported: true }));
    vi.stubGlobal("fetch", fetcher);
    await mount("question-err", "answer-err");
    await press("Пожаловаться на ответ");
    await act(async () => {
      const reason = reportForm().querySelector<HTMLSelectElement>("select");
      const details = reportForm().querySelector<HTMLTextAreaElement>("textarea");
      if (!reason || !details) throw Error("Missing report controls");
      reason.value = "Оскорбления";
      reason.dispatchEvent(new Event("change", { bubbles: true }));
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setValue?.call(details, "Причина_для_повтора");
      details.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await submit();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Не удалось отправить жалобу.");
    expect(reportForm().querySelector<HTMLSelectElement>("select")?.value).toBe("Оскорбления");
    expect(reportForm().querySelector<HTMLTextAreaElement>("textarea")?.value)
      .toBe("Причина_для_повтора");
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await submit();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(reportBody(fetcher.mock.calls[0])).toEqual(reportBody(fetcher.mock.calls[1]));
    expect(host.textContent).toContain("Жалоба отправлена на рассмотрение.");
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it.each([
    ["question", undefined, "answer-new"],
    ["answer", "answer-old", undefined],
  ] as const)("retired %s pending ACK cannot close newly opened other target", async (_kind, oldAnswer, newAnswer) => {
    const old = deferred<Response>();
    const current = deferred<Response>();
    const fetcher = vi.fn()
      .mockImplementationOnce(() => old.promise)
      .mockImplementationOnce(() => current.promise);
    vi.stubGlobal("fetch", fetcher);
    await mount("question-old", oldAnswer);
    await press(oldAnswer ? "Пожаловаться на ответ" : "Пожаловаться на вопрос");
    await act(async () => { reportSubmit(); await Promise.resolve(); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await mount("question-new", newAnswer);
    await press(newAnswer ? "Пожаловаться на ответ" : "Пожаловаться на вопрос");
    expect(reportForm().querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled)
      .toBe(false);
    await act(async () => { reportSubmit(); await Promise.resolve(); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => old.resolve(ok({ reported: true })));
    await flush();
    expect(host.querySelector("form")).not.toBeNull();
    expect(host.textContent).not.toContain("Жалоба отправлена");
    expect(reportForm().querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled)
      .toBe(true);
    await act(async () => current.resolve(ok({ reported: true })));
    await flush();
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
  });
});

// WEB005_QUESTION_REPORT_DISCLOSURE: actual inline form in existing mounted UI.
const openReportTrigger = () => host.querySelector<HTMLButtonElement>(
  '.question-report > button[type="button"]',
);
const activeReportForm = () => host.querySelector<HTMLFormElement>(".question-report form");

describe("WEB005_QUESTION_REPORT_DISCLOSURE native keyboard focus lifecycle", () => {
  it.each([
    ["question", "question-keyboard", undefined],
    ["answer", "question-keyboard", "answer-keyboard"],
  ] as const)("%s trigger discloses a named form and focuses its reason select", async (_kind, questionId, answerId) => {
    vi.stubGlobal("fetch", vi.fn());
    await mount(questionId, answerId);
    const trigger = openReportTrigger();
    expect(trigger).not.toBeNull();
    expect(trigger?.type).toBe("button");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    trigger?.focus();
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger?.click());
    await flush();
    const form = activeReportForm();
    const select = form?.querySelector<HTMLSelectElement>("select");
    const details = form?.querySelector<HTMLTextAreaElement>("textarea");
    expect(form?.getAttribute("aria-label")).toBe(answerId ? "Жалоба на ответ" : "Жалоба на вопрос");
    expect(trigger?.isConnected).toBe(true);
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(trigger?.getAttribute("aria-controls")).toBe(form?.id);
    expect(document.activeElement).toBe(select);
    expect(form?.querySelector<HTMLLabelElement>(`label[for="${select?.id}"]`)?.textContent)
      .toBe("Причина жалобы");
    expect(form?.querySelector<HTMLLabelElement>(`label[for="${details?.id}"]`)?.textContent)
      .toBe("Комментарий (необязательно)");
  });

  it("Cancel restores keyboard focus to persistent disclosure button, not body", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await mount("question-cancel");
    const trigger = openReportTrigger();
    trigger?.focus();
    await act(async () => trigger?.click());
    await flush();
    expect(document.activeElement).toBe(activeReportForm()?.querySelector("select"));
    await act(async () => {
      const cancel = [...reportForm().querySelectorAll("button")]
        .find(button => button.textContent?.trim() === "Отмена");
      cancel?.focus();
      cancel?.click();
    });
    await flush();
    expect(activeReportForm()).toBeNull();
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    expect(trigger?.isConnected).toBe(true);
  });

  it("confirmed ACK removes trigger/form, moves focus to exactly one announced status", async () => {
    const waiting = deferred<Response>();
    const fetcher = vi.fn(() => waiting.promise);
    vi.stubGlobal("fetch", fetcher);
    await mount("question-success", "answer-success");
    const trigger = openReportTrigger();
    await act(async () => trigger?.click());
    await flush();
    await act(async () => {
      reportForm().querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
      reportSubmit();
    });
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(reportForm().querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    const cancel = [...reportForm().querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Отмена");
    expect(cancel?.disabled).toBe(true);
    expect(openReportTrigger()?.disabled).toBe(true);
    await act(async () => { cancel?.click(); trigger?.click(); reportSubmit(); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(activeReportForm()).not.toBeNull();
    await act(async () => waiting.resolve(ok({ reported: true })));
    await flush();
    const status = host.querySelector<HTMLElement>('[role="status"]');
    expect(activeReportForm()).toBeNull();
    expect(openReportTrigger()).toBeNull();
    expect(status?.textContent).toBe("Жалоба отправлена на рассмотрение.");
    expect(status?.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(status);
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it("failed POST preserves labeled fields, exposes alert and only deliberate retry submits", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(ok(null, 503))
      .mockResolvedValueOnce(ok({ reported: true }));
    vi.stubGlobal("fetch", fetcher);
    await mount("question-error");
    await press("Пожаловаться на вопрос");
    await act(async () => {
      const reason = reportForm().querySelector<HTMLSelectElement>("select")!;
      reason.value = "Оскорбления";
      reason.dispatchEvent(new Event("change", { bubbles: true }));
      const details = reportForm().querySelector<HTMLTextAreaElement>("textarea")!;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(details, "Текст не терять");
      details.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await submit();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const form = reportForm();
    const alert = form.querySelector<HTMLElement>('[role="alert"]');
    expect(alert?.textContent).toBe("Не удалось отправить жалобу.");
    expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.getAttribute("aria-describedby"))
      .toBe(alert?.id);
    expect(form.querySelector<HTMLSelectElement>("select")?.value).toBe("Оскорбления");
    expect(form.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Текст не терять");
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await submit();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("duplicate instances with identical question/answer receive unique linked IDs", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await act(async () => root.render(
      <QueryClientProvider client={cache}>
        <QuestionReport questionId="question-same" answerId="answer-same" key="first" />
        <QuestionReport questionId="question-same" answerId="answer-same" key="second" />
      </QueryClientProvider>,
    ));
    await flush();
    const triggers = [...host.querySelectorAll<HTMLButtonElement>(
      '.question-report > button[type="button"]',
    )];
    expect(triggers).toHaveLength(2);
    expect(triggers[0].getAttribute("aria-controls")).not.toBe(
      triggers[1].getAttribute("aria-controls"),
    );
    await act(async () => triggers[0].click());
    await flush();
    await act(async () => triggers[1].click());
    await flush();
    const forms = [...host.querySelectorAll<HTMLFormElement>(".question-report form")];
    expect(forms).toHaveLength(2);
    expect(forms[0].id).not.toBe(forms[1].id);
    for (const i of [0, 1]) {
      expect(triggers[i].getAttribute("aria-controls")).toBe(forms[i].id);
      expect(forms[i].getAttribute("aria-label")).toBe("Жалоба на ответ");
    }
    const ids = forms.flatMap(form => [
      form.id, form.querySelector("select")?.id, form.querySelector("textarea")?.id,
    ]);
    expect(ids).toHaveLength(6);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    const laterSelect = forms[1].querySelector<HTMLSelectElement>("select");
    expect(document.activeElement).toBe(laterSelect);
    // Retiring the first instance must not move focus out of the second form.
    await act(async () => root.render(
      <QueryClientProvider client={cache}>
        <QuestionReport questionId="question-same" answerId="answer-same" key="second" />
      </QueryClientProvider>,
    ));
    await flush();
    // Current focus is never explicitly re-assigned by an unmounted old target.
    expect(document.activeElement).not.toBe(document.body);
  });
});
