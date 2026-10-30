// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionOwnerControls } from "./QuestionOwnerControls";
import { installQuestionPhotoV2Browser, photoV2Reservation,
  photoV2Confirmation } from "./questionPhotoV2.test-helper";
import type { QuestionOverview } from "./questionApi";

const question: QuestionOverview = {
  id: "question-A", title: "Изначальная тема", body: "Описание",
  category: "Поведение", status: "waiting", answerCount: 0,
  createdAt: "2026-10-16T00:00:00.000Z", authorName: "Автор",
  authorAvatarUrl: null, viewCount: 0,
  preview: "Описание", tags: ["щенок"], photoIds: ["photo-1"],
  closed: false, canReply: true, canManage: true, canEdit: true,
  blockReason: null, nextAnswerPage: null, answers: [],
};
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200, data, error: "Server error",
  }), { status });
}
async function render(
  fetcher: ReturnType<typeof vi.fn>, overrides: Partial<QuestionOverview> = {},
) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/questions/question-A");
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rerender = async (userId: string, questionId: string,
    nextQuestion: QuestionOverview, callbacks: {
      onFinished?: () => void; onCancel?: () => void;
      initialEditing?: boolean; showDelete?: boolean;
    } = {}) => {
    await act(async () => root.render(createElement(
      QueryClientProvider, { client: cache },
      createElement(QuestionOwnerControls, {
        userId, questionId, question: nextQuestion, ...callbacks,
      }),
    )));
  };
  await rerender("user-1", "question-A", { ...question, ...overrides });
  return {
    container, cache, rerender,
    async click(label: string) {
      const btn = Array.from(container.querySelectorAll("button"))
        .find(b => b.textContent?.includes(label));
      expect(btn).toBeDefined();
      await act(async () => btn?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    },
    async input(selector: string, value: string) {
      const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      const type = element.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(type, "value")!.set!;
      await act(async () => {
        setter.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    async submit() {
      await act(async () => container.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    },
    async cleanup() {
      await act(async () => root.unmount()); cache.clear(); container.remove();
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("question owner changes", () => {
  it("keeps original tags and photos during text-only PATCH", async () => {
    const fake = vi.fn().mockImplementation(() => Promise.resolve(response({ id: "question-A" })));
    const screen = await render(fake);
    try {
      expect(screen.container.querySelector('button[data-gafus-shared-button="purple"]')
        ?.textContent).toBe("Редактировать вопрос");
      await screen.click("Редактировать вопрос");
      const editor = screen.container.querySelector<HTMLFormElement>(
        'form[aria-label="Редактирование вопроса"]',
      );
      expect(editor?.classList.contains("web4-question-edit-form")).toBe(true);
      expect(editor?.querySelector(".web4-question-edit-heading h2")?.textContent)
        .toBe("Редактирование вопроса");
      const actions = editor?.querySelector(".web4-question-edit-actions");
      expect(actions?.querySelectorAll("button")).toHaveLength(2);
      expect(actions?.querySelector('button[data-gafus-shared-button="primary"]'))
        .not.toBeNull();
      expect(actions?.querySelector('button[data-gafus-variant="red"]')).not.toBeNull();
      const attachmentGroup = editor?.querySelector('fieldset[aria-label="Сохранённые фотографии вопроса"]');
      expect(attachmentGroup).not.toBeNull();
      expect(attachmentGroup?.querySelector(".question-photo-picker-next")).not.toBeNull();
      expect(attachmentGroup?.querySelector("button[aria-controls]")?.textContent)
        .toContain("Добавить фото");
      await screen.input('[id^="question-edit-title-"]', "Новая тема");
      await screen.input('[id^="question-edit-body-"]', "Уточнённое описание");
      await screen.submit();
      expect(fake).toHaveBeenCalledTimes(1);
      const [path, init] = fake.mock.calls[0];
      expect(path).toBe("/api/v1/questions/question-A");
      expect(init.method).toBe("PATCH");
      expect(JSON.parse(init.body)).toEqual({
        title: "Новая тема", body: "Уточнённое описание",
        category: "Поведение", tags: ["щенок"], photoIds: ["photo-1"],
      });
      expect(screen.container.querySelector("textarea")).toBeNull();
    } finally { await screen.cleanup(); }
  });

  it("stages old photo removal only in the acknowledged owner PATCH, never direct S3/DELETE", async () => {
    const fake = vi.fn(async (_path: string, _init?: RequestInit) => response({ id: "question-A" }));
    const ui = await render(fake, { photoIds: ["photo-1", "photo-2"] });
    try {
      await ui.click("Редактировать вопрос");
      expect(ui.container.textContent).toContain("Отцепить фото 1");
      await ui.click("Отцепить фото 1");
      expect(fake).not.toHaveBeenCalled();
      expect(ui.container.textContent).toContain("только после сохранения");
      await ui.submit();
      expect(fake).toHaveBeenCalledTimes(1);
      expect(fake.mock.calls[0]?.[1]?.method).toBe("PATCH");
      expect(JSON.parse(String(fake.mock.calls[0]?.[1]?.body)).photoIds).toEqual(["photo-2"]);
    } finally { await ui.cleanup(); }
  });

  it("uploads own new photo and PATCH rebinds both existing and new IDs only on save", async () => {
    const fake = vi.fn(async (path: string, init?: RequestInit) =>
      path === "/api/v1/questions/photos/reservations" && init?.method === "POST"
        ? photoV2Reservation("photo-2")
        : path === "/api/v1/questions/photos/photo-2/confirm"
          ? photoV2Confirmation("photo-2") : response({ id: "question-A" }));
    const direct = installQuestionPhotoV2Browser("blob:question-edit-photo");
    const ui = await render(fake);
    try {
      await ui.click("Редактировать вопрос");
      const input = ui.container.querySelector<HTMLInputElement>('input[type="file"]')!;
      const testFile = new File([new Uint8Array([255, 216, 255])], "only-own.jpg",
        { type: "image/jpeg" });
      Object.defineProperty(input, "files", { configurable: true, value: [testFile] });
      await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      // One authenticated reservation POST and one authenticated confirmation
      // POST; the photo bytes themselves went directly to S3 via XHR.
      expect(fake.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
      expect(ui.container.textContent).toContain("2 из 5");
      expect(direct).toHaveLength(1);
      expect(direct[0]?.withCredentials).toBe(false);
      expect(fake.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
      await ui.submit();
      const patch = fake.mock.calls.filter(([, init]) => init?.method === "PATCH");
      expect(patch).toHaveLength(1);
      expect(JSON.parse(String(patch[0]?.[1]?.body)).photoIds).toEqual(["photo-1", "photo-2"]);
    } finally { await ui.cleanup(); }
  });

  it("cannot PATCH an incomplete photo list during same-turn in-flight upload", async () => {
    let completeUpload!: (response: Response) => void;
    const upload = new Promise<Response>(resolve => { completeUpload = resolve; });
    const fake = vi.fn((path: string, init?: RequestInit) =>
      path === "/api/v1/questions/photos/reservations" && init?.method === "POST"
        ? upload : Promise.resolve(path === "/api/v1/questions/photos/photo-2/confirm"
          ? photoV2Confirmation("photo-2") : response({ id: "question-A" })));
    installQuestionPhotoV2Browser("blob:edit-upload-inflight");
    const ui = await render(fake);
    try {
      await ui.click("Редактировать вопрос");
      const input = ui.container.querySelector<HTMLInputElement>('input[type="file"]')!;
      const file = new File([new Uint8Array([255, 216, 255])], "inflight.jpg",
        { type: "image/jpeg" });
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      const form = ui.container.querySelector("form")!;
      await act(async () => {
        input.dispatchEvent(new Event("change", { bubbles: true }));
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await Promise.resolve();
      });
      expect(fake.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
      expect(fake.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
      await act(async () => { completeUpload(photoV2Reservation("photo-2"));
        await new Promise(done => setTimeout(done, 20)); });
      await ui.submit();
      const patches = fake.mock.calls.filter(([, init]) => init?.method === "PATCH");
      expect(patches).toHaveLength(1);
      expect(JSON.parse(String(patches[0]?.[1]?.body)).photoIds)
        .toEqual(["photo-1", "photo-2"]);
    } finally { await ui.cleanup(); }
  });

  it("cancelled photo detachment preserves both server bound IDs without mutation", async () => {
    const fake = vi.fn();
    const ui = await render(fake, { photoIds: ["photo-1", "photo-2"] });
    try {
      await ui.click("Редактировать вопрос");
      await ui.click("Отцепить фото 2");
      expect(fake).not.toHaveBeenCalled();
      await ui.click("Отмена");
      expect(fake).not.toHaveBeenCalled();
      await ui.click("Редактировать вопрос");
      expect(ui.container.textContent).toContain("Отцепить фото 2");
      expect(ui.container.textContent).not.toContain("только после сохранения");
    } finally { await ui.cleanup(); }
  });

  it("rejected edit keeps uncommitted photo detachment staged for correction", async () => {
    const fake = vi.fn(async (_path: string, _init?: RequestInit) => response(null, 403));
    const ui = await render(fake, { photoIds: ["photo-1", "photo-2"] });
    try {
      await ui.click("Редактировать вопрос");
      await ui.click("Отцепить фото 1");
      await ui.submit();
      expect(fake).toHaveBeenCalledTimes(1);
      expect(ui.container.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось изменить");
      expect(ui.container.textContent).toContain("Отцепить фото 1");
      expect(JSON.parse(String(fake.mock.calls[0]?.[1]?.body)).photoIds).toEqual(["photo-2"]);
      expect(fake.mock.calls[0]?.[1]?.method).toBe("PATCH");
    } finally { await ui.cleanup(); }
  });

  it("changes tags from Next editor while preserving existing photo ownership", async () => {
    const fake = vi.fn().mockImplementation(() => Promise.resolve(response({ id: "question-A" })));
    const screen = await render(fake);
    try {
      await screen.click("Редактировать вопрос");
      const tags = screen.container.querySelector<HTMLInputElement>(
        '[id^="question-edit-tags-"]',
      );
      expect(tags?.value).toBe("щенок");
      await screen.input('[id^="question-edit-tags-"]', "#поводок, собака, #поводок");
      await screen.submit();
      expect(fake).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(fake.mock.calls[0][1].body))).toMatchObject({
        tags: ["поводок", "собака", "поводок"], photoIds: ["photo-1"],
      });
    } finally { await screen.cleanup(); }
  });

  it("rejects too many or oversized tags before sending PATCH", async () => {
    const fake = vi.fn();
    const screen = await render(fake);
    try {
      await screen.click("Редактировать вопрос");
      await screen.input('[id^="question-edit-tags-"]', "1,2,3,4,5,6");
      await screen.submit();
      expect(fake).not.toHaveBeenCalled();
      expect(screen.container.querySelector('[role="alert"]')?.textContent)
        .toContain("До 5 тегов");
      await screen.input('[id^="question-edit-tags-"]', "x".repeat(33));
      await screen.submit();
      expect(fake).not.toHaveBeenCalled();
      expect(screen.container.querySelector('[role="alert"]')?.textContent)
        .toContain("32 символов");
    } finally { await screen.cleanup(); }
  });

  it("failed edit preserves form content for corrections", async () => {
    const fake = vi.fn().mockImplementation(() => Promise.resolve(response(null, 503)));
    const screen = await render(fake);
    try {
      await screen.click("Редактировать вопрос");
      await screen.input('[id^="question-edit-body-"]', "Новая попытка");
      await screen.submit();
      expect(screen.container.querySelector<HTMLTextAreaElement>(
        '[id^="question-edit-body-"]',
      )?.value).toBe("Новая попытка");
      expect(screen.container.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось изменить");
      expect(JSON.parse(fake.mock.calls[0][1].body).photoIds)
        .toEqual(["photo-1"]);
    } finally { await screen.cleanup(); }
  });

  it("distinguishes owner editing from admin management permission", async () => {
    const fake = vi.fn();
    const screen = await render(fake, { canEdit: false, canManage: true });
    try {
      expect(screen.container.textContent).not.toContain("Редактировать вопрос");
      expect(screen.container.textContent).toContain("Удалить вопрос");
      expect(fake).not.toHaveBeenCalled();
    } finally { await screen.cleanup(); }
  });

  it("DELETE requires in-page confirmation and only redirects after ACK", async () => {
    const nativeConfirm = vi.fn(() => { throw Error("NATIVE_DIALOG_UNEXPECTED"); });
    vi.stubGlobal("confirm", nativeConfirm);
    const fake = vi.fn().mockImplementation(() => Promise.resolve(response({ id: "question-A" })));
    const screen = await render(fake);
    try {
      await screen.click("Удалить вопрос");
      const confirm = screen.container.querySelector<HTMLElement>(
        '[role="group"][aria-label="Подтверждение удаления вопроса"]',
      );
      expect(confirm).not.toBeNull();
      expect(confirm?.classList.contains("web4-question-delete-confirm")).toBe(true);
      expect(confirm?.querySelector("h3")?.textContent).toBe("Удалить вопрос?");
      const danger = confirm?.querySelector(".web4-question-delete-actions");
      expect(danger?.querySelectorAll("button")).toHaveLength(2);
      expect(danger?.querySelectorAll('button[data-gafus-variant="red"]')).toHaveLength(1);
      expect(danger?.textContent).toContain("Не удалять");
      expect(document.activeElement?.textContent).toBe("Да, удалить вопрос");
      expect(fake).not.toHaveBeenCalled();
      expect(window.location.pathname).toBe("/questions/question-A");
      await screen.click("Не удалять");
      expect(document.activeElement?.textContent).toBe("Удалить вопрос");
      expect(fake).not.toHaveBeenCalled();
      expect(screen.container.querySelector('[role="group"][aria-label="Подтверждение удаления вопроса"]'))
        .toBeNull();
      await screen.click("Удалить вопрос");
      await screen.click("Да, удалить вопрос");
      expect(fake).toHaveBeenCalledTimes(1);
      expect(fake.mock.calls[0][1].method).toBe("DELETE");
      expect(window.location.pathname).toBe("/questions");
      expect(nativeConfirm).not.toHaveBeenCalled();
    } finally { await screen.cleanup(); }
  });

  it("failed DELETE cannot navigate or optimistically remove question", async () => {
    const fake = vi.fn().mockImplementation(() => Promise.resolve(response(null, 403)));
    const screen = await render(fake);
    try {
      await screen.click("Удалить вопрос");
      expect(fake).not.toHaveBeenCalled();
      await screen.click("Да, удалить вопрос");
      expect(window.location.pathname).toBe("/questions/question-A");
      expect(screen.container.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось удалить");
    } finally { await screen.cleanup(); }
  });
});


// QA031_OWNER_EDIT_DELETE_FLIGHT: existing mounted owner controls, no real HTTP.
function unresolvedWrite() {
  let resolve!: (reply: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
const actions = (fetcher: ReturnType<typeof vi.fn>, method: string) =>
  fetcher.mock.calls.filter(call => (call[1] as RequestInit | undefined)?.method === method);
async function sameTurnSubmit(container: HTMLElement) {
  const form = container.querySelector("form");
  expect(form).not.toBeNull();
  await act(async () => {
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}
function clickNow(container: HTMLElement, name: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find(item => item.textContent?.trim() === name);
  if (!button) throw Error("Missing button: " + name);
  button.click();
}

describe("QA031_OWNER_EDIT_DELETE_FLIGHT current owner lifecycle", () => {
  it("same-turn double edit sends exactly one PATCH with original media and tags", async () => {
    const pending = unresolvedWrite();
    const fake = vi.fn(() => pending.promise);
    const ui = await render(fake);
    try {
      await ui.click("Редактировать вопрос");
      await ui.input('[id^="question-edit-title-"]', "Новое название");
      await ui.input('[id^="question-edit-body-"]', "Обновлённое содержание");
      await sameTurnSubmit(ui.container);
      expect(actions(fake, "PATCH")).toHaveLength(1);
      expect(JSON.parse(String(actions(fake, "PATCH")[0][1]?.body))).toEqual({
        title: "Новое название", body: "Обновлённое содержание",
        category: "Поведение", tags: ["щенок"], photoIds: ["photo-1"],
      });
      await act(async () => pending.resolve(response({ id: "question-A" })));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(ui.container.querySelector("form")).toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("same-turn two deletes and cross-kind edit-then-delete cannot compete", async () => {
    const pending = unresolvedWrite();
    const fake = vi.fn(() => pending.promise);
    const ui = await render(fake);
    try {
      await act(async () => { clickNow(ui.container, "Удалить вопрос");
        clickNow(ui.container, "Удалить вопрос"); await Promise.resolve(); });
      expect(actions(fake, "DELETE")).toHaveLength(0);
      expect(ui.container.querySelector('[aria-label="Подтверждение удаления вопроса"]'))
        .not.toBeNull();
      await act(async () => { clickNow(ui.container, "Да, удалить вопрос");
        clickNow(ui.container, "Да, удалить вопрос"); await Promise.resolve(); });
      expect(actions(fake, "DELETE")).toHaveLength(1);
      await act(async () => pending.resolve(response({ id: "question-A" })));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
    } finally { await ui.cleanup(); }
    const held = unresolvedWrite();
    const nextFetch = vi.fn(() => held.promise);
    const next = await render(nextFetch);
    try {
      await next.click("Редактировать вопрос");
      await act(async () => {
        next.container.querySelector("form")?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }));
        clickNow(next.container, "Удалить вопрос");
        await Promise.resolve();
      });
      expect(actions(nextFetch, "PATCH")).toHaveLength(1);
      expect(actions(nextFetch, "DELETE")).toHaveLength(0);
      expect(actions(nextFetch, "DELETE")).toHaveLength(0);
      await act(async () => held.resolve(response({ id: "question-A" })));
    } finally { await next.cleanup(); }
  });

  it("question/user switch resets dirty editable text and category, retired PATCH cannot finish new editor", async () => {
    const old = unresolvedWrite();
    const recent = unresolvedWrite();
    const fake = vi.fn((path: string) => path.endsWith("question-A")
      ? old.promise : recent.promise);
    const ui = await render(fake);
    const finishedA = vi.fn();
    const finishedB = vi.fn();
    const invalidate = vi.spyOn(ui.cache, "invalidateQueries");
    try {
      await ui.rerender("user-1", "question-A", question, { onFinished: finishedA });
      await ui.click("Редактировать вопрос");
      await ui.input('[id^="question-edit-title-"]', "Черновик старой темы");
      await ui.submit();
      expect(actions(fake, "PATCH")).toHaveLength(1);
      window.history.replaceState(null, "", "/questions/question-B");
      await ui.rerender("user-2", "question-B", {
        ...question, id: "question-B", title: "Вторая тема", body: "Второе описание",
        category: "Здоровье", tags: ["кошка"], photoIds: ["photo-2"],
      }, { onFinished: finishedB, initialEditing: true });
      expect(ui.container.querySelector<HTMLInputElement>('[id^="question-edit-title-"]')?.value)
        .toBe("Вторая тема");
      expect(ui.container.querySelector<HTMLTextAreaElement>('[id^="question-edit-body-"]')?.value)
        .toBe("Второе описание");
      expect(ui.container.querySelector<HTMLSelectElement>('[id^="question-edit-category-"]')?.value)
        .toBe("Здоровье");
      await ui.input('[id^="question-edit-title-"]', "Вторая обновлена");
      await ui.submit();
      expect(actions(fake, "PATCH")).toHaveLength(2);
      await act(async () => old.resolve(response({ id: "question-A" })));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(finishedA).not.toHaveBeenCalled();
      expect(finishedB).not.toHaveBeenCalled();
      expect(ui.container.querySelector<HTMLInputElement>('[id^="question-edit-title-"]')?.value)
        .toBe("Вторая обновлена");
      expect(invalidate).not.toHaveBeenCalledWith({
        queryKey: ["questions", "detail", "user-2", "question-B"],
      });
      await act(async () => recent.resolve(response({ id: "question-B" })));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(finishedB).toHaveBeenCalledTimes(1);
    } finally { await ui.cleanup(); }
  });

  it("retired DELETE ACK never navigates current question route, current owner remains operable", async () => {
    const old = unresolvedWrite();
    const next = unresolvedWrite();
    const fake = vi.fn((path: string) => path.endsWith("question-A")
      ? old.promise : next.promise);
    const ui = await render(fake);
    const currentFinished = vi.fn();
    try {
      await ui.click("Удалить вопрос");
      expect(actions(fake, "DELETE")).toHaveLength(0);
      await act(async () => { clickNow(ui.container, "Да, удалить вопрос");
        await Promise.resolve(); });
      expect(actions(fake, "DELETE")).toHaveLength(1);
      window.history.replaceState(null, "", "/questions/question-B");
      await ui.rerender("user-2", "question-B", {
        ...question, id: "question-B", title: "Новый вопрос", body: "Новый текст",
      }, { onFinished: currentFinished });
      expect(ui.container.textContent).toContain("Редактировать вопрос");
      await act(async () => old.resolve(response({ id: "question-A" })));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(window.location.pathname).toBe("/questions/question-B");
      expect(currentFinished).not.toHaveBeenCalled();
      await ui.click("Удалить вопрос");
      await act(async () => { clickNow(ui.container, "Да, удалить вопрос");
        await Promise.resolve(); });
      expect(actions(fake, "DELETE")).toHaveLength(2);
      await act(async () => next.resolve(response({ id: "question-B" })));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(window.location.pathname).toBe("/questions");
    } finally { await ui.cleanup(); }
  });

  it("new question retains initialEditing, showDelete and onCancel without a write", async () => {
    const cancelled = vi.fn();
    const fake = vi.fn();
    const ui = await render(fake);
    try {
      await ui.rerender("user-2", "question-B", {
        ...question, id: "question-B", title: "Новый вопрос", canManage: false,
      }, { initialEditing: true, showDelete: false, onCancel: cancelled });
      expect(ui.container.querySelector<HTMLInputElement>('[id^="question-edit-title-"]')?.value)
        .toBe("Новый вопрос");
      expect(ui.container.textContent).not.toContain("Удалить вопрос");
      await ui.click("Отмена");
      expect(cancelled).toHaveBeenCalledTimes(1);
      expect(ui.container.querySelector("form")).toBeNull();
      expect(fake).not.toHaveBeenCalled();
    } finally { await ui.cleanup(); }
  });

  it("failed PATCH preserves title/body/category, requires new explicit submit, no auto replay", async () => {
    let attempts = 0;
    const fake = vi.fn(() => {
      attempts++;
      return Promise.resolve(attempts === 1
        ? response(null, 503) : response({ id: "question-A" }));
    });
    const ui = await render(fake);
    try {
      await ui.click("Редактировать вопрос");
      await ui.input('[id^="question-edit-title-"]', "Неотправленное название");
      await ui.input('[id^="question-edit-body-"]', "Неотправленный текст");
      await ui.submit();
      expect(attempts).toBe(1);
      expect(ui.container.querySelector<HTMLInputElement>('[id^="question-edit-title-"]')?.value)
        .toBe("Неотправленное название");
      expect(ui.container.querySelector<HTMLTextAreaElement>('[id^="question-edit-body-"]')?.value)
        .toBe("Неотправленный текст");
      expect(ui.container.textContent).toContain("Не удалось изменить вопрос");
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(attempts).toBe(1);
      await ui.submit();
      expect(attempts).toBe(2);
    } finally { await ui.cleanup(); }
  });
});

// WEB005_OWNER_KEYBOARD_EDITOR: real existing inline + route-sized forms, mounted.
function ownerForm(host: HTMLElement) {
  const form = host.querySelector<HTMLFormElement>('form[aria-label="Редактирование вопроса"]');
  if (!form) throw Error("Editable question form not found");
  return form;
}
function labelled<T extends HTMLElement>(form: HTMLFormElement, text: string): T {
  const label = [...form.querySelectorAll<HTMLLabelElement>("label")]
    .find(item => item.textContent?.trim() === text);
  if (!label || !(label.control instanceof HTMLElement))
    throw Error("Unlinked control for question field: " + text);
  return label.control as T;
}

describe("WEB005_OWNER_KEYBOARD_EDITOR real inline and route editing lifecycle", () => {
  it("two mounted inline editors have distinct labelled controls, named forms and initial title focus", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
        createElement("div", {},
          createElement(QuestionOwnerControls, { userId: "user-1", questionId: "question-A", question }),
          createElement(QuestionOwnerControls, { userId: "user-1", questionId: "question-B",
            question: { ...question, id: "question-B", title: "Второй вопрос" } }),
        ),
      )));
      const triggers = [...host.querySelectorAll<HTMLButtonElement>("button")]
        .filter(button => button.textContent?.trim() === "Редактировать вопрос");
      expect(triggers).toHaveLength(2);
      triggers[0].focus();
      await act(async () => triggers[0].click());
      const first = ownerForm(host);
      expect(first.getAttribute("aria-label")).toBe("Редактирование вопроса");
      expect(document.activeElement).toBe(labelled<HTMLInputElement>(first, "Заголовок"));
      await act(async () => triggers[1].click());
      const forms = [...host.querySelectorAll<HTMLFormElement>(
        'form[aria-label="Редактирование вопроса"]')];
      expect(forms).toHaveLength(2);
      const ids = forms.flatMap(form => ["Заголовок", "Описание", "Категория"]
        .map(text => labelled(form, text).id));
      expect(new Set(ids).size).toBe(6);
      for (const form of forms) {
        for (const name of ["Заголовок", "Описание", "Категория"])
          expect([...form.querySelectorAll<HTMLElement>("input,textarea,select")]
            .find(node => node.id === labelled(form, name).id))
            .toBe(labelled(form, name));
      }
      expect(document.activeElement).toBe(labelled<HTMLInputElement>(forms[1], "Заголовок"));
    } finally {
      await act(async () => root.unmount()); cache.clear(); host.remove();
    }
  });

  it("inline Cancel and successful PATCH return focus to its connected edit trigger", async () => {
    const fake = vi.fn().mockResolvedValue(response({ id: "question-A" }));
    const ui = await render(fake);
    try {
      const trigger = [...ui.container.querySelectorAll<HTMLButtonElement>("button")]
        .find(node => node.textContent?.trim() === "Редактировать вопрос")!;
      trigger.focus();
      await ui.click("Редактировать вопрос");
      const form = ownerForm(ui.container);
      const title = labelled<HTMLInputElement>(form, "Заголовок");
      expect(document.activeElement).toBe(title);
      expect(trigger.isConnected).toBe(true);
      title.focus();
      await ui.click("Отмена");
      expect(ui.container.querySelector("form")).toBeNull();
      expect(document.activeElement).toBe(trigger);
      await ui.click("Редактировать вопрос");
      expect(document.activeElement).toBe(labelled<HTMLInputElement>(ownerForm(ui.container), "Заголовок"));
      await ui.submit();
      expect(ui.container.querySelector("form")).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(fake).toHaveBeenCalledTimes(1);
    } finally { await ui.cleanup(); }
  });

  it("route initialEditing autofocuses title but cancel/finished teardown never steals external focus", async () => {
    const pending = unresolvedWrite();
    const fake = vi.fn(() => pending.promise);
    const ui = await render(fake);
    const finished = vi.fn();
    const cancelled = vi.fn();
    const outside = document.createElement("button");
    document.body.append(outside);
    try {
      await ui.rerender("user-2", "question-B", {
        ...question, id: "question-B", title: "Маршрут редактирования",
      }, { initialEditing: true, showDelete: false, onFinished: finished, onCancel: cancelled });
      const title = labelled<HTMLInputElement>(ownerForm(ui.container), "Заголовок");
      expect(document.activeElement).toBe(title);
      outside.focus();
      await ui.click("Отмена");
      expect(cancelled).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(outside);
      await ui.rerender("user-3", "question-C", {
        ...question, id: "question-C", title: "Другая страница",
      }, { initialEditing: true, showDelete: false, onFinished: finished });
      expect(document.activeElement).toBe(labelled<HTMLInputElement>(ownerForm(ui.container), "Заголовок"));
      outside.focus();
      await ui.submit();
      await act(async () => pending.resolve(response({ id: "question-C" })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      expect(finished).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(outside);
    } finally { outside.remove(); await ui.cleanup(); }
  });

  it("failed edit keeps title/body/category, alert linkage and focused field; busy cancel cannot close", async () => {
    const pending = unresolvedWrite();
    const fake = vi.fn(() => pending.promise);
    const ui = await render(fake);
    try {
      await ui.click("Редактировать вопрос");
      const form = ownerForm(ui.container);
      const title = labelled<HTMLInputElement>(form, "Заголовок");
      title.focus();
      await ui.input('[id^="question-edit-title-"]', "Несохранённый заголовок");
      await ui.input('[id^="question-edit-body-"]', "Несохранённый текст");
      const category = labelled<HTMLSelectElement>(form, "Категория");
      category.value = "Здоровье";
      await act(async () => category.dispatchEvent(new Event("change", { bubbles: true })));
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        const cancel = [...form.querySelectorAll<HTMLButtonElement>("button")]
          .find(node => node.textContent?.trim() === "Отмена");
        cancel?.click();
        await Promise.resolve();
      });
      expect(ui.container.querySelector("form")).toBe(form);
      expect(fake).toHaveBeenCalledTimes(1);
      await act(async () => pending.resolve(response(null, 503)));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      expect(labelled<HTMLInputElement>(form, "Заголовок").value)
        .toBe("Несохранённый заголовок");
      expect(labelled<HTMLTextAreaElement>(form, "Описание").value)
        .toBe("Несохранённый текст");
      expect(labelled<HTMLSelectElement>(form, "Категория").value).toBe("Здоровье");
      const alert = ui.container.querySelector<HTMLElement>('[role="alert"]');
      expect(alert?.id).toBeTruthy();
      expect(form.getAttribute("aria-describedby")).toBe(alert?.id);
      expect(document.activeElement).toBe(title);
      expect(fake).toHaveBeenCalledTimes(1);
    } finally { await ui.cleanup(); }
  });
});
