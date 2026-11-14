/** Isolated local PostgreSQL 18 acceptance, opt-in only. No shared databases. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  createArticleRow,
  readArticleCatalogRows,
  readArticleDetailRow,
  readArticleForEditRow,
  readArticleViewersForAuthorRow,
  recordArticleViewRow,
} from "./articleRows";

const qa = describe.runIf(process.env.GAFUS_ARTICLE_ROWS_REAL_PG === "enabled");
const ownerId = "article-qa-author";
const viewerId = "article-qa-viewer";
const otherId = "article-qa-outsider";
const slug = "article-qa-private-views";

qa("article catalog owner scoping and SQL deduplicated views", () => {
  let articleId = "";
  let safeDisposableDatabase = false;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    expect(url.protocol).toBe("postgresql:");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe("/gafus_article_rows_qa");
    const database = await prisma.$queryRawUnsafe<{ db: string; version: number }[]>(
      "SELECT current_database() AS db, current_setting('server_version_num')::integer AS version",
    );
    expect(database[0]?.db).toBe("gafus_article_rows_qa");
    expect(database[0]?.version).toBeGreaterThanOrEqual(180000);
    safeDisposableDatabase = true;
    for (const id of [ownerId, viewerId, otherId]) {
      await prisma.user.create({ data: { id, username: id, password: "test-fixture-not-real" } });
    }
    const article = await createArticleRow({
      authorId: ownerId,
      title: "Private article QA",
      slug,
      contentType: "TEXT",
      content: "Private body - not for guest",
      visibility: "PAID",
      imageUrls: ["https://fake.invalid/photo.jpg"],
      videoUrl: "https://fake.invalid/video.mp4",
    });
    articleId = article.id;
    await prisma.articleLike.createMany({
      data: [
        { articleId, userId: viewerId },
        { articleId, userId: otherId },
      ],
    });
  });
  afterAll(async () => {
    if (!safeDisposableDatabase) return;
    await prisma.article.deleteMany({ where: { authorId: ownerId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, viewerId, otherId] } } });
    await prisma.$disconnect();
  });

  it("scopes the catalog and likes to the supplied user, with anonymous likes empty", async () => {
    const rows = await readArticleCatalogRows(viewerId, 10, 0, ownerId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.articleLikes).toEqual([{ userId: viewerId }]);
    expect(rows[0]?._count.articleLikes).toBe(2);
    const anonymous = await readArticleCatalogRows(undefined, 10, 0, ownerId);
    expect(anonymous[0]?.articleLikes).toEqual([]);
  });

  it("fences the viewers query by owner in SQL; edit/detail projections are correct", async () => {
    expect(await readArticleViewersForAuthorRow(articleId, otherId)).toBeNull();
    expect((await readArticleViewersForAuthorRow(articleId, ownerId))?.viewers).toEqual([]);
    expect((await readArticleForEditRow(articleId))?.authorId).toBe(ownerId);
    expect((await readArticleDetailRow(slug, viewerId))?.articleLikes).toEqual([
      { userId: viewerId },
    ]);
  });

  it("counts an authenticated user and a guest only once each, and nothing for anonymous", async () => {
    await recordArticleViewRow(articleId, viewerId, null);
    await recordArticleViewRow(articleId, viewerId, null);
    await recordArticleViewRow(articleId, null, "guest-key-12345678");
    await recordArticleViewRow(articleId, null, "guest-key-12345678");
    await recordArticleViewRow(articleId, null, null);
    expect((await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).viewCount).toBe(
      2,
    );
    expect(await prisma.articleViewer.count({ where: { articleId } })).toBe(1);
    expect(await prisma.articleGuestView.count({ where: { articleId } })).toBe(1);
    expect(
      (await readArticleViewersForAuthorRow(articleId, ownerId))?.viewers.map((v) => v.user.id),
    ).toEqual([viewerId]);
    expect(await readArticleViewersForAuthorRow(articleId, otherId)).toBeNull();
  });
});
