import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicQuestionsList } from "./PublicQuestionsList";

const { list, useInfiniteQuery, useSession } = vi.hoisted(() => ({
  list: vi.fn(),
  useInfiniteQuery: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ useSession }));
vi.mock("@tanstack/react-query", () => ({ useInfiniteQuery }));
vi.mock("./api", () => ({ questionsApi: { list } }));
vi.mock("./QuestionListCard", () => ({
  QuestionListCard: ({ question }: { question: { title: string } }) => (
    <article>{question.title}</article>
  ),
}));
vi.mock("@/shared/components/ui", () => ({
  LoadingState: ({ message }: { message: string }) => <div>{message}</div>,
  SecondaryButton: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
}));

describe("public profile questions", () => {
  it("requests the exact author's visible questions with the normal pagination contract", async () => {
    useSession.mockReturnValue({ status: "authenticated", data: { user: { id: "viewer" } } });
    useInfiniteQuery.mockImplementation((options) => {
      expect(options.queryKey).toEqual(["questions", "profile", "asmtv1", "viewer"]);
      expect(options.enabled).toBe(true);
      return {
        isSuccess: true,
        data: { pages: [{ items: [{ id: "q1", title: "Вопрос автора" }] }] },
        hasNextPage: false,
      };
    });
    list.mockResolvedValue({ items: [], nextPage: null });
    const html = renderToStaticMarkup(<PublicQuestionsList username="asmtv1" />);
    expect(html).toContain("Вопрос автора");
    expect(html).not.toContain("Задать вопрос");
    const options = useInfiniteQuery.mock.calls[0]![0];
    await options.queryFn({ pageParam: 3 });
    expect(list).toHaveBeenCalledWith({ author: "asmtv1", sort: "new", page: 3 });
  });

  it("does not request questions without an authenticated viewer", () => {
    useSession.mockReturnValue({ status: "unauthenticated", data: null });
    useInfiniteQuery.mockImplementation((options) => {
      expect(options.enabled).toBe(false);
      return { isPending: true, hasNextPage: false };
    });
    const html = renderToStaticMarkup(<PublicQuestionsList username="asmtv1" />);
    expect(html).toContain("Войдите в аккаунт");
  });
});
