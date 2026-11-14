import { prisma } from "@gafus/prisma";

/** Never trust a client-supplied reactions number, and never expose owner stats to others. */
export async function getGafusPostReactionProgress(userId: string, postId: string) {
  const post = await prisma.feedPost.findFirst({
    where: { id: postId, authorId: userId, status: "published", deletedAt: null },
    select: { id: true },
  });
  if (!post) return null;
  const program = await prisma.gafusPostReactionProgram.findUnique({
    where: { postId: post.id },
  });
  if (!program) return null;
  const current = await prisma.feedPostReaction.count({
    where: { postId: post.id, userId: { not: userId } },
  });
  const threshold = program.thresholdStep;
  const nextThreshold = (Math.floor(program.highWaterReactionCount / threshold) + 1) * threshold;
  return {
    postId: post.id,
    current,
    highWater: program.highWaterReactionCount,
    nextThreshold,
    thresholdStep: threshold,
    progress: Math.min(1, Math.max(0, current - (nextThreshold - threshold)) / threshold),
  };
}
