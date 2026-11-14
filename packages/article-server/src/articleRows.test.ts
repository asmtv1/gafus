import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createArticleRow,
  readArticleCatalogRows,
  readArticleDetailRow,
  readArticleForEditRow,
  readArticleGrantRows,
  readArticleIdBySlug,
  readArticleViewersForAuthorRow,
  recordArticleViewRow,
} from "./articleRows";

const db = vi.hoisted(() => ({
  list: vi.fn(), unique: vi.fn(), first: vi.fn(), create: vi.fn(),
  grant: vi.fn(), transaction: vi.fn(), viewerCreate: vi.fn(),
  viewerUpdate: vi.fn(), guestCreate: vi.fn(), viewIncrement: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    article: {
      findMany: db.list,
      findUnique: db.unique,
      findFirst: db.first,
      create: db.create,
    },
    gafusTargetAccess: { findMany: db.grant },
    $transaction: db.transaction,
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  db.list.mockResolvedValue([]);
  db.grant.mockResolvedValue([]);
  db.transaction.mockImplementation(async (callback) =>
    callback({
      articleViewer: { createMany: db.viewerCreate, update: db.viewerUpdate },
      articleGuestView: { createMany: db.guestCreate },
      article: { update: db.viewIncrement },
    }),
  );
});

describe("article SQL projections", () => {
  it("catalog limits pagination and projects only the current user's likes", async () => {
    await readArticleCatalogRows("member-1", 9, 18, "trainer-2");
    const input = db.list.mock.calls[0]![0];
    expect(input.take).toBe(9);
    expect(input.skip).toBe(18);
    expect(input.where).toEqual({ authorId: "trainer-2" });
    expect(input.select.articleLikes).toEqual({
      where: { userId: "member-1" },
      select: { userId: true },
    });
    expect(input.select.access).toBeUndefined();
    expect(input.select._count).toEqual({ select: { articleLikes: true } });
    await readArticleCatalogRows(undefined, 50, 0);
    expect(db.list.mock.calls[1]![0].select.articleLikes.where.userId).toBe("");
  });

  it("Gafus article grants are scoped to the authenticated viewer and exact target keys", async () => {
    const before = new Date();
    await readArticleGrantRows("member-1", [{ id: "a" }, { id: "b" }]);
    const query = db.grant.mock.calls[0]![0];
    expect(query.where.userId).toBe("member-1");
    expect(query.where.targetType).toBe("ARTICLE");
    expect(query.where.targetKey).toEqual({ in: ["article:a", "article:b"] });
    expect(query.where.expiresAt.gt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(query.select).toEqual({ targetKey: true });
  });

  it("details/edit are bounded projections with actor likes and owner id", async () => {
    await readArticleDetailRow("a-slug", "member-1");
    const detail = db.unique.mock.calls[0]![0];
    expect(detail.where).toEqual({ slug: "a-slug" });
    expect(detail.select.articleLikes.where.userId).toBe("member-1");
    expect(detail.select.content).toBe(true);
    await readArticleForEditRow("a1");
    const edit = db.unique.mock.calls[1]![0];
    expect(edit.where).toEqual({ id: "a1" });
    expect(edit.select.authorId).toBe(true);
    await readArticleIdBySlug("a-slug");
    expect(db.unique.mock.calls[2]![0]).toEqual({ where: { slug: "a-slug" }, select: { id: true } });
  });

  it("viewer list always fences the article by author at the SQL query", async () => {
    await readArticleViewersForAuthorRow("article-1", "trainer-1");
    const query = db.first.mock.calls[0]![0];
    expect(query.where).toEqual({ id: "article-1", authorId: "trainer-1" });
    expect(query.select.viewers.select.user.select.profile.select).toEqual({ fullName: true });
    expect(query.select.viewers.orderBy).toEqual({ lastViewedAt: "desc" });
  });

  it("forwards the already validated and sanitized Core input to the repository", async () => {
    const input = {
      authorId: "trainer-1", title: "test", slug: "test", content: "<p>safe</p>",
      contentType: "TEXT" as const, visibility: "PUBLIC" as const,
    };
    await createArticleRow(input);
    expect(db.create).toHaveBeenCalledWith({ data: input });
  });

  it("first authenticated view increments once; duplicate updates last-viewed only", async () => {
    db.viewerCreate.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await recordArticleViewRow("article-1", "member-1", null);
    expect(db.viewerCreate).toHaveBeenCalledWith({
      data: { articleId: "article-1", userId: "member-1" }, skipDuplicates: true,
    });
    expect(db.viewIncrement).toHaveBeenCalledTimes(1);
    await recordArticleViewRow("article-1", "member-1", null);
    expect(db.viewIncrement).toHaveBeenCalledTimes(1);
    expect(db.viewerUpdate).toHaveBeenCalledWith({
      where: { articleId_userId: { articleId: "article-1", userId: "member-1" } },
      data: { lastViewedAt: expect.any(Date) },
    });
  });

  it("guest view has atomic dedupe, and unknown visitor never increments", async () => {
    db.guestCreate.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await recordArticleViewRow("article-1", null, "guest-verified-key");
    await recordArticleViewRow("article-1", null, "guest-verified-key");
    await recordArticleViewRow("article-1", null, null);
    expect(db.guestCreate).toHaveBeenCalledTimes(2);
    expect(db.viewIncrement).toHaveBeenCalledTimes(1);
  });
});
