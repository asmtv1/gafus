import { Prisma } from "@gafus/prisma";
import type { FeedDb } from "./ports";
import { retrieveSmartCandidates } from "./smart-retrieval";
import { scoreSmartMl, toSmartMlVector, type SmartMlModel } from "./smart-ml";
import {
  calculateSmartFeedScore, jaccardSimilarity, normalizeSmartText, normalizeSmartBreed,
  rerankSmartFeed, smartAffinity, smartExploration,
  type RankedSmartPost, type SmartFeedSignals,
} from "./smart-ranking";

/**
 * Build a bounded, server-only recommendation snapshot.
 * Uses only visible posts and pets the authors chose to show in their profiles.
 */
export async function rankSmartCandidates(
  db: FeedDb, viewerId: string, at: Date,
  preferences: {
    useCity: boolean; usePets: boolean; useBehavior: boolean; exploration: boolean;
    historyResetAt?: Date | null;
    multiSource?: boolean;
    mlModel?: SmartMlModel | null;
  },
): Promise<RankedSmartPost[]> {
  const since = preferences.historyResetAt;
  const recentlySeenSince = new Date(Math.max(
    at.getTime() - 7 * 86_400_000, since?.getTime() ?? 0,
  ));
  const posts = preferences.multiSource ? await retrieveSmartCandidates(db, viewerId, at, preferences) : await db.feedPost.findMany({
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
  if (!posts.length) return [];
  const postIds = posts.map(post => post.id);
  const authorIds = [...new Set(posts.map(post => post.authorId))];
  const [viewer, authors, stats, seen, impressions, reactions, comments, bookmarks, views] = await Promise.all([
    db.user.findUnique({ where: { id: viewerId }, select: {
      profile: { select: { city: true } }, pets: { select: { type: true, breed: true } },
    } }),
    db.user.findMany({ where: { id: { in: authorIds } }, select: {
      id: true, profile: { select: { city: true } },
      pets: { where: { showInProfile: true }, select: { type: true, breed: true } },
    } }),
    db.$queryRaw<{ postId: string; reactions: number; uniqueCommenters: number; bookmarks: number; impressions: number }[]>(Prisma.sql`
      WITH fresh AS (
        SELECT s.* FROM "FeedPostStats" s
        WHERE s."postId" IN (${Prisma.join(postIds)})
          AND s."updatedAt" >= ${new Date(at.getTime() - 5 * 60_000)}
      )
      SELECT p."id" AS "postId",
             COALESCE(s."reactionCount", r.n, 0)::integer AS reactions,
             COALESCE(s."uniqueCommenterCount", c.n, 0)::integer AS "uniqueCommenters",
             COALESCE(s."bookmarkCount", b.n, 0)::integer AS bookmarks,
             COALESCE(s."qualifiedImpressionCount", 0)::integer AS impressions
      FROM "FeedPost" p
      LEFT JOIN fresh s ON s."postId" = p."id"
      LEFT JOIN (
        SELECT r."postId", COUNT(*)::integer AS n
        FROM "FeedPostReaction" r
        JOIN "FeedPost" post ON post."id" = r."postId"
        LEFT JOIN fresh f ON f."postId" = r."postId"
        WHERE r."postId" IN (${Prisma.join(postIds)}) AND f."postId" IS NULL
          AND r."userId" <> post."authorId"
        GROUP BY r."postId"
      ) r ON r."postId" = p."id"
      LEFT JOIN (
        SELECT c."postId", COUNT(DISTINCT c."authorId")::integer AS n
        FROM "FeedComment" c
        JOIN "FeedPost" post ON post."id" = c."postId"
        LEFT JOIN fresh f ON f."postId" = c."postId"
        WHERE c."postId" IN (${Prisma.join(postIds)})
          AND f."postId" IS NULL
          AND c."deletedAt" IS NULL AND c."moderationState" = 'visible'
          AND c."authorId" <> post."authorId"
        GROUP BY c."postId"
      ) c ON c."postId" = p."id"
      LEFT JOIN (
        SELECT b."postId", COUNT(*)::integer AS n
        FROM "FeedBookmark" b
        JOIN "FeedPost" post ON post."id" = b."postId"
        LEFT JOIN fresh f ON f."postId" = b."postId"
        WHERE b."postId" IN (${Prisma.join(postIds)}) AND f."postId" IS NULL
          AND b."userId" <> post."authorId"
        GROUP BY b."postId"
      ) b ON b."postId" = p."id"
      WHERE p."id" IN (${Prisma.join(postIds)})
    `),
    db.feedPostView.findMany({ where: { userId: viewerId,
      postId: { in: postIds }, createdAt: { gte: recentlySeenSince },
    }, select: { postId: true } }),
    db.feedImpression.groupBy({ by: ["postId"], where: {
      userId: viewerId, postId: { in: postIds },
      occurredAt: { gte: recentlySeenSince },
    } }),
    preferences.useBehavior ? db.feedPostReaction.findMany({ where: {
      userId: viewerId, post: { authorId: { in: authorIds } },
      ...(since ? { createdAt: { gte: since } } : {}),
    }, select: { createdAt: true, post: { select: { authorId: true } } },
    orderBy: { createdAt: "desc" }, take: 1500 }) : Promise.resolve([]),
    preferences.useBehavior ? db.feedComment.findMany({ where: {
      authorId: viewerId, deletedAt: null, moderationState: "visible",
      post: { authorId: { in: authorIds } },
      ...(since ? { createdAt: { gte: since } } : {}),
    }, select: { createdAt: true, post: { select: { authorId: true } } },
    orderBy: { createdAt: "desc" }, take: 1500 }) : Promise.resolve([]),
    preferences.useBehavior ? db.feedBookmark.findMany({ where: {
      userId: viewerId, post: { authorId: { in: authorIds } },
      ...(since ? { createdAt: { gte: since } } : {}),
    }, select: { createdAt: true, post: { select: { authorId: true } } },
    orderBy: { createdAt: "desc" }, take: 1500 }) : Promise.resolve([]),
    preferences.useBehavior ? db.feedPostView.findMany({ where: {
      userId: viewerId, post: { authorId: { in: authorIds } },
      ...(since ? { createdAt: { gte: since } } : {}),
    }, select: { createdAt: true, post: { select: { authorId: true } } },
    orderBy: { createdAt: "desc" }, take: 1500 }) : Promise.resolve([]),
  ]);
  const viewerCity = normalizeSmartText(viewer?.profile?.city);
  const viewerTypes = new Set((viewer?.pets ?? []).map(p => p.type));
  const viewerBreeds = new Set((viewer?.pets ?? []).map(p => normalizeSmartBreed(p.breed)).filter((v): v is string => !!v));
  const authorById = new Map(authors.map(author => [author.id, author]));
  const byPost = new Map(stats.map(entry => [entry.postId, entry]));
  const seenIds = new Set([...seen, ...impressions].map(view => view.postId));
  const rawAffinity = new Map<string, number>();
  const weightEvent = (authorId: string, createdAt: Date, weight: number) => {
    if (authorId === viewerId) return;
    const daysAgo = Math.max(0, (at.getTime() - createdAt.getTime()) / 86_400_000);
    rawAffinity.set(authorId, (rawAffinity.get(authorId) ?? 0) +
      weight * Math.exp(-Math.LN2 * daysAgo / 30));
  };
  for (const reaction of reactions) weightEvent(reaction.post.authorId, reaction.createdAt, 1.5);
  for (const comment of comments) weightEvent(comment.post.authorId, comment.createdAt, 2.5);
  for (const bookmark of bookmarks) weightEvent(bookmark.post.authorId, bookmark.createdAt, 3);
  for (const view of views) weightEvent(view.post.authorId, view.createdAt, 0.2);
  if (preferences.useBehavior && process.env.FEED_SMART_AFFINITY_ENABLED === "true") {
    const materialized = await db.feedUserAuthorAffinity.findMany({
      where: {
        userId: viewerId, authorId: { in: authorIds },
        updatedAt: { gte: new Date(Math.max(at.getTime() - 30 * 60_000, since?.getTime() ?? 0)) },
      },
      select: { authorId: true, score: true },
    });
    for (const row of materialized) {
      if (row.authorId !== viewerId && Number.isFinite(row.score)) {
        rawAffinity.set(row.authorId, Math.max(rawAffinity.get(row.authorId) ?? 0, row.score));
      }
    }
  }

  const signals: SmartFeedSignals = {
    city: preferences.useCity && !!viewerCity,
    pets: preferences.usePets && viewerTypes.size > 0,
    behavior: preferences.useBehavior && rawAffinity.size > 0,
    exploration: preferences.exploration,
    seen: preferences.useBehavior,
  };
  const bucket = at.toISOString().slice(0, 10);
  const rows = posts.map(post => {
    const author = authorById.get(post.authorId);
    const authorTypes = new Set((author?.pets ?? []).map(p => p.type));
    const authorBreeds = new Set((author?.pets ?? []).map(p => normalizeSmartBreed(p.breed)).filter((v): v is string => !!v));
    const s = byPost.get(post.id);
    const f = {
      ageHours: (at.getTime() - (post.publishedAt ?? at).getTime()) / 3_600_000,
      cityMatch: viewerCity && viewerCity === normalizeSmartText(author?.profile?.city) ? 1 : 0,
      petTypeOverlap: jaccardSimilarity(viewerTypes, authorTypes),
      breedOverlap: jaccardSimilarity(viewerBreeds, authorBreeds),
      authorAffinity: smartAffinity(rawAffinity.get(post.authorId) ?? 0, 0),
      reactions: s?.reactions ?? 0,
      uniqueCommenters: s?.uniqueCommenters ?? 0,
      bookmarks: s?.bookmarks ?? 0,
      exploration: smartExploration(viewerId, post.id, bucket),
      seenRecently: seenIds.has(post.id),
    };
    // Disabled preferences must not contribute features used by a future ML model.
    const safeFeatures = {
      ...f,
      cityMatch: signals.city ? f.cityMatch : 0,
      petTypeOverlap: signals.pets ? f.petTypeOverlap : 0,
      breedOverlap: signals.pets ? f.breedOverlap : 0,
      authorAffinity: signals.behavior ? f.authorAffinity : 0,
      seenRecently: signals.seen ? f.seenRecently : false,
    };
    const score = calculateSmartFeedScore(safeFeatures, signals);
    const sourceFlags = "sources" in post && Array.isArray(post.sources) ? post.sources : ["recent"];
    const mlFeatures = toSmartMlVector(safeFeatures, s?.impressions ?? 0, sourceFlags);
    const mlScore = preferences.mlModel ? scoreSmartMl(preferences.mlModel, mlFeatures) : null;
    return {
      id: post.id, authorId: post.authorId,
      publishedAt: post.publishedAt ?? at,
      score: mlScore == null ? score.score : score.score * 0.3 + mlScore * 0.7,
      reason: score.reason,
      discovery: !rawAffinity.has(post.authorId),
      sources: sourceFlags,
      mlFeatures,
    };
  });
  return rerankSmartFeed(rows, 200, preferences.exploration);
}
