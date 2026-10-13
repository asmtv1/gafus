import { renderToStaticMarkup } from "react-dom/server";
import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionDetail } from "./QuestionDetail";

const mocks = vi.hoisted(() => ({
  useInfiniteQuery: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("@mui/icons-material", () => {
  const Icon = () => <span aria-hidden="true" />;
  return Object.fromEntries(
    [
      "Favorite", "FavoriteBorder", "FlagOutlined", "ShareOutlined", "LockOutlined",
      "MoreHoriz", "ChatBubbleOutline", "CheckCircleOutline", "KeyboardArrowDown",
      "KeyboardArrowUp", "SendOutlined", "EditOutlined", "DeleteOutline",
    ].map((name) => [name, Icon]),
  );
});
vi.mock("./parts", () => ({
  Author: ({ author }: { author: { name: string } }) => <span>{author.name}</span>,
  Status: () => null,
  Counts: () => <span>2 ответа</span>,
  Photos: () => null,
  Body: ({ text }: { text: string }) => <p>{text}</p>,
  BestLabel: () => null,
  PhotoPicker: () => null,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "owner-1" } } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: mocks.useInfiniteQuery,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("@/shared/components/ui", () => ({
  LoadingState: () => <span>Загрузка</span>,
  AppBackButtonLink: ({
    children, ...props
  }: PropsWithChildren<{ href: string; className?: string }>) => (
    <a {...props} data-shared="back">{children}</a>
  ),
  PrimaryButton: ({
    children, ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button {...props} data-shared="primary">{children}</button>
  ),
  SecondaryButton: ({
    children, variant, ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "red" }>) => (
    <button {...props} data-shared="secondary" data-variant={variant ?? "default"}>{children}</button>
  ),
  SecondaryButtonLink: ({
    children, ...props
  }: PropsWithChildren<{ href: string; className?: string }>) => (
    <a {...props} data-shared="secondary-link">{children}</a>
  ),
}));

const question = {
  id: "question-1",
  title: "Как правильно кормить собаку?",
  body: "Советы по питанию",
  author: { id: "owner-1", name: "Автор" },
  createdAt: "2026-10-12T12:00:00.000Z",
  status: "answered",
  category: "Питание",
  tags: ["собаки"],
  photos: [],
  answers: [],
  answerCount: 2,
  viewCount: 8,
  closed: false,
  blockReason: null,
  canReply: true,
  canManage: true,
  canEdit: true,
};

function renderQuestion(overrides: Record<string, unknown> = {}) {
  mocks.useInfiniteQuery.mockReturnValue({
    isPending: false,
    isError: false,
    data: { pages: [{ ...question, ...overrides, nextAnswerPage: null }] },
    hasNextPage: false,
    isFetchingNextPage: false,
  });
  return renderToStaticMarkup(<QuestionDetail id="question-1" />);
}

beforeEach(() => {
  mocks.useInfiniteQuery.mockReset();
  mocks.invalidateQueries.mockReset();
});

describe("question detail shared actions", () => {
  it("renders shared navigation, primary reply, outlined edit and red delete actions", () => {
    const html = renderQuestion();
    expect(html).toContain('data-shared="back"');
    expect(html).toContain('href="/questions"');
    expect(html).toContain("Все вопросы");
    expect(html).toContain('data-shared="primary"');
    expect(html).toContain("Ответить");
    expect(html).toContain('data-shared="secondary-link"');
    expect(html).toContain('href="/questions/question-1/edit"');
    expect(html).toContain("Изменить");
    expect(html).toContain('data-variant="red"');
    expect(html).toContain("Удалить");
    expect(html).toContain("Закрыть обсуждение");
  });

  it("does not offer owner-only actions to other users", () => {
    const html = renderQuestion({ canManage: false, canEdit: false });
    expect(html).not.toContain("Изменить");
    expect(html).not.toContain("Удалить");
    expect(html).not.toContain("Закрыть обсуждение");
    expect(html).toContain("Ответить");
  });

  it("hides reply and edit when publishing is blocked, but preserves moderation", () => {
    const html = renderQuestion({ canReply: false, blockReason: "Ограничение" });
    expect(html).not.toContain('data-shared="primary"');
    expect(html).not.toContain('data-shared="secondary-link"');
    expect(html).toContain('data-variant="red"');
  });
});
