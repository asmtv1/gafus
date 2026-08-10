/**
 * ArticleLike Service — переключение лайка статьи.
 */
import { prisma } from "@gafus/prisma";

import {
  getPremiumOrRewardedAccess,
  SubscriptionOrCreditsRequiredError,
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
      visibility: true,
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
    if (article.visibility === "PAID") {
      throw new SubscriptionOrCreditsRequiredError();
    }
    await getPremiumOrRewardedAccess({
      userId: input.userId,
      platform: input.platform,
      target: {
        targetType: "ARTICLE",
        targetId: article.id,
      },
    });
  }

  return toggleArticleLike(input.userId, article.id);
}
