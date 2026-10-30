import { afterEach, describe, expect, it, vi } from "vitest";
import { getQuestionOverview, listQuestionReplies, listQuestionsPage } from "./questionApi";
const q = (id: string) => ({
  id,
  title: "Поводок",
  body: "Как научить идти рядом?",
  category: "Поведение",
  status: "waiting",
  answerCount: 1,
  createdAt: "2026-10-18T00:00:00Z",
  author: { id: "PRIVATE_AUTHOR_ID", name: "Автор", avatarUrl: null },
});
const response = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200 });
afterEach(() => vi.unstubAllGlobals());
describe("questions page projection pagination integrity", () => {
  it.each([1, 0, -1, 10001, 1.5])(
    "Q-A01 page 2 refuses nonforward nextPage %s",
    async (nextPage) => {
      const fake = vi
        .fn()
        .mockResolvedValue(
          response({ items: [q("q-1")], nextPage, canPublish: true, blockReason: null }),
        );
      vi.stubGlobal("fetch", fake);
      await expect(listQuestionsPage({ page: 2 })).rejects.toThrow("некорректный список");
    },
  );
  it("Q-A02 rejects duplicate question IDs within the same page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          items: [q("q-1"), q("q-1")],
          nextPage: null,
          canPublish: true,
          blockReason: null,
        }),
      ),
    );
    await expect(listQuestionsPage()).rejects.toThrow("некорректный список");
  });
  it("Q-A03 preserves legitimate empty terminal page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          items: [],
          nextPage: null,
          canPublish: false,
          blockReason: null,
        }),
      ),
    );
    await expect(listQuestionsPage({ page: 2 })).resolves.toEqual({
      items: [],
      nextPage: null,
      canPublish: false,
      blockReason: null,
    });
  });
  it("Q-A04 threaded reply cursor must move forward before GET caching", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ items: [], nextPage: 2 })));
    await expect(listQuestionReplies("root-1", 2, "A", false)).rejects.toThrow(
      "некорректные вложенные ответы",
    );
  });
  it("Q-A05 detail answer cursor must move forward before caching", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          ...q("question-1"),
          closed: false,
          canReply: true,
          canManage: false,
          canEdit: false,
          blockReason: null,
          tags: [],
          photos: [],
          answers: [],
          nextAnswerPage: 2,
        }),
      ),
    );
    await expect(getQuestionOverview("question-1", 2, "A")).rejects.toThrow("некорректный вопрос");
  });
});
