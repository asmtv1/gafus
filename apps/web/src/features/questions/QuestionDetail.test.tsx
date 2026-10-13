import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { QuestionDetail, formatAnswerCount } from "./QuestionDetail";

vi.mock("@mui/icons-material", () => {
  const Icon = () => <span aria-hidden="true" />;
  return {
    Favorite: Icon,
    FavoriteBorder: Icon,
    FlagOutlined: Icon,
    ShareOutlined: Icon,
    LockOutlined: Icon,
    MoreHoriz: Icon,
    ChatBubbleOutline: Icon,
    CheckCircleOutline: Icon,
    KeyboardArrowDown: Icon,
    KeyboardArrowUp: Icon,
    SendOutlined: Icon,
    EditOutlined: Icon,
    DeleteOutline: Icon,
  };
});

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "viewer" } } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useInfiniteQuery: () => ({
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    data: {
      pages: [
        {
          id: "question-1",
          title: "Как приучить собаку к прогулкам?",
          body: "Текст вопроса",
          author: { id: "author", name: "Автор вопроса" },
          photos: [],
          createdAt: "2026-10-10T10:00:00.000Z",
          answerCount: 2,
          canReply: true,
          canManage: true,
          canEdit: false,
          closed: false,
          answers: [
            {
              id: "answer-1",
              body: "Поможет постепенное привыкание",
              author: { id: "other", name: "Первый участник" },
              createdAt: "2026-10-11T10:00:00.000Z",
              hearts: 2,
              liked: false,
              best: true,
              replyCount: 1,
              canEdit: false,
              canDelete: false,
              photos: [],
            },
            {
              id: "answer-2",
              parentId: "answer-1",
              replyToName: "Первый участник",
              body: "Спасибо за совет",
              author: { id: "author", name: "Второй участник" },
              createdAt: "2026-10-11T11:00:00.000Z",
              hearts: 0,
              liked: false,
              best: false,
              replyCount: 0,
              canEdit: true,
              canDelete: true,
              photos: [],
            },
          ],
        },
      ],
    },
  }),
}));
vi.mock("./parts", () => ({
  Author: ({ author }: { author: { name: string } }) => <span>{author.name}</span>,
  BestLabel: () => <span>Лучший ответ</span>,
  Body: ({ text }: { text: string }) => <p>{text}</p>,
  Counts: () => null,
  Photos: () => null,
  PhotoPicker: () => <button type="button">Прикрепить фото</button>,
  Status: () => null,
}));
vi.mock("@/shared/components/ui", () => ({
  AppBackButtonLink: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  LoadingState: () => <span>Загрузка</span>,
  PrimaryButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  SecondaryButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  SecondaryButtonLink: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("question detail answers layout", () => {
  it("inflects the Russian answer count correctly", () => {
    expect(formatAnswerCount(0)).toBe("0 ответов");
    expect(formatAnswerCount(1)).toBe("1 ответ");
    expect(formatAnswerCount(2)).toBe("2 ответа");
    expect(formatAnswerCount(5)).toBe("5 ответов");
    expect(formatAnswerCount(11)).toBe("11 ответов");
    expect(formatAnswerCount(21)).toBe("21 ответ");
  });

  it("groups root and nested replies with clear actions and a compact composer", () => {
    const html = renderToStaticMarkup(<QuestionDetail id="question-1" />);
    expect(html).toContain("2 ответа");
    expect(html).toContain('aria-label="Сортировка ответов"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Лучший ответ");
    expect(html).toContain("Поможет постепенное привыкание");
    expect(html).toContain("В ответ Первый участник");
    expect(html).toContain("Скрыть ответы (1)");
    expect(html).toContain("Дополнительные действия с ответом");
    expect(html).toContain("Пожаловаться");
    expect(html).toContain("Прикрепить фото");
    expect(html).toContain('id="reply-body"');
    expect(html).toContain("Опубликовать ответ");
  });
});
