/**
 * ArticleLike Service — переключение лайка статьи.
 */
import { prisma } from "@gafus/prisma";

import type { MonetizedAccessPlatform } from "../rewardedCredits";
import { SubscriptionOrCreditsRequiredError } from "../rewardedCredits";
import { resolveArticleEntitlement } from "../contentAccess/policy";

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
    where: { id: input.articleId }, select: { id: true },
  });
  if (!article) throw new Error("ARTICLE_NOT_FOUND");
  const access = await resolveArticleEntitlement(article.id, input.userId, input.platform);
  if (!access.allowed) throw new SubscriptionOrCreditsRequiredError();
  return toggleArticleLike(input.userId, article.id);
}
