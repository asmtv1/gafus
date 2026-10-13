import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { QuestionDetailDto } from "@gafus/types";
import { QuestionForm } from "./QuestionForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("./parts", () => ({
  PhotoPicker: () => <div data-testid="photo-picker">Прикреплённые фотографии</div>,
}));
vi.mock("@/shared/components/ui", () => ({
  AppBackButtonLink: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  PrimaryButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  SecondaryButtonLink: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("question composer layout", () => {
  it("uses a compact form with accessible fields and shared actions", () => {
    const html = renderToStaticMarkup(<QuestionForm />);
    expect(html).toContain("Задать вопрос");
    expect(html).toContain('type="text"');
    expect(html).toContain('placeholder="Что вы хотите узнать?"');
    expect(html).toMatch(/<label[^>]*for="([^"]+)-title"[^>]*>.*?Заголовок/s);
    expect(html).toContain("Прикреплённые фотографии");
    expect(html).toContain("Опубликовать вопрос");
    expect(html).toContain('type="submit"');
    expect(html).toContain('href="/questions"');
  });

  it("preserves existing question values and edit navigation", () => {
    const initial = {
      id: "question-123",
      title: "Как научить собаку ждать?",
      body: "Пробовали команду сидеть",
      category: "Другое",
      tags: ["поводок"],
      photos: [],
    } as unknown as QuestionDetailDto;
    const html = renderToStaticMarkup(<QuestionForm initial={initial} />);
    expect(html).toContain("Редактировать вопрос");
    expect(html).toContain('value="Как научить собаку ждать?"');
    expect(html).toContain("Пробовали команду сидеть");
    expect(html).toContain('value="поводок"');
    expect(html).toContain("Сохранить изменения");
    expect(html).toContain('href="/questions/question-123"');
  });
});
