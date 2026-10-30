// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnswerOwnerControls } from "./AnswerOwnerControls";
import { installQuestionPhotoV2Browser, photoV2Reservation,
  photoV2Confirmation } from "./questionPhotoV2.test-helper";
import type { QuestionAnswerCard } from "./questionApi";

const base: QuestionAnswerCard = {
  id: "answer-1", body: "Исходный ответ", authorName: "Автор", canHeart: false,
  best: false, deleted: false, hidden: false, liked: false, hearts: 0,
  parentId: null, replyToName: null, replyCount: 0, canEdit: true, canDelete: true,
  photoIds: ["photo-1", "photo-2"],
};
function api(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200, data, error: "Server error",
  }), { status });
}
async function mount(fetcher: ReturnType<typeof vi.fn>,
  overrides: Partial<QuestionAnswerCard> = {}) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rerender = async (userId: string, questionId: string, answer: QuestionAnswerCard) => {
    await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
      createElement(AnswerOwnerControls, { userId, questionId, answer }))));
  };
  await rerender("viewer-1", "question-A", { ...base, ...overrides });
  return {
    host, cache, rerender,
    async click(label: string) {
      const button = Array.from(host.querySelectorAll("button"))
        .find(b => b.textContent?.includes(label));
      expect(button).toBeDefined();
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
    },
    async changeBody(value: string) {
      const element = host.querySelector<HTMLTextAreaElement>("textarea")!;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      await act(async () => {
        setter.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    async submit() {
      await act(async () => host.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
    },
    async cleanup() {
      await act(async () => root.unmount()); cache.clear(); host.remove();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("answer owner mutation controls", () => {
  it("edits text without detaching existing media and only after server ACK", async () => {
    const fake = vi.fn((_path: string, _options?: RequestInit) =>
      Promise.resolve(api({ id: "answer-1" })));
    const screen = await mount(fake);
    try {
      await screen.click("Редактировать ответ");
      await screen.changeBody("Исправленный ответ");
      await screen.submit();
      expect(fake).toHaveBeenCalledTimes(1);
      expect(fake.mock.calls[0][0]).toBe("/api/v1/questions/answers/answer-1");
      expect(fake.mock.calls[0]?.[1]?.method).toBe("PATCH");
      expect(JSON.parse(String(fake.mock.calls[0]?.[1]?.body))).toEqual({
        body: "Исправленный ответ", photoIds: ["photo-1", "photo-2"],
      });
      expect(screen.host.querySelector("textarea")).toBeNull();
    } finally { await screen.cleanup(); }
  });

  it("stages answer photo detachment until one authenticated PATCH, never standalone DELETE", async () => {
    const fake = vi.fn(async (_path: string, _init?: RequestInit) => api({ id: "answer-1" }));
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать ответ");
      await ui.click("Отцепить фото 1");
      expect(fake).not.toHaveBeenCalled();
      expect(ui.host.textContent).toContain("только после сохранения");
      await ui.submit();
      expect(fake).toHaveBeenCalledTimes(1);
      expect(fake.mock.calls[0]?.[1]?.method).toBe("PATCH");
      expect(JSON.parse(String(fake.mock.calls[0]?.[1]?.body)).photoIds).toEqual(["photo-2"]);
    } finally { await ui.cleanup(); }
  });

  it("cancelled answer photo detachment restores original attachments without a write", async () => {
    const fake = vi.fn();
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать ответ");
      await ui.click("Отцепить фото 2");
      expect(fake).not.toHaveBeenCalled();
      await ui.click("Отмена");
      await ui.click("Редактировать ответ");
      expect(ui.host.textContent).toContain("Отцепить фото 2");
      expect(ui.host.textContent).not.toContain("только после сохранения");
      expect(fake).not.toHaveBeenCalled();
    } finally { await ui.cleanup(); }
  });

  it("new uploaded answer photo joins retained originals only after PATCH", async () => {
    const fake = vi.fn(async (path: string, init?: RequestInit) =>
      path === "/api/v1/questions/photos/reservations" && init?.method === "POST"
        ? photoV2Reservation("photo-3")
        : path === "/api/v1/questions/photos/photo-3/confirm"
          ? photoV2Confirmation("photo-3") : api({ id: "answer-1" }));
    const direct = installQuestionPhotoV2Browser("blob:local-answer");
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать ответ");
      const input = ui.host.querySelector<HTMLInputElement>('input[type="file"]')!;
      const file = new File([new Uint8Array([255, 216, 255])], "only-own-answer.jpg",
        { type: "image/jpeg" });
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      // Hono creates the reservation then confirms the direct S3 upload.
      expect(fake.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(2);
      expect(ui.host.textContent).toContain("3 из 5");
      expect(direct).toHaveLength(1);
      expect(direct[0]?.withCredentials).toBe(false);
      expect(fake.mock.calls.filter(([, options]) => options?.method === "PATCH")).toHaveLength(0);
      await ui.submit();
      const patches = fake.mock.calls.filter(([, options]) => options?.method === "PATCH");
      expect(patches).toHaveLength(1);
      expect(JSON.parse(String(patches[0]?.[1]?.body)).photoIds)
        .toEqual(["photo-1", "photo-2", "photo-3"]);
    } finally { await ui.cleanup(); }
  });

  it("blocks answer PATCH before an in-flight same-turn photo upload completes", async () => {
    let completeUpload!: (reply: Response) => void;
    const upload = new Promise<Response>(resolve => { completeUpload = resolve; });
    const fake = vi.fn((path: string, init?: RequestInit) =>
      path === "/api/v1/questions/photos/reservations" && init?.method === "POST"
        ? upload : Promise.resolve(path === "/api/v1/questions/photos/photo-3/confirm"
          ? photoV2Confirmation("photo-3") : api({ id: "answer-1" })));
    installQuestionPhotoV2Browser("blob:answer-pending");
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать ответ");
      const input = ui.host.querySelector<HTMLInputElement>('input[type="file"]')!;
      const file = new File([new Uint8Array([255, 216, 255])], "answer-inflight.jpg",
        { type: "image/jpeg" });
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      const form = ui.host.querySelector("form")!;
      await act(async () => {
        input.dispatchEvent(new Event("change", { bubbles: true }));
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await Promise.resolve();
      });
      expect(fake.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
      expect(fake.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
      await act(async () => { completeUpload(photoV2Reservation("photo-3"));
        await new Promise(done => setTimeout(done, 20)); });
      await ui.submit();
      const patches = fake.mock.calls.filter(([, init]) => init?.method === "PATCH");
      expect(patches).toHaveLength(1);
      expect(JSON.parse(String(patches[0]?.[1]?.body)).photoIds)
        .toEqual(["photo-1", "photo-2", "photo-3"]);
    } finally { await ui.cleanup(); }
  });

  it("failed PATCH retains editable text and photos for retry", async () => {
    const fake = vi.fn().mockImplementation(() => Promise.resolve(api(null, 503)));
    const screen = await mount(fake);
    try {
      await screen.click("Редактировать ответ");
      await screen.changeBody("Не терять правки");
      await screen.submit();
      expect(screen.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Не терять правки");
      expect(screen.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось отредактировать");
      expect(JSON.parse(fake.mock.calls[0][1].body).photoIds)
        .toEqual(["photo-1", "photo-2"]);
      await screen.click("Отмена");
      expect(screen.host.querySelector("textarea")).toBeNull();
    } finally { await screen.cleanup(); }
  });

  it("does not call DELETE until user confirms; server errors remain visible", async () => {
    const nativeConfirm = vi.fn(() => { throw Error("NATIVE_DIALOG_UNEXPECTED"); });
    vi.stubGlobal("confirm", nativeConfirm);
    const fake = vi.fn().mockImplementation(() => Promise.resolve(api(null, 403)));
    const screen = await mount(fake);
    try {
      await screen.click("Удалить ответ");
      expect(screen.host.querySelector('[aria-label="Подтверждение удаления ответа"]'))
        .not.toBeNull();
      expect(document.activeElement?.textContent).toBe("Да, удалить ответ");
      expect(fake).not.toHaveBeenCalled();
      await screen.click("Не удалять ответ");
      expect(document.activeElement?.textContent).toBe("Удалить ответ");
      expect(fake).not.toHaveBeenCalled();
      expect(screen.host.querySelector('[aria-label="Подтверждение удаления ответа"]'))
        .toBeNull();
      await screen.click("Удалить ответ");
      await screen.click("Да, удалить ответ");
      expect(fake.mock.calls[0][1].method).toBe("DELETE");
      expect(screen.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось удалить");
      expect(nativeConfirm).not.toHaveBeenCalled();
    } finally { await screen.cleanup(); }
  });

  it("only exposes edit/delete buttons allowed by server-owned flags", async () => {
    const fake = vi.fn();
    const screen = await mount(fake, { canEdit: false, canDelete: false });
    try {
      expect(screen.host.querySelectorAll("button")).toHaveLength(0);
      expect(fake).not.toHaveBeenCalled();
    } finally { await screen.cleanup(); }
  });
});


// QA032_ANSWER_EDIT_DELETE: existing mounted answer owner component.
function deferredWrite() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
function writes(fetcher: ReturnType<typeof vi.fn>, method: string) {
  return fetcher.mock.calls.filter(call =>
    (call[1] as RequestInit | undefined)?.method === method);
}
function clickDirect(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(element => element.textContent?.trim() === text);
  if (!button) throw Error("Missing answer owner button: " + text);
  button.click();
}

describe("QA032_ANSWER_EDIT_DELETE mounted owner lifecycle", () => {
  it("two same-turn edit submits send one PATCH with same saved photos", async () => {
    const pending = deferredWrite();
    const fake = vi.fn(() => pending.promise);
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать ответ");
      await ui.changeBody("Обновлённый ответ");
      await act(async () => {
        const form = ui.host.querySelector("form");
        form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await Promise.resolve();
      });
      expect(writes(fake, "PATCH")).toHaveLength(1);
      expect(JSON.parse(String(writes(fake, "PATCH")[0][1]?.body))).toEqual({
        body: "Обновлённый ответ", photoIds: ["photo-1", "photo-2"],
      });
      await act(async () => pending.resolve(api({ id: "answer-1" })));
    } finally { await ui.cleanup(); }
  });

  it("two delete clicks prompt once, concurrent edit cannot delete until settled", async () => {
    const pending = deferredWrite();
    const fake = vi.fn(() => pending.promise);
    const ui = await mount(fake);
    try {
      await act(async () => { clickDirect(ui.host, "Удалить ответ");
        clickDirect(ui.host, "Удалить ответ"); await Promise.resolve(); });
      expect(writes(fake, "DELETE")).toHaveLength(0);
      expect(ui.host.querySelector('[aria-label="Подтверждение удаления ответа"]'))
        .not.toBeNull();
      await act(async () => { clickDirect(ui.host, "Да, удалить ответ");
        clickDirect(ui.host, "Да, удалить ответ"); await Promise.resolve(); });
      expect(writes(fake, "DELETE")).toHaveLength(1);
      await act(async () => pending.resolve(api({ id: "answer-1" })));
    } finally { await ui.cleanup(); }
    const held = deferredWrite();
    const another = vi.fn(() => held.promise);
    const next = await mount(another);
    try {
      await next.click("Редактировать ответ");
      await act(async () => {
        next.host.querySelector("form")?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }));
        clickDirect(next.host, "Удалить ответ");
        await Promise.resolve();
      });
      expect(writes(another, "PATCH")).toHaveLength(1);
      expect(writes(another, "DELETE")).toHaveLength(0);
      expect(writes(another, "DELETE")).toHaveLength(0);
      await act(async () => held.resolve(api({ id: "answer-1" })));
    } finally { await next.cleanup(); }
  });

  it("switch user/question/answer retires old draft and pending ACK without touching new owner", async () => {
    const former = deferredWrite();
    const current = deferredWrite();
    const fake = vi.fn((path: string) => path.includes("answer-1")
      ? former.promise : current.promise);
    const ui = await mount(fake);
    const invalidate = vi.spyOn(ui.cache, "invalidateQueries");
    try {
      await ui.click("Редактировать ответ");
      await ui.changeBody("PRIVATE_OLD_DRAFT");
      await ui.submit();
      expect(writes(fake, "PATCH")).toHaveLength(1);
      await ui.rerender("viewer-2", "question-B", {
        ...base, id: "answer-2", body: "Совершенно новый ответ",
        photoIds: ["photo-new"],
      });
      await ui.click("Редактировать ответ");
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Совершенно новый ответ");
      await ui.changeBody("Новый владелец правит");
      await ui.submit();
      expect(writes(fake, "PATCH")).toHaveLength(2);
      await act(async () => former.resolve(api({ id: "answer-1" })));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Новый владелец правит");
      expect(invalidate).not.toHaveBeenCalledWith({
        queryKey: ["questions", "detail", "viewer-2", "question-B"],
      });
      await act(async () => current.resolve(api({ id: "answer-2" })));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(ui.host.querySelector("textarea")).toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("unknown failed edit keeps unsaved body, no auto replay, explicit retry works", async () => {
    let calls = 0;
    const fake = vi.fn(() => Promise.resolve(++calls === 1
      ? api(null, 503) : api({ id: "answer-1" })));
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать ответ");
      await ui.changeBody("Не потерять текст ответа");
      await ui.submit();
      expect(calls).toBe(1);
      expect(ui.host.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("Не потерять текст ответа");
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(calls).toBe(1);
      await ui.submit();
      expect(calls).toBe(2);
    } finally { await ui.cleanup(); }
  });
});

// WEB005_ANSWER_INLINE_KEYBOARD: duplicate root/nested controls and current focus.
function exactButton(host: HTMLElement, title: string): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(item => item.textContent?.trim() === title);
  if (!button) throw Error("Missing owner control " + title);
  return button;
}

describe("WEB005_ANSWER_INLINE_KEYBOARD mounted root and nested answer editor", () => {
  it("two simultaneously mounted root/nested answers with duplicate answer IDs have distinct labelled textareas", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const fake = vi.fn(); vi.stubGlobal("fetch", fake);
    try {
      await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
        createElement("div", null,
          createElement(AnswerOwnerControls, { key: "root", userId: "viewer-1",
            questionId: "question-A", answer: { ...base, id: "answer-1" } }),
          createElement(AnswerOwnerControls, { key: "nested", userId: "viewer-1",
            questionId: "question-A", answer: { ...base, id: "answer-1", parentId: "root-1" } }),
        ),
      )));
      const triggers = [...host.querySelectorAll<HTMLButtonElement>("button")]
        .filter(button => button.textContent?.trim() === "Редактировать ответ");
      expect(triggers).toHaveLength(2);
      for (const trigger of triggers) {
        trigger.focus();
        await act(async () => trigger.click());
      }
      const forms = [...host.querySelectorAll<HTMLFormElement>("form")];
      const fields = [...host.querySelectorAll<HTMLTextAreaElement>("textarea")];
      expect(forms).toHaveLength(2);
      expect(fields).toHaveLength(2);
      expect(fields[0].id).not.toBe(fields[1].id);
      for (let i = 0; i < 2; i++) {
        const label = forms[i].querySelector("label");
        expect(forms[i].getAttribute("aria-label")).toBe("Редактирование ответа");
        expect(label?.htmlFor).toBe(fields[i].id);
        expect(document.getElementById(fields[i].id)).toBe(fields[i]);
        expect(triggers[i].isConnected).toBe(true);
      }
      expect(document.activeElement).toBe(fields[1]);
      expect(fake).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount()); cache.clear(); host.remove();
    }
  });

  it("opening focuses textarea; Cancel restores its retained trigger without stealing external focus", async () => {
    const ui = await mount(vi.fn());
    const outside = document.createElement("button"); document.body.append(outside);
    try {
      const trigger = exactButton(ui.host, "Редактировать ответ");
      trigger.focus();
      await act(async () => trigger.click());
      const field = ui.host.querySelector<HTMLTextAreaElement>("textarea")!;
      expect(document.activeElement).toBe(field);
      const cancel = exactButton(ui.host, "Отмена");
      cancel.focus();
      await act(async () => cancel.click());
      expect(ui.host.querySelector("form")).toBeNull();
      expect(trigger.isConnected).toBe(true);
      expect(document.activeElement).toBe(trigger);
      await act(async () => trigger.click());
      expect(document.activeElement).toBe(ui.host.querySelector("textarea"));
      outside.focus();
      await act(async () => exactButton(ui.host, "Отмена").click());
      expect(document.activeElement).toBe(outside);
      expect(ui.host.querySelector("form")).toBeNull();
    } finally { outside.remove(); await ui.cleanup(); }
  });

  it("same-turn submit then Cancel cannot bypass the existing edit flight", async () => {
    const pending = deferredWrite();
    const fake = vi.fn(() => pending.promise);
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать ответ");
      const field = ui.host.querySelector<HTMLTextAreaElement>("textarea")!;
      field.focus();
      await act(async () => {
        ui.host.querySelector("form")?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }));
        exactButton(ui.host, "Отмена").click();
        await Promise.resolve();
      });
      expect(writes(fake, "PATCH")).toHaveLength(1);
      expect(ui.host.querySelector("form")).not.toBeNull();
      // The synchronous flight blocks Cancel before React Query paints pending.
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      expect(ui.host.querySelector("form")?.getAttribute("aria-busy")).toBe("true");
      await act(async () => pending.resolve(api({ id: "answer-1" })));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(ui.host.querySelector("form")).toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("error is associated with focused editor, then explicit retry success restores its own trigger", async () => {
    const pending = deferredWrite();
    let calls = 0;
    const fake = vi.fn(() => ++calls === 1
      ? pending.promise : Promise.resolve(api({ id: "answer-1" })));
    const ui = await mount(fake);
    try {
      const trigger = exactButton(ui.host, "Редактировать ответ");
      trigger.focus();
      await act(async () => trigger.click());
      const field = ui.host.querySelector<HTMLTextAreaElement>("textarea")!;
      expect(document.activeElement).toBe(field);
      await ui.changeBody("Не терять мой черновик");
      await ui.submit();
      await act(async () => pending.resolve(api(null, 503)));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      const form = ui.host.querySelector<HTMLFormElement>("form")!;
      const error = ui.host.querySelector<HTMLElement>('[role="alert"]')!;
      expect(error.id).toBeTruthy();
      expect(form.getAttribute("aria-describedby")).toBe(error.id);
      expect(form.getAttribute("aria-busy")).toBe("false");
      expect(document.activeElement).toBe(field);
      expect(field.value).toBe("Не терять мой черновик");
      expect(calls).toBe(1);
      await ui.submit();
      expect(calls).toBe(2);
      expect(ui.host.querySelector("form")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    } finally { await ui.cleanup(); }
  });

  it("successful ACK does not steal focus when keyboard moved outside the current editor", async () => {
    const pending = deferredWrite();
    const fake = vi.fn(() => pending.promise);
    const ui = await mount(fake);
    const outside = document.createElement("button"); document.body.append(outside);
    try {
      const trigger = exactButton(ui.host, "Редактировать ответ");
      await act(async () => trigger.click());
      const field = ui.host.querySelector<HTMLTextAreaElement>("textarea")!;
      expect(document.activeElement).toBe(field);
      await ui.changeBody("Готовое редактирование");
      await ui.submit();
      outside.focus();
      expect(document.activeElement).toBe(outside);
      await act(async () => pending.resolve(api({ id: "answer-1" })));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(ui.host.querySelector("form")).toBeNull();
      expect(trigger.hidden).toBe(false);
      expect(document.activeElement).toBe(outside);
      expect(writes(fake, "PATCH")).toHaveLength(1);
    } finally { outside.remove(); await ui.cleanup(); }
  });

  it("retired answer ACK cannot move keyboard focus from newer question/answer editor", async () => {
    const old = deferredWrite(); const current = deferredWrite();
    const fake = vi.fn((path: string) => path.includes("answer-1")
      ? old.promise : current.promise);
    const ui = await mount(fake);
    try {
      await ui.click("Редактировать ответ");
      await ui.changeBody("PRIVATE_OLD_DRAFT");
      ui.host.querySelector<HTMLTextAreaElement>("textarea")?.focus();
      await ui.submit();
      await ui.rerender("viewer-2", "question-B", {
        ...base, id: "answer-2", body: "Новое содержание",
      });
      const trigger = exactButton(ui.host, "Редактировать ответ");
      trigger.focus();
      await act(async () => trigger.click());
      const field = ui.host.querySelector<HTMLTextAreaElement>("textarea")!;
      expect(document.activeElement).toBe(field);
      await ui.changeBody("ЧЕРНОВИК_НОВОГО_ВЛАДЕЛЬЦА");
      await act(async () => old.resolve(api({ id: "answer-1" })));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(document.activeElement).toBe(field);
      expect(field.value).toBe("ЧЕРНОВИК_НОВОГО_ВЛАДЕЛЬЦА");
      await ui.submit();
      await act(async () => current.resolve(api({ id: "answer-2" })));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(ui.host.querySelector("form")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    } finally { await ui.cleanup(); }
  });
});
