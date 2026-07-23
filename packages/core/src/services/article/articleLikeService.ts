/**
 * ArticleLike Service — переключение лайка статьи.
 */
import { prisma } from "@gafus/prisma";

import {
  getPremiumOrRewardedAccess,
  REWARDED_ARTICLE_COST,
  type MonetizedAccessPlatform,
} from "../rewardedCredits";

/**
 * Переключает лайк статьи пользователем.
 * @returns true если лайк поставлен, false если снят
 */
export async function toggleArticleLike(userId: string, articleId: string): Promise<boolean> {
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

export async function toggleArticleLikeWithMonetizedAccess(input: {
  userId: string;
  articleId: string;
  platform: MonetizedAccessPlatform;
}): Promise<boolean> {
  const article = await prisma.article.findUnique({
    where: { id: input.articleId },
    select: {
      id: true,
      access: {
        where: { userId: input.userId },
        select: { userId: true },
      },
    },
  });
  if (!article) {
    throw new Error("ARTICLE_NOT_FOUND");
  }

  if (article.access.length === 0) {
    await getPremiumOrRewardedAccess({
      userId: input.userId,
      platform: input.platform,
      target: {
        targetType: "ARTICLE",
        targetId: article.id,
        cost: REWARDED_ARTICLE_COST,
      },
    });
  }

  return toggleArticleLike(input.userId, article.id);
}
