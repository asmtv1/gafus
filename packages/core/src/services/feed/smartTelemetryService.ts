import { prisma, type Prisma } from "@gafus/prisma";
import { FeedError } from "./errors";

/** Smart-feed reads and writes are owned by core; HTTP/Redis transport stays in its adapter. */
export async function hasSmartFeedActor(userId: string): Promise<boolean> {
  return Boolean(await prisma.user.findUnique({
    where: { id: userId }, select: { id: true },
  }));
}

export async function getSmartFeedTelemetryPreference(userId: string) {
  return prisma.feedPersonalizationPreference.findUnique({ where: { userId } });
}

export async function eligibleSmartImpressionPostIds(userId: string, postIds: string[]) {
  const rows = await prisma.feedPost.findMany({
    where: {
      id: { in: postIds },
      status: "published", deletedAt: null, moderationState: "visible",
      feedback: { none: { userId, kind: "not_interested" } },
      author: { feedSubscribers: { none: { userId, hidden: true } } },
    },
    select: { id: true },
  });
  return rows.map(row => row.id);
}

export async function recordSmartFeedImpressions(data: Prisma.FeedImpressionCreateManyInput[]) {
  const result = await prisma.feedImpression.createMany({ data, skipDuplicates: true });
  return result.count;
}

export async function eligibleSmartOutcomePostIds(userId: string, postIds: string[]) {
  const rows = await prisma.feedPost.findMany({
    where: {
      id: { in: postIds }, authorId: { not: userId },
      status: "published", moderationState: "visible", deletedAt: null,
      feedback: { none: { userId, kind: "not_interested" } },
      author: { feedSubscribers: { none: { userId, hidden: true } } },
    },
    select: { id: true },
  });
  return rows.map(row => row.id);
}

export async function getQualifiedSmartImpressions(
  userId: string,
  pairs: { postId: string; rankingSessionId: string }[],
) {
  return prisma.feedImpression.findMany({
    where: { userId, OR: pairs },
    select: { postId: true, rankingSessionId: true },
  });
}

export async function recordSmartFeedRankingEvents(data: Prisma.FeedRankingEventCreateManyInput[]) {
  const result = await prisma.feedRankingEvent.createMany({ data, skipDuplicates: true });
  return result.count;
}

export async function storeSmartFeedPostFeedback(input: {
  actorId: string; postId: string; kind: "not_interested" | "show_more";
}): Promise<{ saved: true }> {
  const post = await prisma.feedPost.findFirst({
    where: {
      id: input.postId, status: "published", deletedAt: null, moderationState: "visible",
      author: { feedSubscribers: { none: { userId: input.actorId, hidden: true } } },
    },
    select: { id: true },
  });
  if (!post) throw new FeedError("NOT_FOUND", undefined, 404);
  await prisma.feedUserPostFeedback.upsert({
    where: { userId_postId_kind: { userId: input.actorId, postId: input.postId, kind: input.kind } },
    create: { userId: input.actorId, postId: input.postId, kind: input.kind },
    update: {},
  });
  return { saved: true };
}
