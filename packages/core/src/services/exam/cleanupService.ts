import { prisma } from "@gafus/prisma";

/** Business retention periods for exam videos, independent of worker scheduling. */
export const EXAM_VIDEO_RETENTION_DAYS = {
  completed: 30,
  inProgress: 90,
} as const;

export async function listExamVideosEligibleForCleanup(now = new Date()) {
  const completedBefore = new Date(now.getTime() - EXAM_VIDEO_RETENTION_DAYS.completed * 86_400_000);
  const pendingBefore = new Date(now.getTime() - EXAM_VIDEO_RETENTION_DAYS.inProgress * 86_400_000);
  const select = {
    id: true, userStepId: true, videoReportUrl: true,
    userStep: {
      select: {
        status: true,
        userTraining: { select: { user: { select: { username: true } } } },
      },
    },
  } as const;
  const [completed, pending] = await Promise.all([
    prisma.examResult.findMany({
      where: {
        videoReportUrl: { not: null },
        videoDeletedAt: null,
        userStep: { status: "COMPLETED" },
        updatedAt: { lt: completedBefore },
      },
      select,
    }),
    prisma.examResult.findMany({
      where: {
        videoReportUrl: { not: null },
        videoDeletedAt: null,
        userStep: { status: "IN_PROGRESS" },
        createdAt: { lt: pendingBefore },
      },
      select,
    }),
  ]);
  return { completed, pending };
}

/** Idempotent record update: only clear the video that was actually deleted. */
export async function markExpiredExamVideoDeleted(input: {
  userStepId: string;
  expectedUrl: string;
  reason: string;
  deletedAt: Date;
}): Promise<boolean> {
  const result = await prisma.examResult.updateMany({
    where: {
      userStepId: input.userStepId,
      videoReportUrl: input.expectedUrl,
      videoDeletedAt: null,
    },
    data: {
      videoReportUrl: null,
      videoDeletedAt: input.deletedAt,
      videoDeleteReason: input.reason,
    },
  });
  return result.count === 1;
}
