import type { PrismaClient } from "@gafus/prisma";

/** Клиент Prisma внутри интерактивной транзакции. */
export type PrismaTransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export async function grantCourseAccessInTransaction(
  tx: PrismaTransactionClient,
  params: { userId: string; courseId: string },
): Promise<void> {
  await tx.courseAccess.upsert({
    where: { courseId_userId: { courseId: params.courseId, userId: params.userId } },
    create: { courseId: params.courseId, userId: params.userId },
    update: {},
  });
}

export async function grantArticleAccessInTransaction(
  tx: PrismaTransactionClient,
  params: { userId: string; articleId: string },
): Promise<void> {
  await tx.articleAccess.upsert({
    where: { articleId_userId: { articleId: params.articleId, userId: params.userId } },
    create: { articleId: params.articleId, userId: params.userId },
    update: {},
  });
}
