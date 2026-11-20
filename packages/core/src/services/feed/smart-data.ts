import { retrieveSmartCandidates, type SmartRetrievalPort } from "./smart-retrieval";
import { scoreSmartMl, toSmartMlVector, type SmartMlModel } from "./smart-ml";
import {
  calculateSmartFeedScore, jaccardSimilarity, normalizeSmartText, normalizeSmartBreed,
  rerankSmartFeed, smartAffinity, smartExploration,
  type RankedSmartPost, type SmartFeedSignals,
} from "./smart-ranking";
import type { SmartPostProjection } from "./smart-retrieval";

export type SmartSignalPet = { type: string; breed: string | null };
export type SmartSignalProfile = { city: string | null } | null;
export type SmartSignalAuthor = { id: string; profile: SmartSignalProfile; pets: SmartSignalPet[] };
export type SmartSignalEvent = { createdAt: Date; post: { authorId: string } };
export type SmartSignalContext = {
  viewer: { profile: SmartSignalProfile; pets: SmartSignalPet[] } | null;
  authors: SmartSignalAuthor[];
  seen: {postId:string}[];
  impressions: {postId:string}[];
  reactions: SmartSignalEvent[];
  comments: SmartSignalEvent[];
  bookmarks: SmartSignalEvent[];
  views: SmartSignalEvent[];
  materialized: {authorId:string;score:number}[];
};
export interface SmartRankingSnapshotPort {
  readRecent(viewerId:string,at:Date):Promise<SmartPostProjection[]>;
  readSignals(viewerId:string,at:Date,postIds:readonly string[],authorIds:readonly string[],
    options:{useBehavior:boolean;historyResetAt?:Date|null;materializedAffinity:boolean}):Promise<SmartSignalContext>;
}

export type SmartFeedPostStats = {
  postId: string; reactions: number; uniqueCommenters: number;
  bookmarks: number; impressions: number;
};
/** SQL stats projection from feed-server, never a Core query. */
export type SmartFeedStatsReader = (postIds: readonly string[], at: Date) => Promise<SmartFeedPostStats[]>;

/** Pure ranking over owner- and visibility-scoped server projections. */
export async function rankSmartCandidates(
  snapshotPort:SmartRankingSnapshotPort,viewerId:string,at:Date,
  preferences: {
    useCity:boolean;usePets:boolean;useBehavior:boolean;exploration:boolean;
    historyResetAt?:Date|null;multiSource?:boolean;mlModel?:SmartMlModel|null;
  },
  readSmartFeedPostStats:SmartFeedStatsReader,
  smartRetrievalPort?:SmartRetrievalPort,
):Promise<RankedSmartPost[]> {
  if (preferences.multiSource && !smartRetrievalPort)
    throw new Error("SMART_RETRIEVAL_PORT_UNBOUND");
  const posts = preferences.multiSource
    ? await retrieveSmartCandidates(smartRetrievalPort!,viewerId,at,preferences)
    : await snapshotPort.readRecent(viewerId,at);
  if (!posts.length) return [];
  const postIds=posts.map(post=>post.id);
  const authorIds=[...new Set(posts.map(post=>post.authorId))];
  const [context,stats]=await Promise.all([
    snapshotPort.readSignals(viewerId,at,postIds,authorIds,{
      useBehavior:preferences.useBehavior,
      historyResetAt:preferences.historyResetAt,
      materializedAffinity:preferences.useBehavior && process.env.FEED_SMART_AFFINITY_ENABLED === "true",
    }),
    readSmartFeedPostStats(postIds,at),
  ]);
  const {viewer,authors,seen,impressions,reactions,comments,bookmarks,views,materialized}=context;
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
