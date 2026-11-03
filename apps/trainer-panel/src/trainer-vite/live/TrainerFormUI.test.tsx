// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  TrainerMarkdownEditor, TrainerExamQuestions, TrainerMediaUrls,
  trainerSurveyChoices, type TrainerQuestion,
} from "./TrainerFormUI";
import { isKnownSurveySlug } from "../../../../../packages/core/src/services/survey/templates";

let mount: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mount = document.createElement("div");
  document.body.appendChild(mount);
  root = createRoot(mount);
});
afterEach(async () => {
  await act(async () => root.unmount());
  mount.remove();
});

describe("Legacy form functionality restored on Vite with client-side controls", () => {
  it("edits real Markdown with toolbar and renders a safe HTML-free preview", async () => {
    function Demo() {
      const [value, setValue] = useState("**Важный текст** <script>alert('x')</script>");
      return <TrainerMarkdownEditor label="Тестовое описание" value={value} onChange={setValue} />;
    }
    await act(async () => root.render(<Demo />));
    const preview = [...mount.querySelectorAll("button")]
      .find(button => button.textContent === "Предпросмотр");
    expect(preview).toBeTruthy();
    await act(async () => {
      preview!.click();
      await import("./TrainerMarkdownPreview");
    });
    expect(mount.querySelector(".trainer-markdown-preview strong")?.textContent).toBe("Важный текст");
    expect(mount.querySelector(".trainer-markdown-preview script")).toBeNull();
    const edit = [...mount.querySelectorAll("button")]
      .find(button => button.textContent === "Редактор");
    await act(async () => edit!.click());
    expect(mount.querySelector("textarea")?.value).toContain("**Важный текст**");
    expect(mount.querySelector(".trainer-markdown-preview")).toBeNull();
  });

  it("adds a question option, chooses a correct answer and preserves the JSON-compatible shape", async () => {
    const original: TrainerQuestion = {
      id: "q1", question: "Какой ответ верный?",
      options: ["Да", "Нет"], correctAnswer: 0, comment: "",
    };
    function Demo() {
      const [questions, setQuestions] = useState<TrainerQuestion[]>([original]);
      return <>
        <TrainerExamQuestions value={questions} onChange={setQuestions} />
        <output data-questions>{JSON.stringify(questions)}</output>
      </>;
    }
    await act(async () => root.render(<Demo />));
    const add = [...mount.querySelectorAll("button")].find(button =>
      button.textContent === "+ Вариант ответа");
    expect(add).toBeDefined();
    await act(async () => add!.click());
    expect(JSON.parse(mount.querySelector("[data-questions]")!.textContent!)[0].options).toHaveLength(3);
    const answer = mount.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]!;
    await act(async () => answer.click());
    expect(JSON.parse(mount.querySelector("[data-questions]")!.textContent!)[0].correctAnswer).toBe(1);
  });

  it("accepts only HTTP(S) media and prevents duplicates before mutating a draft", async () => {
    const onChange = vi.fn();
    function Demo() {
      const [images, setImages] = useState<string[]>([]);
      return <TrainerMediaUrls label="Изображения" value={images}
        onChange={next => { onChange(next); setImages(next); }} />;
    }
    await act(async () => root.render(<Demo />));
    const input = mount.querySelector<HTMLInputElement>('input[type="url"]')!;
    const type = async (value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      await act(async () => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    const add = [...mount.querySelectorAll("button")]
      .find(button => button.textContent === "Добавить")!;
    await type("javascript:alert(1)");
    await act(async () => add.click());
    expect(onChange).not.toHaveBeenCalled();
    expect(mount.textContent).toContain("корректную ссылку");
    await type("https://cdn.example.test/photo.webp");
    await act(async () => add.click());
    expect(onChange).toHaveBeenCalledWith(["https://cdn.example.test/photo.webp"]);
    expect(mount.querySelectorAll(".trainer-media-items img")).toHaveLength(1);
    await act(async () => [...mount.querySelectorAll("button")]
      .find(button => button.textContent === "Убрать")!.click());
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("offers only Core-recognized survey slugs, not a free-text broken form", () => {
    expect(trainerSurveyChoices).toHaveLength(3);
    expect(new Set(trainerSurveyChoices.map(item => item.value)).size).toBe(3);
    expect(trainerSurveyChoices.every(item => isKnownSurveySlug(item.value))).toBe(true);
  });
});
