import type { Prisma } from "@gafus/prisma";
import type { FeedDb } from "./ports";
import { normalizeSmartText, normalizeSmartBreed } from "./smart-ranking";

export const SMART_SOURCES = ["recent", "local", "pet", "affinity", "trending"] as const;
export type SmartCandidateSource = (typeof SMART_SOURCES)[number];
export interface SmartCandidate {
  id: string;
  authorId: string;
  publishedAt: Date | null;
  sources: SmartCandidateSource[];
}
export interface SmartRetrievalOptions {
  useCity: boolean;
  usePets: boolean;
  useBehavior: boolean;
  historyResetAt?: Date | null;
}

type PostProjection = { id: string; authorId: string; publishedAt: Date | null };
const projection = { id: true, authorId: true, publishedAt: true } as const;

export function mergeSmartSources(
  groups: ReadonlyArray<{ source: SmartCandidateSource; posts: readonly PostProjection[] }>,
  limit = 500,
): SmartCandidate[] {
  const merged = new Map<string, SmartCandidate>();
  for (const group of groups) {
    for (const post of group.posts) {
      const existing = merged.get(post.id);
      if (existing) {
        if (!existing.sources.includes(group.source)) existing.sources.push(group.source);
      } else if (merged.size < limit) {
        merged.set(post.id, { ...post, sources: [group.source] });
      }
    }
  }
  return [...merged.values()];
}

/** Multi-source retrieval with hard safety filters applied to every source. */
export async function retrieveSmartCandidates(
  db: FeedDb, viewerId: string, at: Date, options: SmartRetrievalOptions,
): Promise<SmartCandidate[]> {
  const [viewer, affinityRows, liked, commented, saved, viewed] = await Promise.all([
    db.user.findUnique({
      where: { id: viewerId },
      select: {
        profile: { select: { city: true } },
        pets: { select: { type: true, breed: true } },
      },
    }),
    options.useBehavior
      ? db.feedUserAuthorAffinity.findMany({
        where: { userId: viewerId, ...(options.historyResetAt
          ? { updatedAt: { gte: options.historyResetAt } } : {}) },
        orderBy: { score: "desc" }, take: 100, select: { authorId: true },
      }) : Promise.resolve([]),
    options.useBehavior
      ? db.feedPostReaction.findMany({
        where: { userId: viewerId, ...(options.historyResetAt
          ? { createdAt: { gte: options.historyResetAt } } : {}) },
        orderBy: { createdAt: "desc" }, take: 100,
        select: { post: { select: { authorId: true } } },
      }) : Promise.resolve([]),
    options.useBehavior
      ? db.feedComment.findMany({
        where: { authorId: viewerId, deletedAt: null, moderationState: "visible",
          ...(options.historyResetAt ? { createdAt: { gte: options.historyResetAt } } : {}) },
        orderBy: { createdAt: "desc" }, take: 100,
        select: { post: { select: { authorId: true } } },
      }) : Promise.resolve([]),
    options.useBehavior
      ? db.feedBookmark.findMany({
        where: { userId: viewerId, ...(options.historyResetAt
          ? { createdAt: { gte: options.historyResetAt } } : {}) },
        orderBy: { createdAt: "desc" }, take: 100,
        select: { post: { select: { authorId: true } } },
      }) : Promise.resolve([]),
    options.useBehavior
      ? db.feedPostView.findMany({
        where: { userId: viewerId, ...(options.historyResetAt
          ? { createdAt: { gte: options.historyResetAt } } : {}) },
        orderBy: { createdAt: "desc" }, take: 100,
        select: { post: { select: { authorId: true } } },
      }) : Promise.resolve([]),
  ]);
  const cityKey = options.useCity ? normalizeSmartText(viewer?.profile?.city) : null;
  const petTypes = options.usePets ? [...new Set((viewer?.pets ?? []).map(pet => pet.type))] : [];
  const breeds = options.usePets
    ? [...new Set((viewer?.pets ?? []).map(pet => normalizeSmartBreed(pet.breed))
        .filter((value): value is string => !!value))] : [];
  const affinityAuthors = [...new Set([
    ...affinityRows.map(row => row.authorId),
    ...liked.map(row => row.post.authorId),
    ...commented.map(row => row.post.authorId),
    ...saved.map(row => row.post.authorId),
    ...viewed.map(row => row.post.authorId),
  ])].filter(id => id !== viewerId).slice(0, 100);
  const since = new Date(at.getTime() - 30 * 86_400_000);
  const hard: Prisma.FeedPostWhereInput = {
    status: "published", deletedAt: null, moderationState: "visible",
    publishedAt: { gte: since, lte: at },
    feedback: { none: { userId: viewerId, kind: "not_interested" } },
    author: { feedSubscribers: { none: { userId: viewerId, hidden: true } } },
  };
  const recent: Prisma.FeedPostWhereInput = {
    ...hard, publishedAt: { gte: new Date(at.getTime() - 14 * 86_400_000), lte: at },
  };
  const allSources = await Promise.all([
    db.feedPost.findMany({ where: recent, orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 150, select: projection }),
    cityKey
      ? db.feedPost.findMany({ where: { ...hard, author: {
        profile: { is: { cityKey } },
        feedSubscribers: { none: { userId: viewerId, hidden: true } },
      } }, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], take: 80, select: projection })
      : Promise.resolve([]),
    petTypes.length || breeds.length
      ? db.feedPost.findMany({ where: { ...hard, author: {
        pets: { some: {
          showInProfile: true,
          OR: [...(petTypes.length ? [{ type: { in: petTypes } }] : []),
            ...(breeds.length ? [{ breedKey: { in: breeds } }] : [])],
        } },
        feedSubscribers: { none: { userId: viewerId, hidden: true } },
      } }, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], take: 80, select: projection })
      : Promise.resolve([]),
    affinityAuthors.length
      ? db.feedPost.findMany({ where: { ...hard, authorId: { in: affinityAuthors } },
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }], take: 80, select: projection })
      : Promise.resolve([]),
    db.feedPostStats.findMany({ where: { post: hard },
      orderBy: [{ reactionCount: "desc" }, { uniqueCommenterCount: "desc" }, { bookmarkCount: "desc" }],
      take: 80, select: { post: { select: projection } } }),
  ]);
  return mergeSmartSources([
    { source: "recent", posts: allSources[0] },
    { source: "local", posts: allSources[1] },
    { source: "pet", posts: allSources[2] },
    { source: "affinity", posts: allSources[3] },
    { source: "trending", posts: allSources[4].map(item => item.post) },
  ]);
}
