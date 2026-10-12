import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MyQuestionsList } from "./MyQuestionsList";

const mocks = vi.hoisted(() => ({
  useInfiniteQuery: vi.fn(),
  list: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "owner-123" } } }),
}));
vi.mock("@tanstack/react-query", () => ({ useInfiniteQuery: mocks.useInfiniteQuery }));
vi.mock("./api", () => ({ questionsApi: { list: mocks.list } }));
vi.mock("./QuestionListCard", () => ({
  QuestionListCard: ({ question }: { question: { title: string } }) => (
    <article>{question.title}</article>
  ),
}));
vi.mock("@/shared/components/ui", () => ({
  LoadingState: () => <span>Загрузка</span>,
  PrimaryButtonLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

beforeEach(() => {
  mocks.useInfiniteQuery.mockReset();
  mocks.list.mockReset();
});

describe("my questions in profile", () => {
  it("requests only authenticated author's questions, with server pagination", async () => {
    mocks.useInfiniteQuery.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: true,
      hasNextPage: false,
      data: { pages: [{ items: [], canPublish: true }] },
    });
    const html = renderToStaticMarkup(<MyQuestionsList />);
    expect(html).toContain("Вы пока не задавали вопросов");
    const options = mocks.useInfiniteQuery.mock.calls[0][0];
    expect(options.queryKey).toEqual(["questions", "owner-123", "profile", "mine"]);
    expect(options.enabled).toBe(true);
    await options.queryFn({ pageParam: 2 });
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith({ mine: true, sort: "new", page: 2 });
  });

  it("displays questions from the mine-only response", () => {
    mocks.useInfiniteQuery.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: true,
      hasNextPage: false,
      data: { pages: [{ items: [{ id: "question-1", title: "Мой вопрос" }], canPublish: true }] },
    });
    const html = renderToStaticMarkup(<MyQuestionsList />);
    expect(html).toContain("Мой вопрос");
    expect(html).not.toContain("Вы пока не задавали вопросов");
  });
});
