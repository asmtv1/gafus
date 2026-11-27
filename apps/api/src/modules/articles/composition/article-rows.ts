import { resolveArticleEntitlement } from "../../content-access/composition/content-policy-instance.js";
/**
 * Explicit SQL composition for article reads, paid-access DTO policy,
 * author editor projections and unique-view transactions.
 */
import {
  getArticles as coreCatalog,
  getArticleBySlug as coreBySlug,
  getArticleBySlugForMonetizedAccess as coreDetail,
  getArticleForEdit as coreEdit,
  createArticle as coreCreate,
  incrementArticleView as coreView,
  getArticleViewersForAuthor as coreViewers,
  type ArticleReadPort,
  type IncrementArticleViewOptions,
} from "@gafus/core/services/article";
import type { MonetizedAccessPlatform } from "@gafus/core/services/rewardedCredits";
import {
  readArticleCatalogRows,
  readArticleGrantRows,
  readArticleDetailRow,
  readArticleForEditRow,
  readArticleIdBySlug,
  readArticleViewersForAuthorRow,
  createArticleRow,
  recordArticleViewRow,
} from "@gafus/article-server/article-rows";

const rows: ArticleReadPort = {
  readArticleCatalogRows,
  readArticleGrantRows,
  readArticleDetailRow,
  readArticleForEditRow,
  readArticleIdBySlug,
  readArticleViewersForAuthorRow,
  createArticleRow,
  recordArticleViewRow,
};

export function getArticles(userId?: string, take = 50, skip = 0, authorId?: string) {
  return coreCatalog(rows, resolveArticleEntitlement, userId, take, skip, authorId);
}
export function getArticleBySlug(slug: string, userId?: string) {
  return coreBySlug(rows, resolveArticleEntitlement, slug, userId);
}
export function getArticleBySlugForMonetizedAccess(input: {
  slug: string;
  userId?: string;
  platform: MonetizedAccessPlatform;
}) {
  return coreDetail(rows, resolveArticleEntitlement, input);
}
export function getArticleForEdit(id: string, userId: string) {
  return coreEdit(rows, id, userId);
}
export function createArticle(input: Record<string, unknown>, userId: string) {
  return coreCreate(rows, input, userId);
}
export function incrementArticleView(slug: string, options?: IncrementArticleViewOptions) {
  return coreView(rows, slug, options);
}
export function getArticleViewersForAuthor(articleId: string, authorId: string) {
  return coreViewers(rows, articleId, authorId);
}
