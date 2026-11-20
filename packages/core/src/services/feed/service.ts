import { stableMediaExpiry, stablePublicFeedExpiry } from "../mediaDelivery/signedExpiry";
import { signFeedMediaUrls } from "./media-urls";
import { randomUUID } from "node:crypto";
import { kindToReaction as reactions } from "./social";
import type { FeedMediaUrlKeys } from "./media-urls";
import type { RankedFeedPosition } from "./ranking";
import { createWebLogger } from "@gafus/logger";
import type {
  FeedPostDto,
  FeedPostEditorDto,
  FeedPostPageDto,
  FeedMediaDto,
  FeedListQuery,
  FeedPostListQuery,
  FeedReactionCountDto,
} from "@gafus/types";
import { FEED_LIMITS as L, FEED_ERROR_MESSAGES } from "@gafus/types";
import type { FeedStoragePort } from "./ports";
import { FeedError } from "./errors";
import * as s from "./schemas";
import { decodeRankedCursor, encodeRankedCursor } from "./ranking";
import {
  rankSmartCandidates,
  type SmartFeedStatsReader,
  type SmartRankingSnapshotPort,
} from "./smart-data";
import type { SmartRetrievalPort } from "./smart-retrieval";
import { smartRedisTimeout } from "./smart-redis";
import type { SmartRecommendationReason } from "./smart-ranking";
import { isSmartMlModel, smartMlPassesOfflineGate } from "./smart-ml";
import { configuredSmartExperiment, assignSmartExperiment } from "./smart-experiment";

const smartFeedLogger = createWebLogger("smart-moments");
type ReactionKind = keyof typeof reactions;

export interface FeedPostProjection {
  id: string;
  authorId: string;
  status: FeedPostDto["status"];
  moderationState: NonNullable<FeedPostDto["moderationState"]>;
  moderationReason: string | null;
  activeRevisionId: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  editedAt: Date | null;
  version: number;
  author: {
    id: string;
    username: string;
    role: string;
    profile: { fullName: string | null; avatarUrl: string | null } | null;
  };
}

type FeedPagePosition = { date: Date; id: string };
type FeedMediaProjection = FeedMediaUrlKeys &
  Pick<FeedMediaDto, "status" | "width" | "height" | "durationSeconds">;
type FeedPostCount = { postId: string; count: number };

export interface FeedPostReadOperations {
  actorExists(actorId: string): Promise<boolean>;
  readSmartPreference(actorId: string): Promise<{
    enabled: boolean;
    useCity: boolean;
    usePets: boolean;
    useBehavior: boolean;
    exploration: boolean;
    updatedAt: Date;
    historyResetAt: Date | null;
  } | null>;
  readActiveRanker(): Promise<{ version: string; artifact: unknown } | null>;
  hydrateSmartPage(actorId: string, ids: string[]): Promise<FeedPostProjection[]>;
  hydrateRankedPage(ids: string[]): Promise<FeedPostProjection[]>;
  readProfileAuthor(username: string): Promise<{ id: string } | null>;
  readProfilePage(
    profileId: string,
    actorId: string,
    c: FeedPagePosition | null,
    take: number,
  ): Promise<FeedPostProjection[]>;
  readPendingPosts(actorId: string, take: number): Promise<FeedPostProjection[]>;
  readPublishedPost(id: string): Promise<FeedPostProjection | null>;
  readOwnedPost(actorId: string, id: string): Promise<FeedPostProjection | null>;
  readPendingRevision(id: string): Promise<{
    id: string;
    text: string;
    status: NonNullable<FeedPostEditorDto["pendingRevision"]>["status"];
    attachments: { mediaId: string }[];
    errorCode: string | null;
  } | null>;
  readPostDetails(
    actorId: string,
    posts: Pick<FeedPostProjection, "id" | "activeRevisionId" | "authorId">[],
  ): Promise<{
    versions: {
      id: string;
      text: string;
      attachments: { position: number; media: FeedMediaProjection }[];
    }[];
    views: FeedPostCount[];
    comments: FeedPostCount[];
    counts: (FeedPostCount & { kind: ReactionKind })[];
    mine: { postId: string; kind: ReactionKind }[];
    bookmarks: { postId: string }[];
    preferences: { authorId: string; hidden: boolean; notify: boolean }[];
    postPolls: { postId: string }[];
  }>;
}

/** Redis is supplied by the server composition root; Core never opens a connection. */
export interface FeedSmartSessionCache {
  readonly status: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiry: "EX", seconds: number): Promise<unknown>;
}

/** SQL/keyset reader supplied by feed-server, never imported by Core. */
export type FeedRankedRowsPort = (
  actorId: string,
  sort: "popular" | "discussed",
  cursor: RankedFeedPosition | null,
  pageSize: number,
) => Promise<RankedFeedPosition[]>;

/** Viewer-scoped chronological page with a keyset cursor. */
export type FeedChronologicalRowsPort = (input: {
  actorId: string;
  bookmarksOnly: boolean;
  cursor: { date: Date; id: string } | null;
  pageSize: number;
}) => Promise<FeedPostProjection[]>;

export interface FeedServiceConfig {
  operations: FeedPostReadOperations;
  storage: FeedStoragePort;
  now?: () => Date;
  enabled?: () => boolean;
  /** Production feed-server injects this SQL adapter, not the browser or Core. */
  readSmartFeedPostStats?: SmartFeedStatsReader;
  readSmartRankingSnapshot?: SmartRankingSnapshotPort;
  readSmartCandidateSources?: SmartRetrievalPort;
  /** Mandatory for popular/discussed requests; other feed modes do not query ranking SQL. */
  readRankedFeedRows?: FeedRankedRowsPort;
  readChronologicalRows: FeedChronologicalRowsPort;
  smartSessionCache?: FeedSmartSessionCache;
}
export function createFeedReads({
  operations,
  storage,
  now = () => new Date(),
  enabled = () => false,
  readSmartFeedPostStats,
  readSmartRankingSnapshot,
  readSmartCandidateSources,
  readRankedFeedRows,
  readChronologicalRows,
  smartSessionCache,
}: FeedServiceConfig) {
  const requireSmartRankingSnapshot = (): SmartRankingSnapshotPort => {
    if (!readSmartRankingSnapshot)
      throw new FeedError("SMART_FEED_SNAPSHOT_UNAVAILABLE", undefined, 503);
    return readSmartRankingSnapshot;
  };
  const requireSmartFeedStatsReader = (): SmartFeedStatsReader => {
    if (!readSmartFeedPostStats)
      throw new FeedError("SMART_FEED_STATS_UNAVAILABLE", undefined, 503);
    return readSmartFeedPostStats;
  };
  const isReady = () => {
    if (!enabled()) throw new FeedError("FEED_DISABLED", undefined, 503);
  };
  async function actor(actorId: string) {
    isReady();
    s.feedParse(s.feedIdSchema, actorId);
    if (!(await operations.actorExists(actorId))) {
      throw new FeedError("UNAUTHENTICATED", undefined, 401);
    }
  }
  function cursorFromPost(row: FeedPostProjection) {
    return Buffer.from(JSON.stringify([row.publishedAt!.toISOString(), row.id])).toString(
      "base64url",
    );
  }
  function decodeCursor(input: string | null | undefined) {
    if (!input) return null;
    try {
      const [date, id] = JSON.parse(Buffer.from(input, "base64url").toString("utf8")) as unknown[];
      if (
        typeof date !== "string" ||
        Number.isNaN(Date.parse(date)) ||
        typeof id !== "string" ||
        !s.feedIdSchema.safeParse(id).success
      )
        throw Error("cursor");
      return { date: new Date(date), id };
    } catch {
      throw new FeedError("VALIDATION_ERROR", "Некорректный курсор", 400);
    }
  }
  async function feedDto(
    actorId: string,
    posts: FeedPostProjection[],
    at: Date,
  ): Promise<FeedPostDto[]> {
    if (!posts.length) return [];
    const { versions, views, comments, counts, mine, bookmarks, preferences, postPolls } =
      await operations.readPostDetails(actorId, posts);
    const pollsByPost = new Set(postPolls.map((row) => row.postId));
    const saved = new Set(bookmarks.map((row) => row.postId));
    const prefs = new Map(preferences.map((row) => [row.authorId, row]));
    const versionById = new Map(versions.map((v) => [v.id, v]));
    const byCount = <T extends FeedPostCount>(rows: T[]) =>
      new Map(rows.map((row) => [row.postId, row.count]));
    const viewMap = byCount(views);
    const commentMap = byCount(comments);
    const reactionMap = new Map<string, FeedReactionCountDto[]>();
    for (const row of counts) {
      const list = reactionMap.get(row.postId) ?? [];
      list.push({ emoji: reactions[row.kind], count: row.count });
      reactionMap.set(row.postId, list);
    }
    const myMap = new Map(mine.map((row) => [row.postId, reactions[row.kind]]));
    const expire =
      storage.longLivedUrls === true
        ? stablePublicFeedExpiry(at)
        : stableMediaExpiry(at, L.mediaUrlSeconds);
    return Promise.all(
      posts.map(async (post) => {
        const revision = post.activeRevisionId ? versionById.get(post.activeRevisionId) : undefined;
        const attachments: FeedMediaDto[] = await Promise.all(
          (revision?.attachments ?? []).map(async ({ media, position }) => {
            const signed = await signFeedMediaUrls(media, (key) =>
              storage.signCdn({ key, expiresAt: expire }),
            );
            return {
              id: media.id,
              kind: media.kind,
              position,
              status: media.status,
              width: media.width,
              height: media.height,
              durationSeconds: media.durationSeconds,
              ...signed,
              urlsExpireAt: media.status === "ready" ? expire.toISOString() : null,
            };
          }),
        );
        const editUntil = post.publishedAt
          ? new Date(post.publishedAt.getTime() + L.editSeconds * 1000)
          : null;
        const published = post.status === "published" && !!revision;
        return {
          id: post.id,
          hasPoll: pollsByPost.has(post.id),
          bookmarked: saved.has(post.id),
          authorHidden: prefs.get(post.authorId)?.hidden ?? false,
          authorNotify: prefs.get(post.authorId)?.notify ?? false,
          moderationState: post.moderationState,
          moderationReason: post.authorId === actorId ? post.moderationReason : null,
          author: {
            id: post.author.id,
            username: post.author.username,
            name: post.author.profile?.fullName ?? post.author.username,
            avatarUrl: post.author.profile?.avatarUrl ?? null,
            role:
              post.author.role === "ADMIN" || post.author.role === "TRAINER"
                ? post.author.role
                : null,
          },
          status: post.status,
          // Older Mobile clients do not know hasPoll; show a readable label
          // for poll-only posts without duplicating it in newer Web/Mobile cards.
          text:
            published && pollsByPost.has(post.id) && !revision?.text.trim() && !attachments.length
              ? "Опрос"
              : (revision?.text ?? ""),
          attachments,
          createdAt: post.createdAt.toISOString(),
          publishedAt: post.publishedAt?.toISOString() ?? null,
          editedAt: post.editedAt?.toISOString() ?? null,
          editUntil: editUntil?.toISOString() ?? null,
          version: post.version,
          reactions: reactionMap.get(post.id) ?? [],
          myReaction: myMap.get(post.id) ?? null,
          viewCount: viewMap.get(post.id) ?? 0,
          commentCount: commentMap.get(post.id) ?? 0,
          canEdit:
            post.moderationState === "visible" &&
            post.authorId === actorId &&
            (editUntil ? editUntil > at : !published),
          canDelete: post.authorId === actorId,
          serverNow: at.toISOString(),
        };
      }),
    );
  }
  async function editor(actorId: string, id: string): Promise<FeedPostEditorDto> {
    await actor(actorId);
    const row = await operations.readOwnedPost(actorId, id);
    if (!row) throw new FeedError("NOT_FOUND", undefined, 404);
    const base = (await feedDto(actorId, [row], now()))[0]!;
    const revision = await operations.readPendingRevision(id);
    return {
      ...base,
      pendingRevision: revision
        ? {
            id: revision.id,
            status: revision.status,
            text: revision.text,
            attachmentIds: revision.attachments.map((att) => att.mediaId),
            errorCode: revision.errorCode,
            errorMessage: revision.errorCode ? FEED_ERROR_MESSAGES.MEDIA_PROCESSING_FAILED : null,
          }
        : null,
    };
  }
  const service = {
    async list(
      actorId: string,
      query: FeedPostListQuery = {},
      bookmarksOnly = false,
    ): Promise<FeedPostPageDto> {
      await actor(actorId);
      const q = bookmarksOnly
        ? s.feedParse(s.feedListSchema, query)
        : s.feedParse(s.feedPostListSchema, query);
      const sort = "sort" in q ? q.sort : "new";
      if (!bookmarksOnly && sort === "smart") {
        const rankingStartedAt = Date.now();
        const fallback = async (): Promise<FeedPostPageDto> => {
          const page = await service.list(actorId, { pageSize: q.pageSize, sort: "new" });
          // A smart cursor cannot be interpreted as a chronological cursor. End
          // the fallback snapshot instead of issuing an invalid subsequent request.
          return {
            ...page,
            nextCursor: null,
            feedMeta: { mode: "smart", personalized: false, fallback: "new" },
          };
        };
        // An independent kill switch ensures existing feed remains available
        // even if ranking infrastructure has not been deployed yet.
        if (process.env.FEED_SMART_ENABLED !== "true") return fallback();
        try {
          const preference = await operations.readSmartPreference(actorId);
          if (preference?.enabled === false) return fallback();
          const connection = smartSessionCache;
          if (!connection || connection.status !== "ready") return fallback();
          const experimentVariant = configuredSmartExperiment(actorId);
          type Session = {
            actorId: string;
            version: string;
            preferencesUpdatedAt: number;
            modelVersion: string | null;
            experimentVariant: "control" | "treatment" | null;
            rows: {
              id: string;
              reason: SmartRecommendationReason;
              sources: string[];
              features?: number[];
              exposureToken: string;
            }[];
          };
          const version = "smart-rule-2026-10-a";
          if (experimentVariant === "control") {
            let chronoCursor: string | undefined;
            if (q.cursor) {
              let payload: unknown;
              try {
                payload = JSON.parse(Buffer.from(q.cursor, "base64url").toString("utf8"));
              } catch {
                throw new FeedError("VALIDATION_ERROR", "Некорректный курсор контроля", 400);
              }
              if (
                !Array.isArray(payload) ||
                payload[0] !== "smart-control" ||
                typeof payload[1] !== "string" ||
                payload[1].length > 1024 ||
                payload.length !== 2
              ) {
                throw new FeedError("VALIDATION_ERROR", "Некорректный курсор контроля", 400);
              }
              chronoCursor = payload[1];
            }
            const page = await service.list(actorId, {
              sort: "new",
              pageSize: q.pageSize,
              cursor: chronoCursor,
            });
            const exposureSessionId = randomUUID();
            const controlRows = page.items.map((item) => ({
              id: item.id,
              reason: null,
              sources: ["recent"],
              exposureToken: randomUUID(),
            }));
            await smartRedisTimeout(
              connection.set(
                `feed:smart:${exposureSessionId}`,
                JSON.stringify({
                  actorId,
                  version,
                  preferencesUpdatedAt: preference?.updatedAt.getTime() ?? 0,
                  experimentVariant: "control",
                  modelVersion: null,
                  rows: controlRows,
                }),
                "EX",
                15 * 60,
              ),
            );
            return {
              ...page,
              items: page.items.map((item, index) => ({
                ...item,
                recommendationRank: index,
                recommendationSessionId: exposureSessionId,
                recommendationExposureToken: controlRows[index]?.exposureToken,
              })),
              nextCursor: page.nextCursor
                ? Buffer.from(JSON.stringify(["smart-control", page.nextCursor])).toString(
                    "base64url",
                  )
                : null,
              feedMeta: {
                mode: "smart",
                personalized: false,
                fallback: null,
                algorithmVersion: version,
                rankingSessionId: exposureSessionId,
                experimentVariant: "control",
              },
            };
          }
          let sessionId: string;
          let offset: number;
          let session: Session;
          if (q.cursor) {
            let fields: unknown;
            try {
              fields = JSON.parse(Buffer.from(q.cursor, "base64url").toString("utf8"));
            } catch {
              throw new FeedError("VALIDATION_ERROR", "Некорректный курсор рекомендаций", 400);
            }
            if (
              !Array.isArray(fields) ||
              fields.length !== 3 ||
              fields[0] !== "smart" ||
              typeof fields[1] !== "string" ||
              !/^[a-f0-9-]{36}$/.test(fields[1]) ||
              !Number.isSafeInteger(fields[2]) ||
              fields[2] < 0 ||
              fields[2] > 200
            )
              throw new FeedError("VALIDATION_ERROR", "Некорректный курсор рекомендаций", 400);
            sessionId = fields[1] as string;
            offset = fields[2] as number;
            const raw = await smartRedisTimeout(connection.get(`feed:smart:${sessionId}`));
            if (!raw) return fallback();
            session = JSON.parse(raw) as Session;
            if (
              session.actorId !== actorId ||
              session.version !== version ||
              session.preferencesUpdatedAt !== (preference?.updatedAt.getTime() ?? 0) ||
              !Array.isArray(session.rows)
            )
              throw new FeedError("VALIDATION_ERROR", "Курсор рекомендаций недействителен", 400);
          } else {
            const candidateModel =
              process.env.FEED_SMART_ML_ENABLED === "true"
                ? await operations.readActiveRanker()
                : null;
            const mlModel =
              candidateModel &&
              isSmartMlModel(candidateModel.artifact) &&
              smartMlPassesOfflineGate(candidateModel.artifact) &&
              Date.now() - Date.parse(candidateModel.artifact.trainedAt) <= 30 * 86_400_000
                ? candidateModel.artifact
                : null;
            const ranked = await rankSmartCandidates(
              requireSmartRankingSnapshot(),
              actorId,
              now(),
              {
                useCity: preference?.useCity ?? true,
                usePets: preference?.usePets ?? true,
                useBehavior: preference?.useBehavior ?? true,
                exploration: preference?.exploration ?? true,
                historyResetAt: preference?.historyResetAt,
                multiSource: process.env.FEED_SMART_MULTI_SOURCE_ENABLED === "true",
                mlModel,
              },
              requireSmartFeedStatsReader(),
              readSmartCandidateSources,
            );
            sessionId = randomUUID();
            offset = 0;
            session = {
              actorId,
              version,
              preferencesUpdatedAt: preference?.updatedAt.getTime() ?? 0,
              modelVersion: mlModel?.version ?? null,
              experimentVariant: experimentVariant === "treatment" ? "treatment" : null,
              rows: ranked.map(({ id, reason, sources, mlFeatures }) => ({
                id,
                reason,
                sources: sources ?? ["recent"],
                features: mlFeatures,
                exposureToken: randomUUID(),
              })),
            };
            await smartRedisTimeout(
              connection.set(`feed:smart:${sessionId}`, JSON.stringify(session), "EX", 15 * 60),
            );
          }
          const slice = session.rows.slice(offset, offset + q.pageSize);
          const rows = slice.length
            ? await operations.hydrateSmartPage(
                actorId,
                slice.map((item) => item.id),
              )
            : [];
          const byId = new Map(rows.map((row) => [row.id, row]));
          const at = now();
          const hydrated = await feedDto(
            actorId,
            slice.flatMap((item) => {
              const row = byId.get(item.id);
              return row ? [row] : [];
            }),
            at,
          );
          const reasonById = new Map(
            slice.map((item, index) => [item.id, { reason: item.reason, rank: offset + index }]),
          );
          const nextOffset = offset + slice.length;
          if (process.env.FEED_SMART_DIAGNOSTICS === "true") {
            smartFeedLogger.info("Smart feed page prepared", {
              firstPage: offset === 0,
              candidateCount: session.rows.length,
              deliveredCount: hydrated.length,
              elapsedMs: Date.now() - rankingStartedAt,
            });
          }
          return {
            items: hydrated.map((item) => ({
              ...item,
              recommendationReason: reasonById.get(item.id)?.reason,
              recommendationRank: reasonById.get(item.id)?.rank,
              recommendationSessionId: sessionId,
              recommendationExposureToken: session.rows.find((row) => row.id === item.id)
                ?.exposureToken,
            })),
            nextCursor:
              nextOffset < session.rows.length
                ? Buffer.from(JSON.stringify(["smart", sessionId, nextOffset])).toString(
                    "base64url",
                  )
                : null,
            serverNow: at.toISOString(),
            feedMeta: {
              mode: "smart",
              personalized: true,
              algorithmVersion: version,
              rankingSessionId: sessionId,
              fallback: null,
              ...(session.experimentVariant === "treatment"
                ? { experimentVariant: "treatment" as const }
                : {}),
            },
          };
        } catch (error) {
          if (error instanceof FeedError) throw error;
          if (process.env.FEED_SMART_DIAGNOSTICS === "true") {
            smartFeedLogger.warn("Smart feed fallback", {
              reason: error instanceof Error ? error.name : "unknown",
              elapsedMs: Date.now() - rankingStartedAt,
            });
          }
          // Fail open: recommendations must not take down Moments.
          return fallback();
        }
      }
      // Ranking must be computed by the database BEFORE pagination. Sorting loaded cards
      // client-side would produce wrong results after the first page.
      if (!bookmarksOnly && (sort === "popular" || sort === "discussed")) {
        const cursor = decodeRankedCursor(sort, q.cursor);
        if (!readRankedFeedRows)
          throw new FeedError(
            "FEED_RANKED_READ_UNAVAILABLE",
            "Сортировка временно недоступна",
            503,
          );
        const ranked = await readRankedFeedRows(actorId, sort, cursor, q.pageSize);
        const visible = ranked.slice(0, q.pageSize);
        const rows = visible.length
          ? await operations.hydrateRankedPage(visible.map((row) => row.id))
          : [];
        const byId = new Map(rows.map((row) => [row.id, row]));
        const at = now();
        return {
          items: await feedDto(
            actorId,
            visible.flatMap((row) => {
              const post = byId.get(row.id);
              return post ? [post] : [];
            }),
            at,
          ),
          nextCursor:
            ranked.length > q.pageSize && visible.length
              ? encodeRankedCursor(sort, visible[visible.length - 1]!)
              : null,
          serverNow: at.toISOString(),
        };
      }
      const c = decodeCursor(q.cursor);
      const rows = await readChronologicalRows({
        actorId,
        bookmarksOnly,
        cursor: c,
        pageSize: q.pageSize,
      });
      const page = rows.slice(0, q.pageSize);
      const at = now();
      if (
        !bookmarksOnly &&
        sort === "new" &&
        process.env.FEED_SMART_SHADOW_ENABLED === "true" &&
        assignSmartExperiment(actorId, {
          enabled: true,
          enrollmentPercent: Number(process.env.FEED_SMART_SHADOW_PERCENT ?? "1"),
          treatmentPercent: 100,
          key: "feed-shadow-rule-v1",
        }) === "treatment"
      ) {
        // Shadow computes recommendations against a sampled chronological page,
        // emits aggregate overlap/latency only, and NEVER affects the response.
        void (async () => {
          const preference = await operations.readSmartPreference(actorId);
          if (preference?.enabled === false) return;
          const started = Date.now();
          const ranked = await rankSmartCandidates(
            requireSmartRankingSnapshot(),
            actorId,
            at,
            {
              useCity: preference?.useCity ?? true,
              usePets: preference?.usePets ?? true,
              useBehavior: preference?.useBehavior ?? true,
              exploration: preference?.exploration ?? true,
              historyResetAt: preference?.historyResetAt,
              multiSource: process.env.FEED_SMART_MULTI_SOURCE_ENABLED === "true",
            },
            requireSmartFeedStatsReader(),
            readSmartCandidateSources,
          );
          const referenceIds = new Set(page.map((post) => post.id));
          smartFeedLogger.info("Smart feed shadow comparison", {
            referenceCount: referenceIds.size,
            candidateCount: ranked.length,
            overlapTop20: ranked.slice(0, 20).filter((post) => referenceIds.has(post.id)).length,
            elapsedMs: Date.now() - started,
          });
        })().catch((error) =>
          smartFeedLogger.warn("Smart feed shadow failed", {
            reason: error instanceof Error ? error.name : "unknown",
          }),
        );
      }
      return {
        items: await feedDto(actorId, page, at),
        nextCursor: rows.length > q.pageSize ? cursorFromPost(page[page.length - 1]!) : null,
        serverNow: at.toISOString(),
      };
    },
    async listProfile(
      actorId: string,
      username: string,
      query: FeedListQuery = {},
    ): Promise<FeedPostPageDto> {
      await actor(actorId);
      const profile = await operations.readProfileAuthor(username);
      if (!profile) throw new FeedError("NOT_FOUND", undefined, 404);
      const q = s.feedParse(s.feedListSchema, query);
      const c = decodeCursor(q.cursor);
      const rows = await operations.readProfilePage(profile.id, actorId, c, q.pageSize + 1);
      const at = now(),
        page = rows.slice(0, q.pageSize);
      return {
        items: await feedDto(actorId, page, at),
        nextCursor: rows.length > q.pageSize ? cursorFromPost(page[page.length - 1]!) : null,
        serverNow: at.toISOString(),
      };
    },
    async pending(actorId: string, query: FeedListQuery = {}): Promise<FeedPostPageDto> {
      await actor(actorId);
      const q = s.feedParse(s.feedListSchema, query);
      const rows = await operations.readPendingPosts(actorId, q.pageSize);
      const at = now();
      return {
        items: await feedDto(actorId, rows, at),
        nextCursor: null,
        serverNow: at.toISOString(),
      };
    },
    async get(actorId: string, id: string): Promise<FeedPostDto> {
      await actor(actorId);
      const row = await operations.readPublishedPost(id);
      if (!row) throw new FeedError("NOT_FOUND", undefined, 404);
      return (await feedDto(actorId, [row], now()))[0]!;
    },
    editor,
  };
  return { ...service, assertActor: actor };
}

export function assertFeedPostEditable(post: { publishedAt: Date | null }, at: Date) {
  if (post.publishedAt && at.getTime() >= post.publishedAt.getTime() + L.editSeconds * 1000) {
    throw new FeedError("EDIT_WINDOW_CLOSED", undefined, 409);
  }
}
