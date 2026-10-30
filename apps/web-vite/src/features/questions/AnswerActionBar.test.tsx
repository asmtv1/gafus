// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { AnswerActionBar } from "./AnswerActionBar";
import type { QuestionAnswerCard } from "./questionApi";

const answer: QuestionAnswerCard = {
  id: "answer-1", body: "Нужен совет", authorName: "Автор",
  parentId: null, replyToName: null, replyCount: 0, best: false,
  canEdit: true, canDelete: true, canHeart: false, hearts: 0,
  liked: false, deleted: false, hidden: false, photoIds: [],
};
let host: HTMLDivElement, root: Root, query: QueryClient;
const onReply = vi.fn();
async function mount(blocked = false, canManage = true) {
  await act(async () => root.render(
    <QueryClientProvider client={query}>
      <AnswerActionBar userId="owner" questionId="question-1"
        answer={answer} blocked={blocked} canReply={true}
        canManage={canManage} onReply={onReply} />
    </QueryClientProvider>,
  ));
}
const press = async (button: HTMLButtonElement | null | undefined) => {
  expect(button).toBeTruthy();
  await act(async () => button?.click());
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  query = new QueryClient({ defaultOptions: {queries:{retry:false}} });
  onReply.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  query.clear(); host.remove(); vi.unstubAllGlobals();
});
describe("minimal answer action menu", () => {
  it("shows three neutral controls; keeps privileged operations inside closed menu", async () => {
    await mount();
    const menu = host.querySelector<HTMLDetailsElement>("details.web4-answer-more")!;
    expect(menu.open).toBe(false);
    expect(host.querySelectorAll(".web4-answer-actions > .answer-heart > button")).toHaveLength(1);
    expect(host.querySelector(".web4-answer-reply")?.textContent?.trim()).toBe("Ответить");
    expect(host.querySelector(".web4-answer-reply")?.getAttribute("aria-label"))
      .toBe("Ответить на комментарий");
    expect(host.querySelectorAll(".web4-answer-actions > details")).toHaveLength(1);
    await press(host.querySelector<HTMLButtonElement>(".web4-answer-reply"));
    expect(onReply).toHaveBeenCalledWith("answer-1", "Автор");
    await act(async () => menu.querySelector("summary")?.click());
    expect(menu.open).toBe(true);
    const labels = [...menu.querySelectorAll<HTMLButtonElement>("button")]
      .map(button => button.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining([
      "Выбрать лучший ответ", "Редактировать ответ", "Удалить ответ",
      "Пожаловаться на ответ",
    ]));
    await act(async () => document.body.dispatchEvent(new Event("pointerdown",{bubbles:true})));
    expect(menu.open).toBe(false);
  });
  it("keeps edit and delete confirmation visible until explicit cancel, no mutation", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await mount();
    const menu=host.querySelector<HTMLDetailsElement>("details.web4-answer-more")!;
    await act(async () => menu.querySelector("summary")?.click());
    await press([...menu.querySelectorAll<HTMLButtonElement>("button")]
      .find(b => b.textContent?.trim()==="Редактировать ответ"));
    expect(menu.querySelector('form[aria-label="Редактирование ответа"]')).toBeTruthy();
    await act(async () => document.body.dispatchEvent(new Event("pointerdown",{bubbles:true})));
    expect(menu.open).toBe(true);
    await press([...menu.querySelectorAll<HTMLButtonElement>("button")]
      .find(b => b.textContent?.trim()==="Отмена"));
    await press([...menu.querySelectorAll<HTMLButtonElement>("button")]
      .find(b => b.textContent?.trim()==="Удалить ответ"));
    expect(menu.querySelector('[aria-label="Подтверждение удаления ответа"]')).toBeTruthy();
    await press([...menu.querySelectorAll<HTMLButtonElement>("button")]
      .find(b => b.textContent?.trim()==="Не удалять ответ"));
    expect(menu.querySelector('[aria-label="Подтверждение удаления ответа"]')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("blocked viewer has neither reply nor menu and cannot like own answer", async () => {
    await mount(true);
    expect(host.querySelector(".web4-answer-reply")).toBeNull();
    expect(host.querySelector("details.web4-answer-more")).toBeNull();
    expect(host.querySelector<HTMLButtonElement>(".answer-heart button")?.disabled).toBe(true);
  });
  it("non-manager does not get the best answer action", async () => {
    await mount(false,false);
    const menu=host.querySelector<HTMLDetailsElement>("details.web4-answer-more")!;
    await act(async () => menu.querySelector("summary")?.click());
    expect(menu.textContent).not.toContain("Выбрать лучший ответ");
  });
});
