/** Trainer article SQL mutations retain actor-fenced UPDATE/DELETE WHERE clauses. */
import {
  updateArticle as coreUpdate,
  deleteArticle as coreDelete,
  type ArticleOwnerWritesPort,
} from "@gafus/core/services/article";
import { getArticleAuthorId, updateOwnedArticle, deleteOwnedArticle } from "@gafus/article-server";

const writes: ArticleOwnerWritesPort = {
  getArticleAuthorId,
  updateOwnedArticle,
  deleteOwnedArticle,
};
export function updateArticle(id: string, input: Record<string, unknown>, actorId: string) {
  return coreUpdate(id, input, actorId, writes);
}
export function deleteArticle(id: string, actorId: string) {
  return coreDelete(id, actorId, writes);
}
