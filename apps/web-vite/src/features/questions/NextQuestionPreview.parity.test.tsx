// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { NextQuestionPreview } from "./NextQuestionPreview";
import type { QuestionCard } from "./questionApi";

const base: QuestionCard = {
  id: "sample-1", title: "Как вы относитесь к натуральному питанию?",
  preview: "Описание вопроса", category: "Питание", tags: ["Натуралка"],
  status: "waiting", closed: false, answerCount: 0, viewCount: 4,
  createdAt: "2026-10-09T12:00:00.000Z", authorName: "Автор собаки",
  authorAvatarUrl: "/uploads/avatar-visible.png",
};
const roots: (() => Promise<void>)[] = [];
async function render(question: QuestionCard) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async()=>root.render(<NextQuestionPreview question={question}/>));
  roots.push(async()=>{await act(async()=>root.unmount());host.remove();});
  return host;
}
afterEach(async()=>{for(const cleanup of roots.splice(0))await cleanup();});
describe("retained Next QuestionListCard visual/content contract",()=>{
  it("keeps status, category, tag, picture, answers and actual views without private author id",async()=>{
    const host=await render(base);
    const card=host.querySelector('a[href="/questions/sample-1"]');
    expect(card).not.toBeNull();
    expect(card?.querySelector("h2")?.textContent).toBe(base.title);
    expect(card?.textContent).toContain("Ждёт ответа");
    expect(card?.textContent).toContain("#Натуралка");
    expect(card?.textContent).toContain("0 ответов");
    expect(card?.textContent).toContain("4");
    expect(card?.querySelector('img[alt=""]')?.getAttribute("src"))
      .toBe("/uploads/avatar-visible.png");
    expect(host.innerHTML).not.toContain("PRIVATE_AUTHOR_ID");
    const avatar=card?.querySelector("img");
    await act(async()=>avatar?.dispatchEvent(new Event("error",{bubbles:true})));
    expect(card?.querySelector("img")).toBeNull();
    expect(card?.querySelector("span[aria-hidden='true']")?.textContent).toContain("А");
  });
  it("uses safe initial when picture is missing and signals closed status",async()=>{
    const host=await render({...base,authorAvatarUrl:null,closed:true,
      tags:[],viewCount:0});
    const card=host.querySelector("a");
    expect(card?.querySelector("img")).toBeNull();
    expect(card?.textContent).toContain("Обсуждение закрыто");
    expect(card?.textContent).toContain("А");
    expect(card?.textContent).toContain("0 ответов");
  });
});
