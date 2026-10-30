// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentPoll } from "./MomentPoll";

const poll = {
  id: "poll-1", postId: "post-1", question: "Как начать?",
  isQuiz: false, allowMultiple: false, isAnonymous: false,
  closed: false, explanation: null, totalVotes: null,
  myOptionIds: [], canEdit: false, serverNow: "2026-10-16T12:00:00.000Z",
  options: [
    { id: "option-1", text: "Спокойствие", votes: null },
    { id: "option-2", text: "Поддержка", votes: null },
  ],
};
function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200, data,
  }), { status });
}
async function mount(fetcher: ReturnType<typeof vi.fn>) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
    createElement(MomentPoll, { userId: "viewer-1", postId: "post-1" }),
  )));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  return {
    host, cache,
    async rerender(userId: string, postId: string) {
      await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
        createElement(MomentPoll, { userId, postId }),
      )));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    },
    async select(values: string[]) {
      await act(async () => {
        for (const id of values) {
          const input = host.querySelector<HTMLInputElement>('input[value="' + id + '"]')!;
          input.click();
        }
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

describe("Moments poll browser behavior", () => {
  it("renders a compact quiz with accessible participant disclosure", async () => {
    const quiz = {
      ...poll, isQuiz: true, totalVotes: 2, myOptionIds: ["option-1"],
      options: [
        { ...poll.options[0], votes: 2, isCorrect: true },
        { ...poll.options[1], votes: 0, isCorrect: false },
      ],
    };
    const fake = vi.fn((path: string) => Promise.resolve(
      path.includes("/voters")
        ? envelope({
            optionId: "option-1",
            items: [
              { id: "reader1", username: "dog_lover", name: "Любитель собак",
                avatarUrl: "https://images.example.test/avatar.webp" },
              { id: "reader2", username: "asm_tv", name: "Сергей",
                avatarUrl: "javascript:alert(1)" },
            ],
            nextCursor: null,
          })
        : envelope(quiz),
    ));
    const ui = await mount(fake);
    try {
      expect(ui.host.querySelector(".moment-poll-heading .moment-poll-question")?.textContent)
        .toContain("Как начать?");
      expect(ui.host.querySelector(".moment-poll-meta")?.textContent)
        .toContain("Викторина");
      expect(ui.host.querySelectorAll(".moment-poll-option")).toHaveLength(2);
      expect(ui.host.querySelector(".moment-poll-correct")?.getAttribute("aria-label"))
        .toBe("Правильный ответ");
      expect(ui.host.querySelector(".moment-poll-footnote")?.textContent)
        .toContain("Всего голосов: 2");
      const disclosure = ui.host.querySelector<HTMLButtonElement>(
        ".moment-poll-participants-trigger",
      )!;
      expect(disclosure.getAttribute("aria-expanded")).toBe("false");
      expect(ui.host.textContent).not.toContain("Любитель собак");
      await act(async () => disclosure.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      expect(disclosure.getAttribute("aria-expanded")).toBe("true");
      expect(ui.host.querySelector(".moment-poll-participants-list")?.textContent)
        .toContain("Любитель собак");
      const links = ui.host.querySelectorAll<HTMLAnchorElement>(".moment-poll-voter-link");
      expect(links).toHaveLength(2);
      expect(links[0]?.getAttribute("href")).toBe("/moments/profile/dog_lover");
      expect(links[0]?.getAttribute("aria-label")).toBe("Открыть профиль @dog_lover");
      expect(links[0]?.querySelector("img")?.getAttribute("src"))
        .toBe("https://images.example.test/avatar.webp");
      expect(links[0]?.textContent).toContain("@dog_lover");
      expect(links[1]?.getAttribute("href")).toBe("/moments/profile/asm_tv");
      expect(links[1]?.querySelector(".moment-poll-voter-avatar")?.textContent)
        .toBe("С");
      expect(links[1]?.querySelector("img")).toBeNull();
      await act(async () => {
        links[0]?.querySelector("img")?.dispatchEvent(new Event("error"));
      });
      expect(links[0]?.querySelector(".moment-poll-voter-avatar")?.textContent)
        .toBe("Л");
      expect(fake).toHaveBeenCalledTimes(2);
      await act(async () => disclosure.click());
      expect(disclosure.getAttribute("aria-expanded")).toBe("false");
      expect(ui.host.querySelector(".moment-poll-participants-list")).toBeNull();
    } finally { await ui.cleanup(); }
  });
  it("hides unpublished results, confirms vote via Core before rendering counts", async () => {
    let voted = false;
    const fake = vi.fn((_path: string, options?: RequestInit) => Promise.resolve(
      options?.method === "POST"
        ? (voted = true, envelope({ ...poll, myOptionIds: ["option-1"],
          totalVotes: 1, options: [
            { ...poll.options[0], votes: 1 }, { ...poll.options[1], votes: 0 },
          ] }))
        : envelope(voted ? { ...poll, myOptionIds: ["option-1"],
          totalVotes: 1, options: [
            { ...poll.options[0], votes: 1 }, { ...poll.options[1], votes: 0 },
          ] } : poll),
    ));
    const ui = await mount(fake);
    try {
      expect(ui.host.textContent).toContain("Как начать?");
      expect(ui.host.textContent).toContain("Результаты скрыты");
      expect(ui.host.textContent).not.toContain("Всего голосов:");
      await ui.select(["option-1"]);
      await ui.submit();
      const sent = fake.mock.calls.find(call => call[1]?.method === "POST");
      expect(sent?.[0]).toBe("/api/v1/feed/posts/post-1/poll/vote");
      expect(JSON.parse(String(sent?.[1]?.body))).toEqual({
        optionIds: ["option-1"],
      });
      expect([...ui.host.querySelectorAll(".moment-poll-option small")].map(item => item.textContent))
        .toEqual(["100%", "0%"]);
      const bars = [...ui.host.querySelectorAll<HTMLElement>(".web4-poll-vote-bar-fill")];
      expect(bars).toHaveLength(2);
      expect(bars.map(bar => bar.style.width)).toEqual(["100%", "0%"]);
      expect(ui.host.textContent).toContain("Всего голосов: 1");
      expect(ui.host.querySelector("button[type=submit]")).toBeNull();
      expect(JSON.stringify(ui.cache.getQueryData([
        "moments", "poll", "viewer-1", "post-1",
      ]))).not.toContain("secret");
    } finally { await ui.cleanup(); }
  });

  it("multi-select passes chosen IDs without unrequested options", async () => {
    const multiple = { ...poll, allowMultiple: true };
    const fake = vi.fn((_path: string, options?: RequestInit) => Promise.resolve(
      options?.method === "POST"
        ? envelope({ ...multiple, myOptionIds: ["option-1", "option-2"] })
        : envelope(multiple),
    ));
    const ui = await mount(fake);
    try {
      expect(ui.host.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
      await ui.select(["option-1", "option-2"]);
      await ui.submit();
      const sent = fake.mock.calls.find(call => call[1]?.method === "POST");
      expect(JSON.parse(String(sent?.[1]?.body))).toEqual({
        optionIds: ["option-1", "option-2"],
      });
    } finally { await ui.cleanup(); }
  });

  it("closed or previously voted poll cannot submit again", async () => {
    const fake = vi.fn().mockResolvedValue(envelope({
      ...poll, closed: true, totalVotes: 3, myOptionIds: ["option-1"],
      options: [{ ...poll.options[0], votes: 2 }, { ...poll.options[1], votes: 1 }],
    }));
    const ui = await mount(fake);
    try {
      expect(ui.host.querySelector('button[type="submit"]')).toBeNull();
      expect(ui.host.querySelector("fieldset")?.disabled).toBe(true);
      expect(fake).toHaveBeenCalledTimes(1);
    } finally { await ui.cleanup(); }
  });

  it("HTTP 409 does not optimistically mark votes and keeps selection", async () => {
    const fake = vi.fn((_path: string, options?: RequestInit) => Promise.resolve(
      options?.method === "POST" ? envelope(null, 409) : envelope(poll),
    ));
    const ui = await mount(fake);
    try {
      await ui.select(["option-2"]);
      await ui.submit();
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось проголосовать");
      expect(ui.host.querySelector<HTMLInputElement>(
        'input[value="option-2"]',
      )?.checked).toBe(true);
      expect(ui.host.textContent).not.toContain("Всего голосов:");
    } finally { await ui.cleanup(); }
  });
});


// SOC-POLL-VOTE-SINGLEFLIGHT: synthetic fetch only, the same existing mounted poll fixture.
function unresolvedVote() {
  let resolve!: (reply: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
async function submitTwiceSameTurn(host: HTMLDivElement) {
  const form = host.querySelector<HTMLFormElement>("form");
  if (!form) throw Error("Expected current poll form");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

describe("SOC-POLL-VOTE-SINGLEFLIGHT existing poll vote submit lifecycle", () => {
  it.each([false, true])("%s quiz mode: two same-turn submits emit only one POST", async isQuiz => {
    const active = { ...poll, isQuiz };
    const acknowledged = { ...active, myOptionIds: ["option-1"],
      totalVotes: 1, options: [{ ...poll.options[0], votes: 1 }, { ...poll.options[1], votes: 0 }],
    };
    let persisted = false;
    const pending = unresolvedVote();
    const fake = vi.fn((_path: string, options?: RequestInit) =>
      options?.method === "POST" ? pending.promise :
        Promise.resolve(envelope(persisted ? acknowledged : active)),
    );
    const ui = await mount(fake);
    try {
      await ui.select(["option-1"]);
      await submitTwiceSameTurn(ui.host);
      const submitted = fake.mock.calls.filter(([, options]) => options?.method === "POST");
      await act(async () => {
        persisted = true;
        pending.resolve(envelope(acknowledged));
      });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(submitted).toHaveLength(1);
      expect(JSON.parse(String(submitted[0][1]?.body))).toEqual({ optionIds: ["option-1"] });
      expect(ui.host.querySelector('button[type="submit"]')).toBeNull();
      expect(ui.host.textContent).toContain("Всего голосов: 1");
    } finally { await ui.cleanup(); }
  });

  it("unknown vote ACK retains selection, never auto-replays, explicit retry only", async () => {
    let posts = 0;
    const accepted = { ...poll, myOptionIds: ["option-2"], totalVotes: 1,
      options: [{ ...poll.options[0], votes: 0 }, { ...poll.options[1], votes: 1 }],
    };
    const fake = vi.fn((_path: string, options?: RequestInit) => {
      if (options?.method !== "POST") return Promise.resolve(envelope(posts > 1 ? accepted : poll));
      posts += 1;
      return Promise.resolve(posts === 1 ? envelope(null, 409) : envelope(accepted));
    });
    const ui = await mount(fake);
    try {
      await ui.select(["option-2"]);
      await ui.submit();
      expect(posts).toBe(1);
      expect(ui.host.textContent).toContain("Не удалось проголосовать");
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-2"]')?.checked).toBe(true);
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(posts).toBe(1);
      await ui.submit();
      expect(posts).toBe(2);
      expect(ui.host.textContent).toContain("Всего голосов: 1");
      expect(ui.host.querySelector('button[type="submit"]')).toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("retired owner/post vote ACK cannot close new poll or invalidate its query", async () => {
    const former = unresolvedVote();
    const current = unresolvedVote();
    const fake = vi.fn((path: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        return path.includes("post-1/") ? former.promise : current.promise;
      }
      const postId = path.includes("post-2") ? "post-2" : "post-1";
      return Promise.resolve(envelope({ ...poll, postId, id: `poll-${postId}`, question: `Вопрос ${postId}` }));
    });
    const ui = await mount(fake);
    const invalidate = vi.spyOn(ui.cache, "invalidateQueries");
    try {
      await ui.select(["option-1"]);
      await act(async () => {
        ui.host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await Promise.resolve();
      });
      expect(fake.mock.calls.filter(([, opts]) => opts?.method === "POST")).toHaveLength(1);
      await ui.rerender("viewer-2", "post-2");
      expect(ui.host.textContent).toContain("Вопрос post-2");
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-1"]')?.checked).toBe(false);
      await ui.select(["option-2"]);
      await act(async () => {
        ui.host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await Promise.resolve();
      });
      expect(fake.mock.calls.filter(([, opts]) => opts?.method === "POST")).toHaveLength(2);
      await act(async () => former.resolve(envelope({ ...poll, myOptionIds: ["option-1"], totalVotes: 1 })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.textContent).toContain("Вопрос post-2");
      expect(ui.host.querySelector('button[type="submit"]')).not.toBeNull();
      expect(ui.host.textContent).not.toContain("Всего голосов: 1");
      expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["moments", "poll", "viewer-2", "post-2"] });
      await act(async () => current.resolve(envelope({ ...poll, postId: "post-2", myOptionIds: ["option-2"], totalVotes: 1,
        options: [{ ...poll.options[0], votes: 0 }, { ...poll.options[1], votes: 1 }],
      })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["moments", "poll", "viewer-2", "post-2"] });
    } finally { await ui.cleanup(); }
  });
});

// SOC041_ORDINARY_CHANGE_CANCEL: current mounted Web poll, server DTO authority.
const savedVote = (choices: string[] = ["option-1"], overrides: Record<string, unknown> = {}) => ({
  ...poll, myOptionIds: choices, totalVotes: choices.length ? 1 : null,
  options: poll.options.map(option => ({ ...option, votes: choices.length ?
    (choices.includes(option.id) ? 1 : 0) : null })),
  ...overrides,
});
function actionButton(host: HTMLDivElement, name: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(item => item.textContent?.trim() === name);
  if (!button) throw new Error("Missing poll action: " + name);
  return button;
}
const writeCalls = (fn: ReturnType<typeof vi.fn>, method: string) =>
  fn.mock.calls.filter(call => (call[1] as RequestInit | undefined)?.method === method);
async function clickAction(host: HTMLDivElement, name: string) {
  await act(async () => actionButton(host, name).click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
}

describe("SOC041_ORDINARY_CHANGE_CANCEL existing Web poll mutability", () => {
  it("ordinary single choice: edit confirmed selection, cancel editing without PUT, then PUT + strict GET", async () => {
    let server = savedVote();
    const pending = unresolvedVote();
    const fetcher = vi.fn((_path: string, init?: RequestInit) => {
      if (init?.method === "PUT") return pending.promise;
      if (init?.method && init.method !== "GET") throw Error("UNEXPECTED_WRITE");
      return Promise.resolve(envelope(server));
    });
    const ui = await mount(fetcher);
    try {
      expect(ui.host.textContent).toContain("Изменить голос");
      expect(ui.host.textContent).toContain("Отменить голос");
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-1"]')?.checked).toBe(true);
      await clickAction(ui.host, "Изменить голос");
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-1"]')?.checked).toBe(true);
      await ui.select(["option-2"]);
      await clickAction(ui.host, "Отменить изменения");
      expect(writeCalls(fetcher, "PUT")).toHaveLength(0);
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-1"]')?.checked).toBe(true);
      await clickAction(ui.host, "Изменить голос");
      await ui.select(["option-2"]);
      await submitTwiceSameTurn(ui.host);
      expect(writeCalls(fetcher, "PUT")).toHaveLength(1);
      expect(writeCalls(fetcher, "POST")).toHaveLength(0);
      expect(writeCalls(fetcher, "PUT")[0][0]).toBe("/api/v1/feed/posts/post-1/poll/vote");
      expect(JSON.parse(String(writeCalls(fetcher, "PUT")[0][1]?.body)))
        .toEqual({ optionIds: ["option-2"] });
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-1"]')?.checked).toBe(true);
      await act(async () => {
        server = savedVote(["option-2"]);
        pending.resolve(envelope(server));
      });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-2"]')?.checked).toBe(true);
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-1"]')?.checked).toBe(false);
      expect(ui.host.textContent).toContain("Изменить голос");
    } finally { await ui.cleanup(); }
  });

  it("ordinary multiple choice: PUT only selected unique IDs and reconcile server choice", async () => {
    let server = savedVote(["option-1"], { allowMultiple: true });
    const fetcher = vi.fn((_path: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { optionIds: string[] };
        server = savedVote(body.optionIds, { allowMultiple: true });
        return Promise.resolve(envelope(server));
      }
      return Promise.resolve(envelope(server));
    });
    const ui = await mount(fetcher);
    try {
      await clickAction(ui.host, "Изменить голос");
      await ui.select(["option-2"]);
      await ui.submit();
      expect(writeCalls(fetcher, "PUT")).toHaveLength(1);
      expect(JSON.parse(String(writeCalls(fetcher, "PUT")[0][1]?.body)))
        .toEqual({ optionIds: ["option-1", "option-2"] });
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-1"]')?.checked).toBe(true);
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-2"]')?.checked).toBe(true);
    } finally { await ui.cleanup(); }
  });

  it("DELETE ordinary vote once, empty JSON body, no optimistic erasure; refetch hidden results", async () => {
    let server = savedVote();
    const pending = unresolvedVote();
    const fetcher = vi.fn((_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return pending.promise;
      return Promise.resolve(envelope(server));
    });
    const ui = await mount(fetcher);
    try {
      const cancel = actionButton(ui.host, "Отменить голос");
      await act(async () => { cancel.click(); cancel.click(); await Promise.resolve(); });
      expect(writeCalls(fetcher, "DELETE")).toHaveLength(1);
      expect(writeCalls(fetcher, "DELETE")[0][0]).toBe("/api/v1/feed/posts/post-1/poll/vote");
      expect(JSON.parse(String(writeCalls(fetcher, "DELETE")[0][1]?.body))).toEqual({});
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-1"]')?.checked).toBe(true);
      await act(async () => { server = savedVote([]); pending.resolve(envelope(server)); });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-1"]')?.checked).toBe(false);
      expect(ui.host.textContent).toContain("Проголосовать");
      expect(ui.host.textContent).toContain("Результаты скрыты");
      expect(ui.host.textContent).not.toContain("Изменить голос");
    } finally { await ui.cleanup(); }
  });

  it.each([{ isQuiz: true, closed: false }, { isQuiz: false, closed: true }])(
    "quiz/closed lock prevents any change/cancel even after prior vote (%j)", async attrs => {
      const fetcher = vi.fn().mockResolvedValue(envelope(savedVote(["option-1"], attrs)));
      const ui = await mount(fetcher);
      try {
        expect(ui.host.textContent).not.toContain("Изменить голос");
        expect(ui.host.textContent).not.toContain("Отменить голос");
        expect(ui.host.querySelector("fieldset")?.disabled).toBe(true);
        expect(writeCalls(fetcher, "PUT")).toHaveLength(0);
        expect(writeCalls(fetcher, "DELETE")).toHaveLength(0);
      } finally { await ui.cleanup(); }
    },
  );

  it("unknown PUT ACK is not replayed; manual GET before another write", async () => {
    let server = savedVote();
    let writes = 0;
    const fetcher = vi.fn((_path: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        writes++;
        if (writes === 1) return Promise.resolve(envelope(null, 500));
        server = savedVote(["option-2"]);
        return Promise.resolve(envelope(server));
      }
      return Promise.resolve(envelope(server));
    });
    const ui = await mount(fetcher);
    try {
      await clickAction(ui.host, "Изменить голос");
      await ui.select(["option-2"]);
      await ui.submit();
      expect(writes).toBe(1);
      expect(ui.host.textContent).toContain("Проверить состояние голоса");
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-1"]')?.checked).toBe(true);
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(writes).toBe(1);
      expect(actionButton(ui.host, "Сохранить выбор").disabled).toBe(true);
      await clickAction(ui.host, "Проверить состояние голоса");
      expect(writes).toBe(1);
      await ui.submit();
      expect(writes).toBe(2);
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-2"]')?.checked).toBe(true);
    } finally { await ui.cleanup(); }
  });

  it("HTTP200 PUT without matching strict GET cannot claim changed selection", async () => {
    const server = savedVote();
    const fetcher = vi.fn((_path: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "PUT" ? envelope(savedVote(["option-2"])) : envelope(server)),
    );
    const ui = await mount(fetcher);
    try {
      await clickAction(ui.host, "Изменить голос");
      await ui.select(["option-2"]);
      await ui.submit();
      expect(writeCalls(fetcher, "PUT")).toHaveLength(1);
      expect(ui.host.textContent).toContain("Проверить состояние голоса");
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-1"]')?.checked).toBe(true);
      expect(ui.host.textContent).not.toContain("Всего голосов: 0");
    } finally { await ui.cleanup(); }
  });

  it.each([403, 404])("HTTP %s from strict refetch revokes prior private state", async status => {
    let deny = false;
    const fetcher = vi.fn((_path: string, init?: RequestInit) =>
      Promise.resolve(deny && init?.method !== "PUT" ? envelope(null, status) : envelope(savedVote())),
    );
    const ui = await mount(fetcher);
    try {
      expect(ui.host.textContent).toContain("Отменить голос");
      deny = true;
      await act(async () => { await ui.cache.invalidateQueries({
        queryKey: ["moments", "poll", "viewer-1", "post-1"],
      }); });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.textContent).not.toContain("Как начать?");
      expect(ui.host.textContent).not.toContain("Отменить голос");
      expect(ui.host.querySelector("form")).toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("unknown DELETE ACK blocks repeats until manual GET, then sees server-confirmed empty vote", async () => {
    let server = savedVote();
    const fetcher = vi.fn((_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        server = savedVote([]);
        return Promise.resolve(envelope(null, 500));
      }
      return Promise.resolve(envelope(server));
    });
    const ui = await mount(fetcher);
    try {
      await clickAction(ui.host, "Отменить голос");
      expect(writeCalls(fetcher, "DELETE")).toHaveLength(1);
      expect(ui.host.textContent).toContain("Не удалось подтвердить отмену голоса");
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-1"]')?.checked).toBe(true);
      expect(actionButton(ui.host, "Отменить голос").disabled).toBe(true);
      await act(async () => actionButton(ui.host, "Отменить голос").click());
      expect(writeCalls(fetcher, "DELETE")).toHaveLength(1);
      await clickAction(ui.host, "Проверить состояние голоса");
      expect(writeCalls(fetcher, "DELETE")).toHaveLength(1);
      expect(ui.host.textContent).toContain("Проголосовать");
      expect(ui.host.textContent).toContain("Результаты скрыты");
      expect(ui.host.textContent).not.toContain("Отменить голос");
    } finally { await ui.cleanup(); }
  });

  it("old target's pending DELETE does not block new user/post and old ACK cannot affect it", async () => {
    const former = unresolvedVote();
    const latest = unresolvedVote();
    const invalidate = vi.fn();
    const fetcher = vi.fn((path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return former.promise;
      if (init?.method === "PUT") return latest.promise;
      const postId = path.includes("post-2") ? "post-2" : "post-1";
      return Promise.resolve(envelope(savedVote(["option-1"], {
        id: "poll-" + postId, postId, question: "Опрос " + postId,
      })));
    });
    const ui = await mount(fetcher);
    const watcher = vi.spyOn(ui.cache, "invalidateQueries");
    try {
      await act(async () => { actionButton(ui.host, "Отменить голос").click(); await Promise.resolve(); });
      expect(writeCalls(fetcher, "DELETE")).toHaveLength(1);
      await ui.rerender("viewer-2", "post-2");
      expect(ui.host.textContent).toContain("Опрос post-2");
      await clickAction(ui.host, "Изменить голос");
      await ui.select(["option-2"]);
      await act(async () => ui.host.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ));
      expect(writeCalls(fetcher, "PUT")).toHaveLength(1);
      await act(async () => former.resolve(envelope(savedVote([]))));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.textContent).toContain("Опрос post-2");
      expect(ui.host.textContent).not.toContain("Проголосовать");
      expect(watcher).not.toHaveBeenCalledWith({
        queryKey: ["moments", "poll", "viewer-2", "post-2"],
      });
      await act(async () => latest.resolve(envelope(savedVote(["option-2"], {
        id: "poll-post-2", postId: "post-2", question: "Опрос post-2",
      }))));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(ui.host.textContent).toContain("Опрос post-2");
      expect(invalidate).not.toHaveBeenCalled();
    } finally { await ui.cleanup(); }
  });
});


// WEB005_POLL_KEYBOARD_FLOW: existing form/React synthetic UI, no real DOM browser or HTTP.
const accessiblePollQuestion = (host: HTMLElement) => {
  const form = host.querySelector<HTMLFormElement>("form")!;
  const questionId = form.getAttribute("aria-labelledby");
  expect(questionId).toBeTruthy();
  const title = document.getElementById(questionId!);
  expect(title?.textContent).toBe("Как начать?");
  const legend = host.querySelector("fieldset legend")?.textContent;
  expect(legend).toContain("Как начать?");
};
function pollFocusButton(host: HTMLElement, name: string) {
  const button = actionButton(host as HTMLDivElement, name);
  button.focus();
  expect(document.activeElement).toBe(button);
  return button;
}

describe("WEB005_POLL_KEYBOARD_FLOW ordinary mutation form accessibility", () => {
  it("form and option group named after server question; edit focuses checked native option, cancel restores trigger", async () => {
    const fetcher = vi.fn().mockResolvedValue(envelope(savedVote()));
    const ui = await mount(fetcher);
    try {
      accessiblePollQuestion(ui.host);
      await act(async () => pollFocusButton(ui.host, "Изменить голос").click());
      const checked = ui.host.querySelector<HTMLInputElement>('input[value="option-1"]');
      expect(checked?.checked).toBe(true);
      expect(document.activeElement).toBe(checked);
      await act(async () => pollFocusButton(ui.host, "Отменить изменения").click());
      expect(document.activeElement).toBe(actionButton(ui.host, "Изменить голос"));
      expect(fetcher.mock.calls.filter(([, request]) => request?.method === "PUT"))
        .toHaveLength(0);
    } finally { await ui.cleanup(); }
  });

  it("confirmed PUT announces only after strict GET and returns keyboard focus to edit action", async () => {
    let getCalls = 0;
    const ack = unresolvedVote();
    const check = unresolvedVote();
    const fetcher = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") return ack.promise;
      return ++getCalls === 1 ? Promise.resolve(envelope(savedVote())) : check.promise;
    });
    const ui = await mount(fetcher);
    try {
      await act(async () => pollFocusButton(ui.host, "Изменить голос").click());
      await ui.select(["option-2"]);
      await act(async () => pollFocusButton(ui.host, "Сохранить выбор").click());
      expect(ui.host.textContent).not.toContain("Голос изменён");
      await act(async () => ack.resolve(envelope(savedVote(["option-2"]))));
      await act(async () => { await new Promise(done => setTimeout(done, 22)); });
      expect(getCalls).toBe(2);
      expect(ui.host.textContent).not.toContain("Голос изменён");
      await act(async () => check.resolve(envelope(savedVote(["option-2"]))));
      await act(async () => { await new Promise(done => setTimeout(done, 22)); });
      const status = [...ui.host.querySelectorAll('[role="status"]')]
        .find(el => el.textContent?.includes("Голос изменён"));
      expect(status).toBeTruthy();
      expect(status?.getAttribute("aria-live")).toBe("polite");
      expect(document.activeElement).toBe(actionButton(ui.host, "Изменить голос"));
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-2"]')?.checked).toBe(true);
    } finally { await ui.cleanup(); }
  });

  it("confirmed DELETE announces only after fresh GET, then focuses an enabled voting option", async () => {
    let gets = 0;
    const ack = unresolvedVote();
    const check = unresolvedVote();
    const fetcher = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return ack.promise;
      return ++gets === 1 ? Promise.resolve(envelope(savedVote())) : check.promise;
    });
    const ui = await mount(fetcher);
    try {
      await act(async () => pollFocusButton(ui.host, "Отменить голос").click());
      expect(ui.host.textContent).not.toContain("Голос отменён");
      await act(async () => ack.resolve(envelope(savedVote([]))));
      await act(async () => { await new Promise(done => setTimeout(done, 22)); });
      expect(ui.host.textContent).not.toContain("Голос отменён");
      await act(async () => check.resolve(envelope(savedVote([]))));
      await act(async () => { await new Promise(done => setTimeout(done, 22)); });
      expect([...ui.host.querySelectorAll('[role="status"]')]
        .some(el => el.textContent?.includes("Голос отменён"))).toBe(true);
      expect(ui.host.querySelector<HTMLInputElement>('input[value="option-1"]')?.disabled).toBe(false);
      expect(document.activeElement).toBe(ui.host.querySelector<HTMLInputElement>('input[value="option-1"]'));
    } finally { await ui.cleanup(); }
  });

  it("unknown PUT ACK never announces change or redirects focus; explicit manual GET remains", async () => {
    const fetcher = vi.fn((_url: string, init?: RequestInit) => Promise.resolve(
      init?.method === "PUT" ? envelope(null, 500) : envelope(savedVote())));
    const ui = await mount(fetcher);
    try {
      await act(async () => pollFocusButton(ui.host, "Изменить голос").click());
      await ui.select(["option-2"]);
      await act(async () => pollFocusButton(ui.host, "Сохранить выбор").click());
      await act(async () => { await new Promise(done => setTimeout(done, 22)); });
      expect(ui.host.textContent).not.toContain("Голос изменён");
      expect(ui.host.textContent).not.toContain("Голос отменён");
      expect(actionButton(ui.host, "Проверить состояние голоса").disabled).toBe(false);
      expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("external focus during deferred GET is respected; late retired post ACK never refocuses new owner", async () => {
    const check = unresolvedVote();
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "PUT") return Promise.resolve(envelope(savedVote(["option-2"])));
      if (url.includes("post-2")) return Promise.resolve(envelope({
        ...savedVote(), postId: "post-2", id: "poll-post-2", question: "Второй опрос",
      }));
      return check.promise;
    });
    // Initial GET and PUT ACK resolve; subsequent strict GET is deliberately deferred.
    let gotInitial = false;
    const read = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("post-2")) return fetcher(url, init);
      if (init?.method === "PUT") return fetcher(url, init);
      if (!gotInitial) { gotInitial = true; return Promise.resolve(envelope(savedVote())); }
      return check.promise;
    });
    const ui = await mount(read);
    const outside = document.createElement("button");
    outside.textContent = "Внешняя кнопка";
    document.body.append(outside);
    try {
      await act(async () => pollFocusButton(ui.host, "Изменить голос").click());
      await ui.select(["option-2"]);
      await act(async () => pollFocusButton(ui.host, "Сохранить выбор").click());
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      outside.focus();
      expect(document.activeElement).toBe(outside);
      await act(async () => check.resolve(envelope(savedVote(["option-2"]))));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(document.activeElement).toBe(outside);
      await ui.rerender("viewer-2", "post-2");
      outside.focus();
      expect(ui.host.textContent).toContain("Второй опрос");
      expect(document.activeElement).toBe(outside);
    } finally { outside.remove(); await ui.cleanup(); }
  });

  it("retired post with unfinished strict GET never announces or steals next owner's focus", async () => {
    const previousGet = unresolvedVote();
    let oldGetCount = 0;
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("post-2")) return Promise.resolve(envelope({
        ...savedVote(), id: "poll-2", postId: "post-2", question: "Новый опрос",
      }));
      if (init?.method === "PUT") return Promise.resolve(envelope(savedVote(["option-2"])));
      return ++oldGetCount === 1 ? Promise.resolve(envelope(savedVote())) : previousGet.promise;
    });
    const ui = await mount(fetcher);
    try {
      await act(async () => pollFocusButton(ui.host, "Изменить голос").click());
      await ui.select(["option-2"]);
      await act(async () => pollFocusButton(ui.host, "Сохранить выбор").click());
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(oldGetCount).toBe(2);
      await ui.rerender("viewer-2", "post-2");
      expect(ui.host.textContent).toContain("Новый опрос");
      pollFocusButton(ui.host, "Изменить голос");
      const ownerFocus = document.activeElement;
      await act(async () => previousGet.resolve(envelope(savedVote(["option-2"]))));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(document.activeElement).toBe(ownerFocus);
      expect(ui.host.textContent).not.toContain("Голос изменён");
      expect(ui.host.textContent).not.toContain("Голос отменён");
    } finally { await ui.cleanup(); }
  });

  it.each([{ isQuiz: true, closed: false }, { isQuiz: false, closed: true }])(
    "quiz/closed native choices remain disabled and never gain edit focus (%j)", async attrs => {
      const ui = await mount(vi.fn().mockResolvedValue(envelope(savedVote(["option-1"], attrs))));
      try {
        accessiblePollQuestion(ui.host);
        expect(ui.host.textContent).not.toContain("Изменить голос");
        expect(ui.host.textContent).not.toContain("Отменить голос");
        expect(ui.host.querySelector("fieldset")?.disabled).toBe(true);
        expect([...ui.host.querySelectorAll("input")]
          .every(el => el.matches(":disabled"))).toBe(true);
      } finally { await ui.cleanup(); }
    },
  );
});
