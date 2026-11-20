/** All Smart Feed ranking signal SQL, owner predicates, source and caps,
 * executed in feed-server. Core receives no table delegates/Prisma types. */
import { prisma, type Prisma } from "@gafus/prisma";
import type { SmartRankingSnapshotPort } from "@gafus/core/services/feed";
export function createSmartRankingRows(db: Prisma.TransactionClient): SmartRankingSnapshotPort {
  return {
  async readRecent(viewerId,at) {

    return await db.feedPost.findMany({
    where: {
      status: "published", deletedAt: null, moderationState: "visible",
      publishedAt: { gte: new Date(at.getTime() - 14 * 86_400_000) },
      feedback: { none: { userId: viewerId, kind: "not_interested" } },
      author: { feedSubscribers: { none: { userId: viewerId, hidden: true } } },
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: 400,
    select: { id: true, authorId: true, publishedAt: true },
  });
  },
  async readSignals(viewerId,at,postIds,authorIds,options) {

    const since=options.historyResetAt;
    const recentlySeenSince=new Date(Math.max(
      at.getTime()-7*86_400_000,since?.getTime()??0,
    ));
    const [viewer, authors, seen, impressions, reactions, comments, bookmarks, views] = await Promise.all([
    db.user.findUnique({ where: { id: viewerId }, select: {
      profile: { select: { city: true } }, pets: { select: { type: true, breed: true } },
    } }),
    db.user.findMany({ where: { id: { in: [...authorIds] } }, select: {
      id: true, profile: { select: { city: true } },
      pets: { where: { showInProfile: true }, select: { type: true, breed: true } },
    } }),
    db.feedPostView.findMany({ where: { userId: viewerId,
      postId: { in: [...postIds] }, createdAt: { gte: recentlySeenSince },
    }, select: { postId: true } }),
    db.feedImpression.groupBy({ by: ["postId"], where: {
      userId: viewerId, postId: { in: [...postIds] },
      occurredAt: { gte: recentlySeenSince },
    } }),
    options.useBehavior ? db.feedPostReaction.findMany({ where: {
      userId: viewerId, post: { authorId: { in: [...authorIds] } },
      ...(since ? { createdAt: { gte: since } } : {}),
    }, select: { createdAt: true, post: { select: { authorId: true } } },
    orderBy: { createdAt: "desc" }, take: 1500 }) : Promise.resolve([]),
    options.useBehavior ? db.feedComment.findMany({ where: {
      authorId: viewerId, deletedAt: null, moderationState: "visible",
      post: { authorId: { in: [...authorIds] } },
      ...(since ? { createdAt: { gte: since } } : {}),
    }, select: { createdAt: true, post: { select: { authorId: true } } },
    orderBy: { createdAt: "desc" }, take: 1500 }) : Promise.resolve([]),
    options.useBehavior ? db.feedBookmark.findMany({ where: {
      userId: viewerId, post: { authorId: { in: [...authorIds] } },
      ...(since ? { createdAt: { gte: since } } : {}),
    }, select: { createdAt: true, post: { select: { authorId: true } } },
    orderBy: { createdAt: "desc" }, take: 1500 }) : Promise.resolve([]),
    options.useBehavior ? db.feedPostView.findMany({ where: {
      userId: viewerId, post: { authorId: { in: [...authorIds] } },
      ...(since ? { createdAt: { gte: since } } : {}),
    }, select: { createdAt: true, post: { select: { authorId: true } } },
    orderBy: { createdAt: "desc" }, take: 1500 }) : Promise.resolve([]),
  ]);
    const materialized=options.materializedAffinity
      ? await db.feedUserAuthorAffinity.findMany({
        where:{userId:viewerId,authorId:{in:[...authorIds]},
          updatedAt:{gte:new Date(Math.max(at.getTime()-30*60_000,since?.getTime()??0))}},
        select:{authorId:true,score:true},
      }) : [];
    return {viewer,authors,seen,impressions,reactions,comments,bookmarks,views,materialized};
  },
  };
}

export const smartRankingRows: SmartRankingSnapshotPort = createSmartRankingRows(prisma);
