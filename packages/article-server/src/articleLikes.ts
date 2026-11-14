/** Persistence-owned atomic like toggle. Eligibility is checked by the caller's Core policy. */
import { prisma } from "@gafus/prisma";

export async function articleExists(articleId: string): Promise<boolean> {
  if (!articleId) return false;
  return Boolean(await prisma.article.findUnique({where:{id:articleId},select:{id:true}}));
}

/**
 * Rows are identified by the (actor, article) composite unique constraint.
 * An advisory *transaction* lock serializes concurrent toggles for precisely
 * this pair, including first like when there is no row to row-lock.
 * A hash collision can at most add contention; it cannot authorize another user.
 */
export async function toggleArticleLikeAtomic(userId: string, articleId: string): Promise<boolean> {
  if (!userId || !articleId) throw new Error("ARTICLE_LIKE_ACTOR_OR_ARTICLE_MISSING");
  return prisma.$transaction(async (tx) => {
    const lockKey = `${userId.length}:${userId}:${articleId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0::bigint))::text AS "locked"`;
    const where = { userId_articleId: {userId, articleId} };
    const existing = await tx.articleLike.findUnique({where,select:{userId:true}});
    if (existing) {
      await tx.articleLike.delete({where});
      return false;
    }
    await tx.articleLike.create({data:{userId,articleId}});
    return true;
  });
}
