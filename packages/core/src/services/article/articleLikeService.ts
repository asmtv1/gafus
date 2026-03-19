/**
 * ArticleLike Service — переключение лайка статьи.
 */
import { prisma } from "@gafus/prisma";

/**
 * Переключает лайк статьи пользователем.
 * @returns true если лайк поставлен, false если снят
 */
export async function toggleArticleLike(
  userId: string,
  articleId: string
): Promise<boolean> {
  const existing = await prisma.articleLike.findUnique({
    where: { userId_articleId: { userId, articleId } },
  });

  if (existing) {
    await prisma.articleLike.delete({
      where: { userId_articleId: { userId, articleId } },
    });
    return false;
  }

  await prisma.articleLike.create({
    data: { userId, articleId },
  });
  return true;
}
