/**
 * Core article-like entitlement policy. Atomic mutation and the article
 * existence query are SQL-backed ports owned by API composition.
 */
import type { MonetizedAccessPlatform } from "../rewardedCredits";
import { SubscriptionOrCreditsRequiredError } from "../rewardedCredits";
import { resolveArticleEntitlement } from "../contentAccess/policy";

export interface ArticleLikePorts {
  articleExists(articleId: string): Promise<boolean>;
  toggleArticleLikeAtomic(userId: string, articleId: string): Promise<boolean>;
}

export interface ArticleLikeInput {
  userId: string;
  articleId: string;
  platform: MonetizedAccessPlatform;
}

/** Never mutate or even check the protected like row unless Core paywall
 * authorizes the precise actor/article/platform occurrence.
 */
export async function toggleArticleLikeWithMonetizedAccess(
  input: ArticleLikeInput,
  ports: ArticleLikePorts,
): Promise<boolean> {
  if (!(await ports.articleExists(input.articleId))) throw new Error("ARTICLE_NOT_FOUND");
  const access = await resolveArticleEntitlement(input.articleId, input.userId, input.platform);
  if (!access.allowed) throw new SubscriptionOrCreditsRequiredError();
  return ports.toggleArticleLikeAtomic(input.userId, input.articleId);
}
