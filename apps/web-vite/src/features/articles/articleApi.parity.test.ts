import { afterEach, describe, expect, it, vi } from "vitest";
import { listMyArticles } from "./articleApi";

const valid = {
  id: "article_01",
  slug: "dog-training",
  title: "Курс воспитания",
  description: "Тренировка",
  visibility: "PAID",
  hasAccess: true,
  likeCount: 1,
  authorUsername: "trainer",
};
const api = (items: unknown[]) =>
  new Response(JSON.stringify({ success: true, data: items }), { status: 200 });
afterEach(() => vi.unstubAllGlobals());

describe("article catalog projection integrity", () => {
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, null, "10"])(
    "AC-P01 refuses invalid like count %s",
    async (count) => {
      const fetcher = vi.fn().mockResolvedValue(api([{ ...valid, likeCount: count }]));
      vi.stubGlobal("fetch", fetcher);
      await expect(listMyArticles()).rejects.toThrow("некорректный список");
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("AC-P02 refuses duplicate IDs and duplicate slugs before React keys/links", async () => {
    for (const duplicate of [
      { ...valid, slug: "different-slug" },
      { ...valid, id: "article_02" },
    ]) {
      const fetcher = vi.fn().mockResolvedValue(api([valid, duplicate]));
      vi.stubGlobal("fetch", fetcher);
      await expect(listMyArticles()).rejects.toThrow("некорректный список");
    }
  });

  it("AC-P03 accepts valid count and strips private article body from memory", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      api([
        {
          ...valid,
          likeCount: 0,
          content: "PRIVATE_ARTICLE_BODY",
          imageUrls: ["SECRET_MEDIA_LINK"],
        },
      ]),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await listMyArticles();
    expect(result).toHaveLength(1);
    expect(result[0].likeCount).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_ARTICLE_BODY|SECRET_MEDIA_LINK/);
  });
});
