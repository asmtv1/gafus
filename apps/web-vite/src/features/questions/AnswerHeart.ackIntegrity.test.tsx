// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerHeart } from "./AnswerHeart";
import { setQuestionAnswerHeart, type QuestionAnswerCard } from "./questionApi";
const response = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200 });
const answer: QuestionAnswerCard = {
  id: "answer-1",
  body: "Ответ",
  best: false,
  deleted: false,
  hidden: false,
  liked: false,
  hearts: 1,
  parentId: null,
  replyToName: null,
  replyCount: 0,
  canEdit: false,
  canDelete: false,
  authorName: "Кинолог",
  canHeart: true,
  photoIds: [],
};
let host: HTMLDivElement, root: Root, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 22));
  });
}
async function mount() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <AnswerHeart userId="owner_A" questionId="question-1" answer={answer} />
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
describe("heart mutation ACK and readback protection", () => {
  it("Q-H01 HTTP200 opposite liked ACK must not be considered success", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ liked: false, hearts: 1 }))
      .mockResolvedValueOnce(response({ liked: true, hearts: 2 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(setQuestionAnswerHeart("answer-1", true)).rejects.toThrow("не подтвердил");
    await expect(setQuestionAnswerHeart("answer-1", false)).rejects.toThrow("не подтвердил");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("Q-H02 contradictory ACK preserves count and does not autoPOST", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ liked: false, hearts: 1 }));
    vi.stubGlobal("fetch", fetcher);
    await mount();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')?.click(),
    );
    await flush();
    expect(
      host.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')?.textContent,
    ).toContain("1");
    expect(host.textContent).toContain("Не удалось изменить сердечко");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("Q-H03 failed ACK offers GET-only readback without second POST", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ liked: false, hearts: 1 }));
    vi.stubGlobal("fetch", fetcher);
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    await mount();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')?.click(),
    );
    await flush();
    const read = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === "Обновить состояние сердечка",
    );
    expect(read).toBeDefined();
    await act(async () => read?.click());
    await flush();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["questions", "detail", "owner_A", "question-1"],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});


// SOC-ANSWER-HEART-SINGLEFLIGHT: reuse existing mounted root and synthetic fetch.
function pendingHeartResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}
async function mountHeart(userId: string, questionId: string, current: QuestionAnswerCard) {
  await act(async () => root.render(
    <QueryClientProvider client={cache}>
      <AnswerHeart userId={userId} questionId={questionId} answer={current} />
    </QueryClientProvider>,
  ));
  await flush();
}
function currentHeartButton() {
  const button = host.querySelector<HTMLButtonElement>("button[aria-pressed]");
  if (!button) throw Error("Missing current answer heart button");
  return button;
}
function heartBody(call: unknown[]) {
  return JSON.parse((call[1] as RequestInit).body as string);
}

describe("SOC-ANSWER-HEART-SINGLEFLIGHT answer reaction submit lifecycle", () => {
  it("two same-turn clicks on an allowed answer dispatch exactly one explicit POST", async () => {
    const pending = pendingHeartResponse();
    const fetcher = vi.fn((..._args: unknown[]) => pending.promise);
    vi.stubGlobal("fetch", fetcher);
    await mountHeart("owner_A", "question-1", answer);
    const button = currentHeartButton();
    await act(async () => {
      button.click();
      button.click();
      await Promise.resolve();
    });
    const countBeforeAck = fetcher.mock.calls.length;
    await act(async () => pending.resolve(response({ liked: true, hearts: 2 })));
    await flush();
    expect(countBeforeAck).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/questions/answers/answer-1/heart");
    expect(heartBody(fetcher.mock.calls[0])).toEqual({ liked: true });
    expect(currentHeartButton().textContent).toContain("1");
    expect(currentHeartButton().getAttribute("aria-pressed")).toBe("false");
    expect(host.textContent).not.toContain("Не удалось изменить сердечко");
  });

  it("canHeart=false does not send, even when a disabled DOM button receives click", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await mountHeart("owner_A", "question-1", { ...answer, canHeart: false });
    expect(currentHeartButton().disabled).toBe(true);
    await act(async () => currentHeartButton().click());
    await flush();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("unknown or opposite ACK has no auto replay; GET refresh then explicit new click", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ liked: false, hearts: 1 }))
      .mockResolvedValueOnce(response({ liked: true, hearts: 2 }));
    vi.stubGlobal("fetch", fetcher);
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    await mountHeart("owner_A", "question-1", answer);
    await act(async () => currentHeartButton().click());
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Не удалось изменить сердечко");
    expect(currentHeartButton().textContent).toContain("1");
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const refresh = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Обновить состояние сердечка",
    );
    expect(refresh).toBeDefined();
    await act(async () => refresh?.click());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["questions", "detail", "owner_A", "question-1"],
    });
    await act(async () => currentHeartButton().click());
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(heartBody(fetcher.mock.calls[1])).toEqual({ liked: true });
    expect(host.textContent).not.toContain("Не удалось изменить сердечко");
  });

  it("old user/question/answer ACK does not block new pending target or invalidate new owner", async () => {
    const old = pendingHeartResponse();
    const latest = pendingHeartResponse();
    const fetcher = vi.fn()
      .mockImplementationOnce(() => old.promise)
      .mockImplementationOnce(() => latest.promise);
    vi.stubGlobal("fetch", fetcher);
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    await mountHeart("owner_A", "question-1", answer);
    await act(async () => { currentHeartButton().click(); await Promise.resolve(); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await mountHeart("owner_B", "question-2", { ...answer, id: "answer-2", hearts: 4 });
    expect(currentHeartButton().disabled).toBe(false);
    await act(async () => { currentHeartButton().click(); await Promise.resolve(); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe("/api/v1/questions/answers/answer-2/heart");
    await act(async () => old.resolve(response({ liked: true, hearts: 2 })));
    await flush();
    expect(currentHeartButton().disabled).toBe(true);
    expect(currentHeartButton().textContent).toContain("4");
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["questions", "detail", "owner_A", "question-1"],
    });
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: ["questions", "detail", "owner_B", "question-2"],
    });
    await act(async () => latest.resolve(response({ liked: true, hearts: 5 })));
    await flush();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["questions", "detail", "owner_B", "question-2"],
    });
  });

  it("changing answer under same user/question retires old pending flight independently", async () => {
    const first = pendingHeartResponse();
    const second = pendingHeartResponse();
    const fetcher = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    vi.stubGlobal("fetch", fetcher);
    await mountHeart("owner_A", "question-1", answer);
    await act(async () => { currentHeartButton().click(); await Promise.resolve(); });
    await mountHeart("owner_A", "question-1", { ...answer, id: "answer-3", liked: true, hearts: 8 });
    expect(currentHeartButton().disabled).toBe(false);
    await act(async () => { currentHeartButton().click(); await Promise.resolve(); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(heartBody(fetcher.mock.calls[0])).toEqual({ liked: true });
    expect(heartBody(fetcher.mock.calls[1])).toEqual({ liked: false });
    await act(async () => first.resolve(response({ liked: true, hearts: 2 })));
    await flush();
    expect(currentHeartButton().disabled).toBe(true);
    expect(currentHeartButton().getAttribute("aria-pressed")).toBe("true");
    expect(currentHeartButton().textContent).toContain("8");
    await act(async () => second.resolve(response({ liked: false, hearts: 7 })));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
