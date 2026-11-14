/** Article persistence projections: Core owns entitlement and response policy. */
import { prisma, type Prisma } from "@gafus/prisma";

const articleListSelect = {
  id: true,
  title: true,
  slug: true,
  authorId: true,
  contentType: true,
  visibility: true,
  videoUrl: true,
  logoImg: true,
  imageUrls: true,
  viewCount: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: {
      id: true,
      username: true,
      profile: { select: { avatarUrl: true } },
    },
  },
  _count: {
    select: { articleLikes: true },
  },
} as const;

export type ArticleListRow = Awaited<
  ReturnType<typeof prisma.article.findMany<{ select: typeof articleListSelect }>>
>[number];

export async function readArticleCatalogRows(
  userId: string | undefined,
  take: number,
  skip: number,
  authorId?: string,
) {
  return prisma.article.findMany({
    where: authorId ? { authorId } : undefined,
    select: {
      ...articleListSelect,
      articleLikes: { where: { userId: userId ?? "" }, select: { userId: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
    skip,
  });
}

export async function readArticleGrantRows(userId: string, rows: { id: string }[]) {
  return prisma.gafusTargetAccess.findMany({
    where: {
      userId,
      targetType: "ARTICLE",
      targetKey: { in: rows.map((row) => `article:${row.id}`) },
      expiresAt: { gt: new Date() },
    },
    select: { targetKey: true },
  });
}

export async function readArticleDetailRow(slug: string, userId?: string) {
  return prisma.article.findUnique({
    where: { slug: slug },
    select: {
      ...articleListSelect,
      content: true,
      articleLikes: { where: { userId: userId ?? "" }, select: { userId: true } },
    },
  });
}

export async function readArticleForEditRow(id: string) {
  return prisma.article.findUnique({
    where: { id },
    select: {
      title: true,
      contentType: true,
      content: true,
      visibility: true,
      videoUrl: true,
      logoImg: true,
      imageUrls: true,
      slug: true,
      authorId: true,
      description: true,
    },
  });
}

export async function readArticleIdBySlug(slug: string) {
  return prisma.article.findUnique({
    where: { slug },
    select: { id: true },
  });
}

export async function readArticleViewersForAuthorRow(articleId: string, authorId: string) {
  return prisma.article.findFirst({
    where: { id: articleId, authorId },
    select: {
      viewers: {
        orderBy: { lastViewedAt: "desc" },
        select: {
          lastViewedAt: true,
          user: {
            select: {
              id: true,
              username: true,
              profile: { select: { fullName: true } },
            },
          },
        },
      },
    },
  });
}

export async function createArticleRow(data: Prisma.ArticleUncheckedCreateInput) {
  return prisma.article.create({ data });
}

export async function recordArticleViewRow(
  articleId: string,
  userId: string | null,
  guestKey: string | null,
) {
  return prisma.$transaction(async (tx) => {
    // Article id is already resolved and validated by the caller.

    if (userId) {
      const created = await tx.articleViewer.createMany({
        data: { articleId, userId },
        skipDuplicates: true,
      });
      if (created.count === 0) {
        await tx.articleViewer.update({
          where: { articleId_userId: { articleId, userId } },
          data: { lastViewedAt: new Date() },
        });
        return;
      }
      await tx.article.update({
        where: { id: articleId },
        data: { viewCount: { increment: 1 } },
      });
      return;
    }

    if (guestKey) {
      const created = await tx.articleGuestView.createMany({
        data: { articleId, visitorKey: guestKey },
        skipDuplicates: true,
      });
      if (created.count === 0) {
        return;
      }
      await tx.article.update({
        where: { id: articleId },
        data: { viewCount: { increment: 1 } },
      });
      return;
    }

    // Без userId и без ключа гостя счётчик не меняем
  });
}
