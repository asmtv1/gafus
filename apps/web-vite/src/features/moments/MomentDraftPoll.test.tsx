// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentDraftPoll } from "./MomentDraftPoll";

const payload = {
  id: "poll-1", postId: "post-1", question: "Как помогает прогулка?",
  allowMultiple: false, isQuiz: false, isAnonymous: false,
  closed: false, explanation: null, totalVotes: null,
  myOptionIds: [], options: [
    { id: "option-1", text: "Постепенно", votes: null },
    { id: "option-2", text: "Регулярно", votes: null },
  ],
};
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200, data, error: "Core unavailable",
  }), { status });
}
async function mount(fetcher: ReturnType<typeof vi.fn>) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const changes: boolean[] = [];
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(createElement(QueryClientProvider, {
    client: cache,
  }, createElement(MomentDraftPoll, {
    postId: "post-1", userId: "viewer", version: 1,
    onEditingChange: value => changes.push(value),
  }))));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  return {
    host, changes, cache,
    async rerender(userId: string, postId: string, version: number,
      onEditingChange: (value: boolean) => void) {
      await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
        createElement(MomentDraftPoll, { userId, postId, version, onEditingChange }))));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    },
    async click(label: string) {
      const button = Array.from(host.querySelectorAll("button"))
        .find(value => value.textContent?.includes(label));
      expect(button).toBeDefined();
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    },
    async fill(id: string, text: string) {
      const field = host.querySelector<HTMLInputElement>("#" + id)!;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, "value",
      )!.set!;
      await act(async () => {
        setter.call(field, text);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    async cleanup() {
      await act(async () => root.unmount()); cache.clear(); host.remove();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("draft poll authoring", () => {
  it("only creates after server GET 200/null, validates options, and acknowledges saved poll", async () => {
    let stored = false;
    const fake = vi.fn((_path: string, init?: RequestInit) => Promise.resolve(
      init?.method === "PUT" ? (stored = true, response(payload))
        : stored ? response(payload) : response(null),
    ));
    const ui = await mount(fake);
    try {
      await ui.click("Добавить опрос");
      expect(ui.changes).toEqual([true]);
      await ui.fill("moment-poll-question", "Как помогает прогулка?");
      await ui.fill("moment-poll-option-0", "Постепенно");
      await ui.fill("moment-poll-option-1", "Регулярно");
      await ui.click("Сохранить опрос");
      expect(fake.mock.calls.filter(call => call[1]?.method === "PUT")).toHaveLength(1);
      const write = fake.mock.calls.find(call => call[1]?.method === "PUT");
      expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({
        expectedVersion: 1, question: "Как помогает прогулка?",
        options: [{ text: "Постепенно" }, { text: "Регулярно" }],
      });
      expect(ui.changes).toEqual([true, false]);
      expect(ui.host.textContent).toContain("Опрос уже сохранён");
      expect(ui.host.querySelector("form")).toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("existing poll blocks duplicate creation and prevents overwriting", async () => {
    const fake = vi.fn().mockResolvedValue(response(payload));
    const ui = await mount(fake);
    try {
      expect(ui.host.textContent).toContain("Опрос уже сохранён");
      expect(ui.host.querySelector("form")).toBeNull();
      expect(ui.host.textContent).not.toContain("Добавить опрос");
      expect(fake.mock.calls.every(call => call[1]?.method !== "PUT")).toBe(true);
    } finally { await ui.cleanup(); }
  });

  it("failure to inspect server poll blocks editing, not a guessed empty poll", async () => {
    const fake = vi.fn().mockResolvedValue(response(null, 503));
    const ui = await mount(fake);
    try {
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось проверить");
      expect(ui.host.querySelector("form")).toBeNull();
      expect(ui.host.textContent).not.toContain("Добавить опрос");
    } finally { await ui.cleanup(); }
  });

  it("lost PUT acknowledgement reconciles an existing Core poll before retry", async () => {
    let stored = false;
    const fake = vi.fn((_path: string, init?: RequestInit) => Promise.resolve(
      init?.method === "PUT" ? (stored = true, response(null, 503))
        : stored ? response(payload) : response(null),
    ));
    const ui = await mount(fake);
    try {
      await ui.click("Добавить опрос");
      await ui.fill("moment-poll-question", "Как помогает прогулка?");
      await ui.fill("moment-poll-option-0", "Постепенно");
      await ui.fill("moment-poll-option-1", "Регулярно");
      await ui.click("Сохранить опрос");
      expect(ui.host.textContent).toContain("Опрос уже сохранён");
      expect(ui.host.querySelector("form")).toBeNull();
      expect(ui.changes).toEqual([true, false]);
      expect(fake.mock.calls.filter(call => call[1]?.method === "PUT"))
        .toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("cancelling does not make any PUT request and unlocks parent", async () => {
    const fake = vi.fn().mockResolvedValue(response(null));
    const ui = await mount(fake);
    try {
      await ui.click("Добавить опрос");
      await ui.click("Отмена");
      expect(ui.changes).toEqual([true, false]);
      expect(ui.host.querySelector("form")).toBeNull();
      expect(fake.mock.calls.every(call => call[1]?.method !== "PUT")).toBe(true);
    } finally { await ui.cleanup(); }
  });
});


// SOC041_DRAFT_POLL_CREATE_FLIGHT: existing mounted creation-only editor.
const pollWrites = (fetcher: ReturnType<typeof vi.fn>) =>
  fetcher.mock.calls.filter(call => (call[1] as RequestInit | undefined)?.method === "PUT");
function deferredSave() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { resolve, promise };
}
async function fillRequiredPoll(ui: Awaited<ReturnType<typeof mount>>) {
  await ui.click("Добавить опрос");
  await ui.fill("moment-poll-question", "Сохраняемый вопрос");
  await ui.fill("moment-poll-option-0", "Первый вариант");
  await ui.fill("moment-poll-option-1", "Второй вариант");
}
async function sameTurnPollSubmit(host: HTMLElement) {
  await act(async () => {
    const form = host.querySelector("form");
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

describe("SOC041_DRAFT_POLL_CREATE_FLIGHT existing creation only", () => {
  it("two same-turn submits send only one versioned PUT, no replace", async () => {
    let persisted = false;
    const held = deferredSave();
    const fake = vi.fn((_path: string, init?: RequestInit) =>
      init?.method === "PUT" ? held.promise : Promise.resolve(persisted
        ? response({ ...payload, question: "Сохраняемый вопрос" }) : response(null)));
    const ui = await mount(fake);
    try {
      await fillRequiredPoll(ui);
      await sameTurnPollSubmit(ui.host);
      expect(pollWrites(fake)).toHaveLength(1);
      expect(pollWrites(fake)[0][0]).toBe("/api/v1/feed/posts/post-1/poll");
      expect(JSON.parse(String(pollWrites(fake)[0][1]?.body))).toMatchObject({
        expectedVersion: 1, question: "Сохраняемый вопрос",
        options: [{ text: "Первый вариант" }, { text: "Второй вариант" }],
      });
      await act(async () => {
        persisted = true;
        held.resolve(response({ ...payload, question: "Сохраняемый вопрос" }));
      });
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      expect(ui.host.textContent).toContain("Опрос уже сохранён");
      expect(pollWrites(fake)).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("unknown PUT and failed GET keep text, block repeat until explicit fresh 200/null", async () => {
    let writes = 0;
    let afterFailureReads = 0;
    let permitWrite = false;
    const fake = vi.fn((_path: string, init?: RequestInit) => {
      if (init?.method === "PUT") return Promise.resolve(++writes === 1
        ? response(null, 503) : response({ ...payload, question: "Сохраняемый вопрос" }));
      if (writes === 1 && !permitWrite) {
        afterFailureReads++;
        return Promise.resolve(afterFailureReads === 1 ? response(null, 503)
          : response(null, 503));
      }
      return Promise.resolve(writes >= 2 ? response({ ...payload, question: "Сохраняемый вопрос" })
        : response(null));
    });
    const ui = await mount(fake);
    try {
      await fillRequiredPoll(ui);
      await ui.click("Сохранить опрос");
      expect(writes).toBe(1);
      expect(ui.host.querySelector<HTMLInputElement>("#moment-poll-question")?.value)
        .toBe("Сохраняемый вопрос");
      expect(ui.host.textContent).toContain("Проверить наличие опроса");
      expect(ui.host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled)
        .toBe(true);
      await ui.click("Проверить наличие опроса");
      expect(writes).toBe(1);
      expect(ui.host.querySelector<HTMLInputElement>("#moment-poll-question")?.value)
        .toBe("Сохраняемый вопрос");
      permitWrite = true;
      await ui.click("Проверить наличие опроса");
      expect(ui.host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled)
        .toBe(false);
      await ui.click("Сохранить опрос");
      expect(writes).toBe(2);
      expect(pollWrites(fake).map(call => JSON.parse(String(call[1]?.body)).expectedVersion))
        .toEqual([1, 1]);
      expect(ui.host.textContent).toContain("Опрос уже сохранён");
    } finally { await ui.cleanup(); }
  });

  it("ambiguous PUT with already-saved poll auto-GET closes editor; no second PUT", async () => {
    let writes = 0;
    const fake = vi.fn((_path: string, init?: RequestInit) => Promise.resolve(
      init?.method === "PUT" ? (++writes, response(null, 503))
        : writes ? response({ ...payload, question: "Сохраняемый вопрос" })
          : response(null),
    ));
    const ui = await mount(fake);
    try {
      await fillRequiredPoll(ui);
      await ui.click("Сохранить опрос");
      expect(writes).toBe(1);
      expect(ui.host.textContent).toContain("Опрос уже сохранён");
      expect(ui.host.querySelector("form")).toBeNull();
      expect(ui.changes).toEqual([true, false]);
    } finally { await ui.cleanup(); }
  });

  it("retired old owner/post ACK never calls new parent's callback or erases new poll text", async () => {
    const held = deferredSave();
    let persistedOld = false;
    const fake = vi.fn((path: string, init?: RequestInit) => {
      const old = path.includes("post-1");
      if (init?.method === "PUT") return old ? held.promise :
        Promise.resolve(response({ ...payload, id: "poll-2", postId: "post-2" }));
      return Promise.resolve(old && persistedOld
        ? response({ ...payload, question: "Сохраняемый вопрос" }) : response(null));
    });
    const ui = await mount(fake);
    const newChanges: boolean[] = [];
    try {
      await fillRequiredPoll(ui);
      await ui.click("Сохранить опрос");
      expect(pollWrites(fake)).toHaveLength(1);
      await ui.rerender("viewer-2", "post-2", 3, changed => newChanges.push(changed));
      await fillRequiredPoll(ui);
      await ui.fill("moment-poll-question", "Чужой новый черновик");
      const beforeOldAck = [...newChanges];
      await act(async () => {
        persistedOld = true;
        held.resolve(response({ ...payload, question: "Сохраняемый вопрос" }));
      });
      await act(async () => { await new Promise(done => setTimeout(done, 30)); });
      expect(newChanges).toEqual(beforeOldAck);
      expect(ui.host.querySelector<HTMLInputElement>("#moment-poll-question")?.value)
        .toBe("Чужой новый черновик");
      expect(ui.host.querySelector("form")).not.toBeNull();
      expect(pollWrites(fake)).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("automatic transient GET 404 after lost ACK never authorizes recreate; explicit GET finds saved poll", async () => {
    let writes = 0;
    let rereads = 0;
    const saved = { ...payload, question: "Сохраняемый вопрос" };
    const fake = vi.fn((_path: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        writes++;
        return Promise.resolve(response(null, 503));
      }
      if (!writes) return Promise.resolve(response(null));
      // The first automatic reconciliation is an eventually consistent 404;
      // the user's explicit later GET discovers the already stored poll.
      return Promise.resolve(++rereads === 1 ? response(null, 404) : response(saved));
    });
    const ui = await mount(fake);
    try {
      await fillRequiredPoll(ui);
      await ui.click("Сохранить опрос");
      expect(writes).toBe(1);
      expect(ui.host.querySelector<HTMLInputElement>("#moment-poll-question")?.value)
        .toBe("Сохраняемый вопрос");
      expect(ui.host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled)
        .toBe(true);
      expect(ui.host.textContent).toContain("Проверить наличие опроса");
      await ui.click("Проверить наличие опроса");
      expect(writes).toBe(1);
      expect(ui.host.textContent).toContain("Опрос уже сохранён");
      expect(ui.host.querySelector("form")).toBeNull();
      expect(ui.changes).toEqual([true, false]);
    } finally { await ui.cleanup(); }
  });

  it.each([401, 403])("uncertain PUT and subsequent GET %s deny another PUT without erasing draft", async status => {
    let writes = 0;
    let afterPutReads = 0;
    const fake = vi.fn((_path: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        writes++;
        return Promise.resolve(response(null, 503));
      }
      if (!writes) return Promise.resolve(response(null));
      afterPutReads++;
      return Promise.resolve(afterPutReads === 1 ? response(null, 503)
        : response(null, status));
    });
    const ui = await mount(fake);
    try {
      await fillRequiredPoll(ui);
      await ui.click("Сохранить опрос");
      expect(writes).toBe(1);
      await ui.click("Проверить наличие опроса");
      expect(ui.host.querySelector<HTMLInputElement>("#moment-poll-question")?.value)
        .toBe("Сохраняемый вопрос");
      expect(ui.host.textContent).toContain("Не удалось проверить существующий опрос");
      expect(ui.host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled)
        .toBe(true);
      await act(async () => ui.host.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ));
      expect(writes).toBe(1);
      expect(ui.host.textContent).toContain("Проверить наличие опроса");
    } finally { await ui.cleanup(); }
  });

  it("same owner/post version refresh preserves unsaved draft, next submit carries current CAS", async () => {
    const fake = vi.fn((_path: string, init?: RequestInit) => Promise.resolve(
      init?.method === "PUT" ? response({ ...payload, question: "Не сбрасывать текст" })
        : response(null),
    ));
    const ui = await mount(fake);
    try {
      await fillRequiredPoll(ui);
      await ui.fill("moment-poll-question", "Не сбрасывать текст");
      await ui.rerender("viewer", "post-1", 7, changed => ui.changes.push(changed));
      expect(ui.host.querySelector<HTMLInputElement>("#moment-poll-question")?.value)
        .toBe("Не сбрасывать текст");
      await ui.click("Сохранить опрос");
      expect(JSON.parse(String(pollWrites(fake)[0][1]?.body)).expectedVersion).toBe(7);
    } finally { await ui.cleanup(); }
  });
});
