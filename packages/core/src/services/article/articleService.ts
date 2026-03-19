/**
 * Article Service — бизнес-логика статей.
 */
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import type { ActionResult } from "@gafus/types";
import type { ArticleListDto, ArticleDetailDto } from "@gafus/types";
import {
  createArticleSchema,
  updateArticleSchema,
  type CreateArticleSchemaInput,
} from "./schemas";

const logger = createWebLogger("article-service");

const articleListSelect = {
  id: true,
  title: true,
  slug: true,
  authorId: true,
  contentType: true,
  visibility: true,
  priceRub: true,
  videoUrl: true,
  logoImg: true,
  imageUrls: true,
  viewCount: true,
  description: true,
  createdAt: true,
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

type ArticleListRow = Awaited<
  ReturnType<typeof prisma.article.findMany<{ select: typeof articleListSelect }>>
>[number];

function mapToListDto(
  row: ArticleListRow & { articleLikes?: { userId: string }[]; access?: { userId: string }[] },
  userId?: string
): ArticleListDto {
  const hasAccess =
    row.visibility === "PUBLIC" ||
    (!!userId && (row.access?.length ?? 0) > 0);
  const isLiked = !!userId && (row.articleLikes?.length ?? 0) > 0;
  const likeCount = row._count.articleLikes;

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    authorId: row.authorId,
    authorUsername: row.author.username,
    authorAvatarUrl: row.author.profile?.avatarUrl ?? null,
    contentType: row.contentType,
    visibility: row.visibility,
    priceRub: row.priceRub != null ? Number(row.priceRub) : null,
    videoUrl: row.videoUrl,
    logoImg: row.logoImg ?? "",
    imageUrls: row.imageUrls,
    likeCount,
    isLiked,
    hasAccess,
    viewCount: row.viewCount ?? 0,
    description: (row as { description?: string }).description ?? "",
    createdAt: row.createdAt.toISOString(),
  };
}

export type GetArticlesResult =
  | { success: true; data: ArticleListDto[] }
  | { success: false; error: string };

export async function getArticles(
  userId?: string,
  take = 50,
  skip = 0,
  authorId?: string
): Promise<GetArticlesResult> {
  try {
    const rows = await prisma.article.findMany({
      where: authorId ? { authorId } : undefined,
      select: {
        ...articleListSelect,
        articleLikes: { select: { userId: true } },
        access: { select: { userId: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    });

    const dtos = rows.map((r) =>
      mapToListDto(
        {
          ...r,
          articleLikes: userId
            ? r.articleLikes.filter((l) => l.userId === userId)
            : [],
          access: userId ? r.access.filter((a) => a.userId === userId) : [],
        } as ArticleListRow & { articleLikes: { userId: string }[]; access: { userId: string }[] },
        userId
      )
    );
    return { success: true, data: dtos };
  } catch (error) {
    logger.error("Ошибка getArticles", error as Error);
    return { success: false, error: "Не удалось загрузить статьи" };
  }
}

export type GetArticleBySlugResult =
  | { success: true; data: ArticleDetailDto }
  | { success: false; error: string };

export async function getArticleBySlug(
  slug: string,
  userId?: string
): Promise<GetArticleBySlugResult> {
  try {
    const row = await prisma.article.findUnique({
      where: { slug },
      select: {
        ...articleListSelect,
        content: true,
        articleLikes: { select: { userId: true } },
        access: { select: { userId: true } },
      },
    });

    if (!row) {
      return { success: false, error: "Статья не найдена" };
    }

    const filteredLikes = userId ? row.articleLikes.filter((l) => l.userId === userId) : [];
    const filteredAccess = userId ? row.access.filter((a) => a.userId === userId) : [];

    const hasAccess =
      row.visibility === "PUBLIC" || filteredAccess.length > 0;

    const dto: ArticleDetailDto = {
      ...mapToListDto(
        {
          ...row,
          articleLikes: filteredLikes,
          access: filteredAccess,
        } as ArticleListRow & { articleLikes: { userId: string }[]; access: { userId: string }[] },
        userId
      ),
      content: hasAccess ? row.content : null,
    };

    return { success: true, data: dto };
  } catch (error) {
    logger.error("Ошибка getArticleBySlug", error as Error);
    return { success: false, error: "Не удалось загрузить статью" };
  }
}

export type GetArticleForEditResult =
  | { success: true; data: CreateArticleSchemaInput }
  | { success: false; error: string };

export async function getArticleForEdit(
  id: string,
  userId: string
): Promise<GetArticleForEditResult> {
  try {
    const row = await prisma.article.findUnique({
      where: { id },
      select: {
        title: true,
        contentType: true,
        content: true,
        visibility: true,
        priceRub: true,
        videoUrl: true,
        logoImg: true,
        imageUrls: true,
        slug: true,
        authorId: true,
        description: true,
      },
    });

    if (!row) {
      return { success: false, error: "Статья не найдена" };
    }
    if (row.authorId !== userId) {
      return { success: false, error: "Нет прав на редактирование" };
    }

    const data: CreateArticleSchemaInput = {
      title: row.title,
      contentType: row.contentType,
      content: row.content,
      visibility: row.visibility,
      priceRub: row.priceRub != null ? Number(row.priceRub) : null,
      videoUrl: row.videoUrl,
      logoImg: row.logoImg ?? "",
      imageUrls: row.imageUrls,
      slug: row.slug,
      description: row.description ?? "",
    };
    return { success: true, data };
  } catch (error) {
    logger.error("Ошибка getArticleForEdit", error as Error);
    return { success: false, error: "Не удалось загрузить статью" };
  }
}

export type CreateArticleResult =
  | (ActionResult & { data?: { id: string; slug: string } })
  | { success: false; error: string };

export async function createArticle(
  input: Record<string, unknown>,
  userId: string
): Promise<CreateArticleResult> {
  try {
    const parsed = createArticleSchema.safeParse(input);
    if (!parsed.success) {
      const msg = parsed.error.errors.map((err: { message: string }) => err.message).join("; ") || "Ошибка валидации";
      return { success: false, error: msg };
    }

    const data = parsed.data;
    const article = await prisma.article.create({
      data: {
        ...(data.id && { id: data.id }),
        authorId: userId,
        title: data.title,
        contentType: data.contentType,
        content: data.content,
        visibility: data.visibility,
        priceRub: data.priceRub ?? null,
        videoUrl: data.videoUrl ?? null,
        logoImg: data.logoImg ?? "",
        imageUrls: data.imageUrls ?? [],
        slug: data.slug,
        description: data.description ?? "",
      },
    });

    return { success: true, data: { id: article.id, slug: article.slug } };
  } catch (error) {
    logger.error("Ошибка createArticle", error as Error);
    return { success: false, error: "Не удалось создать статью" };
  }
}

export async function updateArticle(
  id: string,
  input: Record<string, unknown>,
  userId: string
): Promise<ActionResult> {
  try {
    const article = await prisma.article.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!article) {
      return { success: false, error: "Статья не найдена" };
    }
    if (article.authorId !== userId) {
      return { success: false, error: "Нет прав на редактирование" };
    }

    const parsed = updateArticleSchema.safeParse({ ...input, id });
    if (!parsed.success) {
      const msg = parsed.error.errors.map((err: { message: string }) => err.message).join("; ") || "Ошибка валидации";
      return { success: false, error: msg };
    }

    const data = parsed.data;
    await prisma.article.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.contentType !== undefined && { contentType: data.contentType }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.visibility !== undefined && { visibility: data.visibility }),
        ...(data.priceRub !== undefined && { priceRub: data.priceRub }),
        ...(data.videoUrl !== undefined && { videoUrl: data.videoUrl }),
        ...(data.logoImg !== undefined && { logoImg: data.logoImg }),
        ...(data.imageUrls !== undefined && { imageUrls: data.imageUrls }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.description !== undefined && { description: data.description }),
      },
    });

    return { success: true };
  } catch (error) {
    logger.error("Ошибка updateArticle", error as Error);
    return { success: false, error: "Не удалось обновить статью" };
  }
}

/**
 * Инкрементирует счётчик просмотров статьи по slug.
 * Вызывается при входе пользователя на страницу статьи.
 */
export async function incrementArticleView(slug: string): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.article.updateMany({
      where: { slug },
      data: { viewCount: { increment: 1 } },
    });
    return { success: true };
  } catch (error) {
    logger.error("Ошибка incrementArticleView", error as Error);
    return { success: false, error: "Не удалось обновить просмотры" };
  }
}

export type DeleteArticleResult = ActionResult & { trainerId?: string };

export async function deleteArticle(
  id: string,
  userId: string
): Promise<DeleteArticleResult> {
  try {
    const article = await prisma.article.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!article) {
      return { success: false, error: "Статья не найдена" };
    }
    if (article.authorId !== userId) {
      return { success: false, error: "Нет прав на удаление" };
    }

    await prisma.article.delete({ where: { id } });
    return { success: true, trainerId: article.authorId };
  } catch (error) {
    logger.error("Ошибка deleteArticle", error as Error);
    return { success: false, error: "Не удалось удалить статью" };
  }
}
