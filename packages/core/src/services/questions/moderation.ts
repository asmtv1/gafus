import { prisma } from "@gafus/prisma";
import type { QuestionModerationDto } from "@gafus/types";
import { z } from "zod";
import { requireQuestionAdmin } from "./service";
import { QuestionError } from "./errors";
export async function getQuestionModeration(
  userId: string,
  page = 1,
): Promise<QuestionModerationDto> {
  await requireQuestionAdmin(userId);
  page = z.number().int().min(1).max(10000).parse(page);
  const rows = await prisma.questionReport.findMany({
    where: { resolvedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    skip: (page - 1) * 30,
    take: 31,
    include: {
      question: { include: { author: { include: { profile: true } }, photos: true } },
      answer: { include: { author: { include: { profile: true } }, photos: true } },
      reporter: { include: { profile: true } },
    },
  });
  const blocks = await prisma.questionBlock.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { username: true, profile: { select: { fullName: true } } } } },
  });
  const author = (row: (typeof rows)[number]["reporter"]) => ({
    id: row.id,
    name: row.profile?.fullName || row.username,
    avatarUrl: row.profile?.avatarUrl ?? null,
  });
  return {
    reports: rows.slice(0, 30).map((r) => ({
      id: r.id,
      reason: r.reason,
      details: r.details,
      createdAt: r.createdAt.toISOString(),
      questionId: r.questionId,
      questionTitle: r.question.title,
      photos: (r.answer?.photos ?? r.question.photos).map((photo) => ({
        id: photo.id,
        url: photo.url,
      })),
      answerId: r.answerId,
      body: r.answer?.body ?? r.question.body,
      author: author(r.answer?.author ?? r.question.author),
      reporter: author(r.reporter),
      hidden: !!(r.answer ? r.answer.hiddenAt : r.question.hiddenAt),
    })),
    nextPage: rows.length > 30 ? page + 1 : null,
    blocks: blocks.map((b) => ({
      userId: b.userId,
      name: b.user.profile?.fullName || b.user.username,
      reason: b.reason,
    })),
  };
}
const moderationSchema = z.object({
  reportId: z.string().min(1),
  action: z.enum(["dismiss", "hide", "delete", "close", "block"]),
  reason: z.string().trim().min(1).max(1000).default("Нарушение правил раздела"),
});
export async function moderateQuestionReport(userId: string, input: unknown) {
  const data = moderationSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await requireQuestionAdmin(userId, tx);
    const report = await tx.questionReport.findUnique({
      where: { id: data.reportId },
      include: { answer: true, question: true },
    });
    if (!report) throw new QuestionError("NOT_FOUND", "Жалоба не найдена", 404);
    if (report.resolvedAt) return { id: report.id };
    const targetUserId = report.answer?.authorId ?? report.question.authorId;
    // Match publication lock order: User first, Question second.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${targetUserId} FOR NO KEY UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Question" WHERE id = ${report.questionId} FOR UPDATE`;
    if (data.action === "block")
      await tx.questionBlock.upsert({
        where: { userId: targetUserId },
        create: { userId: targetUserId, reason: data.reason },
        update: { reason: data.reason },
      });
    if (data.action === "hide" || data.action === "delete") {
      const removal = data.action === "hide" ? { hiddenAt: new Date() } : { deletedAt: new Date() };
      if (report.answerId) {
        await tx.questionAnswer.update({ where: { id: report.answerId }, data: removal });
        await tx.question.updateMany({
          where: { id: report.questionId, bestAnswerId: report.answerId },
          data: { bestAnswerId: null },
        });
      } else
        await tx.question.update({
          where: { id: report.questionId },
          data: { ...removal, bestAnswerId: null },
        });
    }
    if (data.action === "close")
      await tx.question.update({
        where: { id: report.questionId },
        data: { closedAt: new Date() },
      });
    await tx.questionReport.updateMany({
      where: { targetKey: report.targetKey, resolvedAt: null },
      data: { resolvedAt: new Date(), resolution: `${data.action}: ${data.reason}` },
    });
    return { id: report.id };
  });
}
export async function unblockQuestionsUser(actorId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    await requireQuestionAdmin(actorId, tx);
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE`;
    await tx.questionBlock.deleteMany({ where: { userId } });
    return { userId };
  });
}
