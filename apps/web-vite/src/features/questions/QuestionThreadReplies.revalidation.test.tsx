// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionThreadReplies } from "./QuestionThreadReplies";
const child = (id: string, body: string) => ({
  id,
  body,
  best: false,
  liked: false,
  hearts: 0,
  deleted: false,
  hidden: false,
  parentId: "root-1",
  replyToName: null,
  replyCount: 0,
  canEdit: false,
  canDelete: false,
  photos: [],
  author: { id: "A_PRIVATE", name: "Тренер" },
});
const page = (items: unknown[], nextPage: number | null = null) => ({ items, nextPage });
const ok = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify({
      success: status === 200,
      data,
      error: "PRIVATE_THREAD_STACK",
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
const onReply = vi.fn();
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 24));
  });
}
async function mount(userId = "owner_A", questionId = "question-1", rootId = "root-1") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <QuestionThreadReplies
          userId={userId}
          questionId={questionId}
          rootId={rootId}
          canReply
          blocked={false}
          onReply={onReply}
        />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function press(label: string) {
  const b = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === label,
  );
  expect(b).toBeDefined();
  await act(async () => b?.click());
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
  onReply.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("nested reply privacy and failed pagination", () => {
  it("Q-T01 cached child remains hidden during fresh expanded GET", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    cache.setQueryData(["questions", "replies", "owner_A", "question-1", "root-1"], {
      pages: [
        {
          items: [
            {
              id: "old-1",
              body: "PRIVATE_CACHED_CHILD",
              best: false,
              deleted: false,
              hidden: false,
              liked: false,
              hearts: 0,
              parentId: "root-1",
              replyToName: null,
              replyCount: 0,
              canEdit: false,
              canDelete: false,
              authorName: "Old author",
              photoIds: [],
              canHeart: true,
            },
          ],
          nextPage: null,
        },
      ],
      pageParams: [1],
    });
    await mount();
    await press("Показать ответы на комментарий");
    expect(host.textContent).toContain("Проверяем вложенные ответы");
    expect(host.textContent).not.toContain("PRIVATE_CACHED_CHILD");
    await act(async () => pending.resolve(ok(page([child("new-1", "Новый совет")]))));
    await flush();
    expect(host.textContent).toContain("Новый совет");
  });
  it.each(["next", "retry"])("Q-FLIGHT-PRE thread same-turn double %s uses one page2 GET", async mode => {
    const pending = deferred<Response>();
    let attempts = 0;
    const fetcher = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === "POST") throw Error("READ_ONLY_TEST");
      if (!url.includes("page=2")) return Promise.resolve(ok(page([
        child("nested-1", "ПЕРВЫЙ ВЛОЖЕННЫЙ"),
      ], 2)));
      attempts++;
      if (mode === "retry" && attempts === 1) return Promise.resolve(ok(null, 503));
      return pending.promise;
    });
    vi.stubGlobal("fetch", fetcher);
    await mount();
    await press("Показать ответы на комментарий");
    if (mode === "retry") await press("Ещё вложенные ответы");
    const label = mode === "next" ? "Ещё вложенные ответы" : "Повторить страницу";
    const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(node => node.textContent?.trim() === label);
    expect(button).toBeDefined();
    await act(async () => { button?.click(); button?.click(); });
    await flush();
    expect(fetcher.mock.calls.filter(([url]) => url.includes("page=2")))
      .toHaveLength(mode === "retry" ? 2 : 1);
    expect(host.textContent).toContain("ПЕРВЫЙ ВЛОЖЕННЫЙ");
    await act(async () => pending.resolve(ok(page([child("nested-2", "ВТОРОЙ ВЛОЖЕННЫЙ")]))));
    await flush();
    expect(host.textContent).toContain("ВТОРОЙ ВЛОЖЕННЫЙ");
    expect(host.textContent?.match(/ПЕРВЫЙ ВЛОЖЕННЫЙ/g)).toHaveLength(1);
  });

  it("Q-FLIGHT-IDENTITY new actor/root not blocked by previous root page2", async () => {
    const old = deferred<Response>();
    const fresh = deferred<Response>();
    const fetcher = vi.fn((url: string) => {
      const second = url.includes("root-2");
      if (url.includes("page=2")) return second ? fresh.promise : old.promise;
      return Promise.resolve(ok(page([child(second ? "new-1" : "old-1",
        second ? "НОВАЯ ВЕТКА" : "СТАРАЯ ВЕТКА")], 2)));
    });
    vi.stubGlobal("fetch", fetcher);
    await mount(); await press("Показать ответы на комментарий");
    await press("Ещё вложенные ответы");
    await mount("owner_B", "question-2", "root-2");
    expect(host.textContent).not.toContain("СТАРАЯ ВЕТКА");
    await press("Показать ответы на комментарий");
    expect(host.textContent).toContain("НОВАЯ ВЕТКА");
    await press("Ещё вложенные ответы");
    const busy = () => [...host.querySelectorAll<HTMLButtonElement>("button")]
      .some(node => node.disabled && node.textContent?.includes("Загрузка"));
    expect(busy()).toBe(true);
    await act(async () => old.resolve(ok(page([child("old-late", "PRIVATE_OLD_ROOT")]))));
    await flush();
    expect(host.textContent).not.toContain("PRIVATE_OLD_ROOT");
    expect(busy()).toBe(true);
    await act(async () => fresh.resolve(ok(page([child("new-2", "ВТОРОЙ НОВОЙ ВЕТКИ")]))));
    await flush();
    expect(host.textContent).toContain("ВТОРОЙ НОВОЙ ВЕТКИ");
    expect(fetcher.mock.calls.map(([url]) => url.includes("page=2")))
      .toEqual([false, true, false, true]);
  });

  it("Q-FLIGHT-INDEPENDENT two reply roots fetch page2 concurrently", async () => {
    const a = deferred<Response>(); const b = deferred<Response>();
    const fetcher = vi.fn((url: string) => {
      const root2 = url.includes("root-2");
      if (url.includes("page=2")) return root2 ? b.promise : a.promise;
      return Promise.resolve(ok(page([child(root2 ? "new-1" : "old-1",
        root2 ? "ВЕТКА ДВА" : "ВЕТКА ОДИН")], 2)));
    });
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(
      <QueryClientProvider client={cache}>
        <section data-thread="one"><QuestionThreadReplies userId="A" questionId="question-1"
          rootId="root-1" canReply blocked={false} onReply={onReply} /></section>
        <section data-thread="two"><QuestionThreadReplies userId="A" questionId="question-1"
          rootId="root-2" canReply blocked={false} onReply={onReply} /></section>
      </QueryClientProvider>,
    ));
    await flush();
    const find = (rootName: string, label: string) =>
      [...host.querySelectorAll<HTMLButtonElement>(`[data-thread="${rootName}"] button`)]
        .find(node => node.textContent?.trim() === label);
    await act(async () => {
      find("one", "Показать ответы на комментарий")?.click();
      find("two", "Показать ответы на комментарий")?.click();
    });
    await flush();
    await act(async () => {
      const more1=find("one", "Ещё вложенные ответы");
      more1?.click();more1?.click();
      find("two", "Ещё вложенные ответы")?.click();
    });
    await flush();
    expect(fetcher.mock.calls.filter(([url]) => url.includes("page=2"))).toHaveLength(2);
    await act(async () => a.resolve(ok(page([child("a-2", "ДОПОЛНЕНИЕ ОДИН")]))));
    await flush();
    expect(host.textContent).toContain("ДОПОЛНЕНИЕ ОДИН");
    expect([...host.querySelectorAll<HTMLButtonElement>('[data-thread="two"] button')]
      .some(node => node.disabled && node.textContent?.includes("Загрузка"))).toBe(true);
    await act(async () => b.resolve(ok(page([child("b-2", "ДОПОЛНЕНИЕ ДВА")]))));
    await flush();
    expect(host.textContent).toContain("ДОПОЛНЕНИЕ ДВА");
  });

  it("Q-T02 503 next page keeps first reply and GET-only manual retry", async () => {
    let next = 0;
    const fetcher = vi.fn((url: string) =>
      Promise.resolve(
        url.includes("page=2")
          ? ++next === 1
            ? ok(null, 503)
            : ok(page([child("nested-2", "ВТОРОЙ ВЛОЖЕННЫЙ")]))
          : ok(page([child("nested-1", "ПЕРВЫЙ ВЛОЖЕННЫЙ")], 2)),
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    await mount();
    await press("Показать ответы на комментарий");
    await press("Ещё вложенные ответы");
    expect(host.textContent).toContain("ПЕРВЫЙ ВЛОЖЕННЫЙ");
    expect(host.textContent).toContain("Не удалось загрузить следующую страницу");
    await press("Повторить страницу");
    expect(host.textContent).toContain("ВТОРОЙ ВЛОЖЕННЫЙ");
    expect(host.textContent?.match(/ПЕРВЫЙ ВЛОЖЕННЫЙ/g)).toHaveLength(1);
    expect(fetcher.mock.calls.map(([url]) => url.includes("page=2")))
      .toEqual([false, true, true]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([
    [401, "Сессия завершена. Войдите снова."],
    [403, "Нет доступа к вложенным ответам."],
    [404, "Ветка ответов недоступна."],
  ])("Q-T04 nested page2 HTTP%s masks only denied replies", async (status, message) => {
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") throw Error("READ-only test must not POST");
      return Promise.resolve(url.includes("page=2")
        ? ok(null, status)
        : ok(page([child("nested-1", "PRIVATE_FIRST_REPLY")], 2)));
    });
    vi.stubGlobal("fetch", fetcher);
    await mount();
    expect(fetcher).not.toHaveBeenCalled();
    await press("Показать ответы на комментарий");
    expect(host.textContent).toContain("PRIVATE_FIRST_REPLY");
    expect(host.querySelector('[aria-label="Ответить на комментарий"]')).not.toBeNull();
    await press("Ещё вложенные ответы");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(host.textContent).not.toContain("PRIVATE_FIRST_REPLY");
    expect(host.querySelector("ul.compact-grid")).toBeNull();
    expect(host.querySelector("li.compact-card")).toBeNull();
    expect(host.querySelector('[aria-label="Ответить на комментарий"]')).toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_THREAD_STACK");
    expect(host.textContent).not.toContain("Вложенных ответов пока нет");
    expect(host.textContent).not.toContain("Не удалось загрузить следующую страницу");
    expect([...host.querySelectorAll<HTMLButtonElement>("button")].some((button) =>
      button.textContent?.includes("Повторить") ||
      button.textContent?.includes("Ещё вложенные ответы"))).toBe(false);
    expect(host.querySelector('a[href="/login"]') !== null).toBe(status === 401);
    expect(fetcher.mock.calls.map(([url]) => url.includes("page=2")))
      .toEqual([false, true]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(onReply).not.toHaveBeenCalled();
  });

  it("Q-T05 denied reply branch keeps other confirmed branch", async () => {
    const fetcher = vi.fn((url: string) => Promise.resolve(
      url.includes("/answers/root-1/replies?page=2")
        ? ok(null, 403)
        : url.includes("/answers/root-1/replies?page=1")
          ? ok(page([child("nested-a", "PRIVATE_BRANCH_A")], 2))
          : url.includes("/answers/root-2/replies?page=1")
            ? ok(page([child("nested-b", "VERIFIED_BRANCH_B")], 2))
            : ok(null, 503),
    ));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(
      <QueryClientProvider client={cache}>
        <section data-thread="one">
          <QuestionThreadReplies rootId="root-1" userId="owner_A" questionId="question-1"
            canReply blocked={false} onReply={onReply} />
        </section>
        <section data-thread="two">
          <QuestionThreadReplies rootId="root-2" userId="owner_A" questionId="question-1"
            canReply blocked={false} onReply={onReply} />
        </section>
      </QueryClientProvider>,
    ));
    await flush();
    expect(fetcher).not.toHaveBeenCalled();
    const one = host.querySelector<HTMLElement>('[data-thread="one"]')!;
    const two = host.querySelector<HTMLElement>('[data-thread="two"]')!;
    for (const section of [one, two]) {
      const open = [...section.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Показать ответы на комментарий");
      expect(open).toBeDefined();
      await act(async () => open?.click());
      await flush();
    }
    expect(one.textContent).toContain("PRIVATE_BRANCH_A");
    expect(two.textContent).toContain("VERIFIED_BRANCH_B");
    const more = [...one.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Ещё вложенные ответы");
    expect(more).toBeDefined();
    await act(async () => more?.click());
    await flush();
    expect(one.querySelector('[role="alert"]')?.textContent)
      .toContain("Нет доступа к вложенным ответам.");
    expect(one.textContent).not.toContain("PRIVATE_BRANCH_A");
    expect(one.querySelector("ul.compact-grid")).toBeNull();
    expect(one.textContent).not.toContain("Повторить страницу");
    expect(two.textContent).toContain("VERIFIED_BRANCH_B");
    expect(two.querySelector("ul.compact-grid li.compact-card")).not.toBeNull();
    expect(two.querySelector('[aria-label="Ответить на комментарий"]')).not.toBeNull();
    expect(two.textContent).toContain("Ещё вложенные ответы");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/questions/answers/root-1/replies?page=1",
      "/api/v1/questions/answers/root-2/replies?page=1",
      "/api/v1/questions/answers/root-1/replies?page=2",
    ]);
    expect(onReply).not.toHaveBeenCalled();
  });

  it("Q-T03 principal switch resets expanded thread and never autoGETs B", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() => Promise.resolve(ok(page([child("nested-1", "Ответ A")]))));
    vi.stubGlobal("fetch", fetcher);
    await mount("A");
    await press("Показать ответы на комментарий");
    expect(host.textContent).toContain("Ответ A");
    await mount("B");
    expect(host.textContent).not.toContain("Ответ A");
    expect(host.textContent).toContain("Показать ответы на комментарий");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
