/** Article writes are rechecked for ownership by the mutating SQL statement. */
import { prisma, type Prisma } from "@gafus/prisma";

export async function getArticleAuthorId(articleId: string): Promise<string | null> {
  const row = await prisma.article.findUnique({
    where: {id:articleId}, select:{authorId:true},
  });
  return row?.authorId ?? null;
}

export async function updateOwnedArticle(
  articleId: string, authenticatedAuthorId: string, changes: Prisma.ArticleUpdateManyMutationInput,
): Promise<boolean> {
  if (!articleId || !authenticatedAuthorId) return false;
  const result = await prisma.article.updateMany({
    where: {id:articleId,authorId:authenticatedAuthorId}, data:changes,
  });
  return result.count === 1;
}

export async function deleteOwnedArticle(articleId: string, authenticatedAuthorId: string): Promise<boolean> {
  if (!articleId || !authenticatedAuthorId) return false;
  const result = await prisma.article.deleteMany({
    where: {id:articleId,authorId:authenticatedAuthorId},
  });
  return result.count === 1;
}
