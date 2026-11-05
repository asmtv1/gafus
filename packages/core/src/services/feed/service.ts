import { feedClientPhotoStageKeys } from "./clientPhotoStageKeys";
import { stableMediaExpiry, stablePublicFeedExpiry } from "../mediaDelivery/signedExpiry";
import { signFeedMediaUrls } from "./media-urls";
import { assertFeedPublishingAllowed } from "./preferences";
import { activateFeedPostRevisionTx } from "./publish";
import { enqueueFeedPostCleanup, feedPossibleOutputKeys } from "./cleanup";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import type {
  FeedPostDto, FeedPostEditorDto, FeedPostPageDto, FeedMediaDto, FeedUploadDto,
  FeedPostCreateInput, FeedRevisionInput, FeedPublishInput, FeedReserveUploadInput,
  FeedCopyAlbumPhotoInput, FeedListQuery, FeedPostListQuery, FeedReaction, FeedReactionCountDto,
} from "@gafus/types";
import { FEED_LIMITS as L, FEED_ERROR_MESSAGES } from "../../../../types/src/feed";
import type { FeedDb, FeedTx, FeedStoragePort } from "./ports";
import { FeedError } from "./errors";
import * as s from "./schemas";
import { decodeRankedCursor, encodeRankedCursor } from "./ranking";
import { rankSmartCandidates } from "./smart-data";
import { smartRedisTimeout } from "./smart-redis";
import type { SmartRecommendationReason } from "./smart-ranking";
import { isSmartMlModel, smartMlPassesOfflineGate } from "./smart-ml";
import { configuredSmartExperiment, assignSmartExperiment } from "./smart-experiment";

const reactions = {
  heart: "❤️", laugh: "😂", dog: "🐶", fire: "🔥", like: "👍",
} as const;
const smartFeedLogger = createWebLogger("smart-moments");
type ReactionKind = keyof typeof reactions;
export const feedReactionToKind: Record<FeedReaction, ReactionKind> = {
  "❤️": "heart", "😂": "laugh", "🐶": "dog", "🔥": "fire", "👍": "like",
};
const authorSelect = { id: true, username: true, role: true, profile: { select: { fullName: true, avatarUrl: true } } } as const;
const postInclude = { author: { select: authorSelect } } as const;
type PostRow = Prisma.FeedPostGetPayload<{ include: typeof postInclude }>;
type AssetRow = Prisma.FeedMediaAssetGetPayload<Record<string, never>>;

export interface FeedServiceConfig {
  db: FeedDb;
  storage: FeedStoragePort;
  now?: () => Date;
  enabled?: () => boolean;
}
export function createFeedService({ db, storage, now = () => new Date(), enabled = () => false }: FeedServiceConfig) {
  const isReady = () => {
    if (!enabled()) throw new FeedError("FEED_DISABLED", undefined, 503);
  };
  async function actor(actorId: string) {
    isReady();
    s.feedParse(s.feedIdSchema, actorId);
    if (!await db.user.findUnique({ where: { id: actorId }, select: { id: true } })) {
      throw new FeedError("UNAUTHENTICATED", undefined, 401);
    }
  }
  function transact<T>(fn: (tx: FeedTx) => Promise<T>) {
    return db.$transaction(fn, { maxWait: 10_000, timeout: 30_000 });
  }
  async function lock(tx: FeedTx, id: string) {
    const found = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "FeedPost" WHERE "id" = ${id} FOR UPDATE`;
    if (!found.length) throw new FeedError("NOT_FOUND", undefined, 404);
  }
  async function ownedPost(tx: FeedTx, actorId: string, id: string, allowModerated = false) {
    const row = await tx.feedPost.findFirst({ where: { id, deletedAt: null } });
    if (!row || row.authorId !== actorId || (!allowModerated && row.moderationState !== "visible")) throw new FeedError("NOT_FOUND", undefined, 404);
    return row;
  }
  function checkEditable(post: { publishedAt: Date | null }, at: Date) {
    if (post.publishedAt && at.getTime() >= post.publishedAt.getTime() + L.editSeconds * 1000) {
      throw new FeedError("EDIT_WINDOW_CLOSED", undefined, 409);
    }
  }
  function cursorFromPost(row: PostRow) {
    return Buffer.from(JSON.stringify([row.publishedAt!.toISOString(), row.id])).toString("base64url");
  }
  function decodeCursor(input: string | null | undefined) {
    if (!input) return null;
    try {
      const [date, id] = JSON.parse(Buffer.from(input, "base64url").toString("utf8")) as unknown[];
      if (typeof date !== "string" || Number.isNaN(Date.parse(date)) || typeof id !== "string" || !s.feedIdSchema.safeParse(id).success) throw Error("cursor");
      return { date: new Date(date), id };
    } catch {
      throw new FeedError("VALIDATION_ERROR", "Некорректный курсор", 400);
    }
  }
  async function feedDto(actorId: string, posts: PostRow[], at: Date): Promise<FeedPostDto[]> {
    if (!posts.length) return [];
    const postIds = posts.map((post) => post.id);
    const activeIds = posts.map(p => p.activeRevisionId).filter((id): id is string => !!id);
    const [versions, views, comments, counts, mine, bookmarks, preferences, postPolls] = await Promise.all([
      db.feedPostRevision.findMany({
        where: { id: { in: activeIds } },
        include: { attachments: { orderBy: { position: "asc" }, include: { media: true } } },
      }),
      db.feedPostView.groupBy({ by: ["postId"], where: { postId: { in: postIds } }, _count: { _all: true } }),
      db.feedComment.groupBy({ by: ["postId"], where: { postId: { in: postIds }, deletedAt: null, moderationState: "visible" }, _count: { _all: true } }),
      db.feedPostReaction.groupBy({ by: ["postId", "kind"], where: { postId: { in: postIds } }, _count: { _all: true } }),
      db.feedPostReaction.findMany({ where: { postId: { in: postIds }, userId: actorId }, select: { postId: true, kind: true } }),
      db.feedBookmark.findMany({ where: { userId: actorId, postId: { in: postIds } }, select: { postId: true } }),
      db.feedAuthorPreference.findMany({ where: { userId: actorId, authorId: { in: posts.map(p => p.authorId) } } }),
      db.feedPoll.findMany({ where: { postId: { in: postIds } }, select: { postId: true } }),
    ]);
    const pollsByPost = new Set(postPolls.map(row => row.postId));
    const saved = new Set(bookmarks.map(row => row.postId));
    const prefs = new Map(preferences.map(row => [row.authorId, row]));
    const versionById = new Map(versions.map(v => [v.id, v]));
    const byCount = <T extends { postId: string; _count: { _all: number } }>(rows: T[]) => new Map(rows.map(row => [row.postId, row._count._all]));
    const viewMap = byCount(views);
    const commentMap = byCount(comments);
    const reactionMap = new Map<string, FeedReactionCountDto[]>();
    for (const row of counts) {
      const list = reactionMap.get(row.postId) ?? [];
      list.push({ emoji: reactions[row.kind], count: row._count._all });
      reactionMap.set(row.postId, list);
    }
    const myMap = new Map(mine.map(row => [row.postId, reactions[row.kind]]));
    const expire = storage.longLivedUrls === true
      ? stablePublicFeedExpiry(at) : stableMediaExpiry(at, L.mediaUrlSeconds);
    return Promise.all(posts.map(async post => {
      const revision = post.activeRevisionId ? versionById.get(post.activeRevisionId) : undefined;
      const attachments: FeedMediaDto[] = await Promise.all((revision?.attachments ?? []).map(async ({ media, position }) => {
        const signed = await signFeedMediaUrls(media, key => storage.signCdn({ key, expiresAt: expire }));
        return {
          id: media.id, kind: media.kind, position, status: media.status,
          width: media.width, height: media.height, durationSeconds: media.durationSeconds,
          ...signed,
          urlsExpireAt: media.status === "ready" ? expire.toISOString() : null,
        };
      }));
      const editUntil = post.publishedAt ? new Date(post.publishedAt.getTime() + L.editSeconds * 1000) : null;
      const published = post.status === "published" && !!revision;
      return {
        id: post.id, hasPoll: pollsByPost.has(post.id), bookmarked: saved.has(post.id), authorHidden: prefs.get(post.authorId)?.hidden ?? false,
        authorNotify: prefs.get(post.authorId)?.notify ?? false,
        moderationState: post.moderationState, moderationReason: post.authorId === actorId ? post.moderationReason : null,
        author: {
          id: post.author.id, username: post.author.username,
          name: post.author.profile?.fullName ?? post.author.username,
          avatarUrl: post.author.profile?.avatarUrl ?? null,
          role: post.author.role === "ADMIN" || post.author.role === "TRAINER"
            ? post.author.role : null,
        },
        status: post.status,
        // Older Mobile clients do not know hasPoll; show a readable label
        // for poll-only posts without duplicating it in newer Web/Mobile cards.
        text: published && pollsByPost.has(post.id) && !revision?.text.trim() && !attachments.length
          ? "Опрос" : revision?.text ?? "",
        attachments,
        createdAt: post.createdAt.toISOString(), publishedAt: post.publishedAt?.toISOString() ?? null,
        editedAt: post.editedAt?.toISOString() ?? null, editUntil: editUntil?.toISOString() ?? null,
        version: post.version, reactions: reactionMap.get(post.id) ?? [],
        myReaction: myMap.get(post.id) ?? null, viewCount: viewMap.get(post.id) ?? 0,
        commentCount: commentMap.get(post.id) ?? 0,
        canEdit: post.moderationState === "visible" && post.authorId === actorId && (editUntil ? editUntil > at : !published),
        canDelete: post.authorId === actorId, serverNow: at.toISOString(),
      };
    }));
  }
  async function editor(actorId: string, id: string): Promise<FeedPostEditorDto> {
    await actor(actorId);
    const row = await db.feedPost.findFirst({ where: { id, authorId: actorId, deletedAt: null }, include: postInclude });
    if (!row) throw new FeedError("NOT_FOUND", undefined, 404);
    const base = (await feedDto(actorId, [row], now()))[0]!;
    const revision = await db.feedPostRevision.findFirst({
      where: { postId: id, status: { in: ["draft", "pending", "failed"] } },
      orderBy: { revisionNumber: "desc" },
      include: { attachments: { orderBy: { position: "asc" } } },
    });
    return { ...base, pendingRevision: revision ? {
      id: revision.id, status: revision.status, text: revision.text,
      attachmentIds: revision.attachments.map(att => att.mediaId),
      errorCode: revision.errorCode, errorMessage: revision.errorCode ? FEED_ERROR_MESSAGES.MEDIA_PROCESSING_FAILED : null,
    } : null };
  }
  async function maybeActivate(tx: FeedTx, postId: string, revisionId: string, at: Date) {
    const post = await tx.feedPost.findUnique({ where: { id: postId } });
    const revision = await tx.feedPostRevision.findUnique({ where: { id: revisionId }, include: { attachments: { include: { media: true } } } });
    if (!post || !revision || post.deletedAt || revision.revisionNumber !== post.version || revision.status !== "pending") return false;
    if (revision.attachments.some(att => att.media.status !== "ready")) return false;
    await activateFeedPostRevisionTx(tx, {
      post,
      revisionId,
      at,
      text: revision.text,
      publishedMediaCount: revision.attachments.length,
    });
    return true;
  }
  /** Stale client-prepared photo/video S3 COPY has no Cloud.ru primary Job.
   * Reopen only when its exact final-key cleanup guard proves client ownership.
   * Never alter normal worker-owned PROCESSING rows.
   */
  async function recoverClientMediaLease(actorId: string, uploadId: string,
    known?: { status: string; leaseUntil: Date | null; postId: string } | null) {
    const candidate = known ?? await db.feedUpload.findFirst({ where: { id: uploadId, ownerId: actorId } });
    if (!candidate || candidate.status !== "processing" ||
        !candidate.leaseUntil || candidate.leaseUntil >= now()) return;
    await transact(async tx => {
      await lock(tx, candidate.postId);
      const row = await tx.feedUpload.findFirst({ where: { id: uploadId, ownerId: actorId } });
      if (!row || row.status !== "processing" || !row.leaseUntil || row.leaseUntil >= now()) return;
      const guardDedupe = row.declaredMime === "video/mp4"
        ? `feed-client-video-final-guard:${uploadId}`
        : `feed-client-final-guard:${uploadId}`;
      const guard = await tx.feedStorageJob.findUnique({
        where: { dedupeKey: guardDedupe },
      });
      if (!guard || guard.ownerId !== actorId || guard.status !== "pending") return;
      const result = await tx.feedUpload.updateMany({
        where: { id: uploadId, ownerId: actorId, status: "processing",
          attemptToken: row.attemptToken, leaseUntil: { lt: now() } },
        data: { status: "reserved", attemptToken: null, leaseUntil: null },
      });
      if (result.count) await tx.feedMediaAsset.updateMany({
        where: { id: row.mediaId, ownerId: actorId, status: "processing" },
        data: { status: "reserved" },
      });
    });
  }
  const service = {
    async list(actorId: string, query: FeedPostListQuery = {}, bookmarksOnly = false): Promise<FeedPostPageDto> {
      await actor(actorId);
      const q = bookmarksOnly ? s.feedParse(s.feedListSchema, query) : s.feedParse(s.feedPostListSchema, query);
      const sort = "sort" in q ? q.sort : "new";
      if (!bookmarksOnly && sort === "smart") {
        const rankingStartedAt = Date.now();
        const fallback = async (): Promise<FeedPostPageDto> => {
          const page = await service.list(actorId, { pageSize: q.pageSize, sort: "new" });
          // A smart cursor cannot be interpreted as a chronological cursor. End
          // the fallback snapshot instead of issuing an invalid subsequent request.
          return {
            ...page, nextCursor: null,
            feedMeta: { mode: "smart", personalized: false, fallback: "new" },
          };
        };
        // An independent kill switch ensures existing feed remains available
        // even if ranking infrastructure has not been deployed yet.
        if (process.env.FEED_SMART_ENABLED !== "true") return fallback();
        try {
          const preference = await db.feedPersonalizationPreference.findUnique({ where: { userId: actorId } });
          if (preference?.enabled === false) return fallback();
          const { connection } = await import("@gafus/queues");
          if (connection.status !== "ready") return fallback();
          const experimentVariant = configuredSmartExperiment(actorId);
          type Session = {
            actorId: string; version: string; preferencesUpdatedAt: number;
            modelVersion: string | null; experimentVariant: "control" | "treatment" | null;
            rows: { id: string; reason: SmartRecommendationReason; sources: string[]; features?: number[]; exposureToken: string }[];
          };
          const version = "smart-rule-2026-10-a";
          if (experimentVariant === "control") {
            let chronoCursor: string | undefined;
            if (q.cursor) {
              let payload: unknown;
              try { payload = JSON.parse(Buffer.from(q.cursor, "base64url").toString("utf8")); }
              catch { throw new FeedError("VALIDATION_ERROR", "Некорректный курсор контроля", 400); }
              if (!Array.isArray(payload) || payload[0] !== "smart-control" ||
                  typeof payload[1] !== "string" || payload[1].length > 1024 ||
                  payload.length !== 2) {
                throw new FeedError("VALIDATION_ERROR", "Некорректный курсор контроля", 400);
              }
              chronoCursor = payload[1];
            }
            const page = await service.list(actorId, { sort: "new", pageSize: q.pageSize, cursor: chronoCursor });
            const exposureSessionId = randomUUID();
            const controlRows = page.items.map(item => ({
              id: item.id, reason: null, sources: ["recent"], exposureToken: randomUUID(),
            }));
            await smartRedisTimeout(connection.set(`feed:smart:${exposureSessionId}`, JSON.stringify({
              actorId, version, preferencesUpdatedAt: preference?.updatedAt.getTime() ?? 0,
              experimentVariant: "control", modelVersion: null, rows: controlRows,
            }), "EX", 15 * 60));
            return {
              ...page,
              items: page.items.map((item, index) => ({ ...item, recommendationRank: index,
                recommendationSessionId: exposureSessionId,
                recommendationExposureToken: controlRows[index]?.exposureToken })),
              nextCursor: page.nextCursor
                ? Buffer.from(JSON.stringify(["smart-control", page.nextCursor])).toString("base64url")
                : null,
              feedMeta: {
                mode: "smart", personalized: false, fallback: null,
                algorithmVersion: version, rankingSessionId: exposureSessionId,
                experimentVariant: "control",
              },
            };
          }
          let sessionId: string;
          let offset: number;
          let session: Session;
          if (q.cursor) {
            let fields: unknown;
            try { fields = JSON.parse(Buffer.from(q.cursor, "base64url").toString("utf8")); }
            catch { throw new FeedError("VALIDATION_ERROR", "Некорректный курсор рекомендаций", 400); }
            if (!Array.isArray(fields) || fields.length !== 3 || fields[0] !== "smart" ||
              typeof fields[1] !== "string" || !/^[a-f0-9-]{36}$/.test(fields[1]) ||
              !Number.isSafeInteger(fields[2]) || fields[2] < 0 || fields[2] > 200)
              throw new FeedError("VALIDATION_ERROR", "Некорректный курсор рекомендаций", 400);
            sessionId = fields[1] as string;
            offset = fields[2] as number;
            const raw = await smartRedisTimeout(connection.get(`feed:smart:${sessionId}`));
            if (!raw) return fallback();
            session = JSON.parse(raw) as Session;
            if (session.actorId !== actorId || session.version !== version ||
              session.preferencesUpdatedAt !== (preference?.updatedAt.getTime() ?? 0) ||
              !Array.isArray(session.rows))
              throw new FeedError("VALIDATION_ERROR", "Курсор рекомендаций недействителен", 400);
          } else {
            const candidateModel = process.env.FEED_SMART_ML_ENABLED === "true"
              ? await db.feedSmartRankerModel.findFirst({
                where: { active: true }, orderBy: { trainedAt: "desc" },
                select: { version: true, artifact: true },
              }) : null;
            const mlModel = candidateModel && isSmartMlModel(candidateModel.artifact) &&
              smartMlPassesOfflineGate(candidateModel.artifact) &&
              Date.now() - Date.parse(candidateModel.artifact.trainedAt) <= 30 * 86_400_000
              ? candidateModel.artifact : null;
            const ranked = await rankSmartCandidates(db, actorId, now(), {
              useCity: preference?.useCity ?? true,
              usePets: preference?.usePets ?? true,
              useBehavior: preference?.useBehavior ?? true,
              exploration: preference?.exploration ?? true,
              historyResetAt: preference?.historyResetAt,
              multiSource: process.env.FEED_SMART_MULTI_SOURCE_ENABLED === "true",
              mlModel,
            });
            sessionId = randomUUID();
            offset = 0;
            session = {
              actorId, version, preferencesUpdatedAt: preference?.updatedAt.getTime() ?? 0,
              modelVersion: mlModel?.version ?? null,
              experimentVariant: experimentVariant === "treatment" ? "treatment" : null,
              rows: ranked.map(({ id, reason, sources, mlFeatures }) => ({
                id, reason, sources: sources ?? ["recent"], features: mlFeatures, exposureToken: randomUUID(),
              })),
            };
            await smartRedisTimeout(connection.set(`feed:smart:${sessionId}`, JSON.stringify(session), "EX", 15 * 60));
          }
          const slice = session.rows.slice(offset, offset + q.pageSize);
          const rows = slice.length ? await db.feedPost.findMany({
            where: {
              id: { in: slice.map(item => item.id) },
              status: "published", moderationState: "visible", deletedAt: null,
              feedback: { none: { userId: actorId, kind: "not_interested" } },
              author: { feedSubscribers: { none: { userId: actorId, hidden: true } } },
            },
            include: postInclude,
          }) : [];
          const byId = new Map(rows.map(row => [row.id, row]));
          const at = now();
          const hydrated = await feedDto(actorId, slice.flatMap(item => {
            const row = byId.get(item.id);
            return row ? [row] : [];
          }), at);
          const reasonById = new Map(slice.map((item, index) => [item.id, { reason: item.reason, rank: offset + index }]));
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
            items: hydrated.map(item => ({
              ...item, recommendationReason: reasonById.get(item.id)?.reason,
              recommendationRank: reasonById.get(item.id)?.rank,
              recommendationSessionId: sessionId,
              recommendationExposureToken: session.rows.find(row => row.id === item.id)?.exposureToken,
            })),
            nextCursor: nextOffset < session.rows.length
              ? Buffer.from(JSON.stringify(["smart", sessionId, nextOffset])).toString("base64url") : null,
            serverNow: at.toISOString(),
            feedMeta: { mode: "smart", personalized: true, algorithmVersion: version, rankingSessionId: sessionId, fallback: null,
              ...(session.experimentVariant === "treatment" ? { experimentVariant: "treatment" as const } : {}),
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
        const scoreSql = sort === "popular"
          ? Prisma.sql`(SELECT COUNT(*)::integer FROM "FeedPostReaction" r WHERE r."postId" = p."id")`
          : Prisma.sql`(SELECT COUNT(*)::integer FROM "FeedComment" c WHERE c."postId" = p."id" AND c."deletedAt" IS NULL AND c."moderationState" = 'visible')`;
        // FeedPost.publishedAt is TIMESTAMP(3) WITHOUT TIME ZONE.
        // Binding a JS Date as TIMESTAMPTZ changes keyset order on non-UTC servers,
        // potentially repeating the same page forever. Use an explicit UTC-naive
        // timestamp string in the SQL comparisons.
        const utcCursorTime = cursor?.publishedAt.toISOString().slice(0, 23).replace("T", " ");
        const afterCursor = cursor
          ? Prisma.sql`WHERE ranked.score < ${cursor.score}
            OR (ranked.score = ${cursor.score} AND ranked."publishedAt" < ${utcCursorTime}::timestamp(3))
            OR (ranked.score = ${cursor.score} AND ranked."publishedAt" = ${utcCursorTime}::timestamp(3) AND ranked.id < ${cursor.id})`
          : Prisma.empty;
        const ranked = await db.$queryRaw<{ id: string; publishedAt: Date; score: number }[]>(Prisma.sql`
          SELECT ranked.id, ranked."publishedAt", ranked.score FROM (
            SELECT p."id", p."publishedAt", ${scoreSql} AS score
            FROM "FeedPost" p
            WHERE p."status" = 'published'::"FeedPostStatus"
              AND p."deletedAt" IS NULL AND p."moderationState" = 'visible'
              AND p."publishedAt" IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM "FeedAuthorPreference" pref
                WHERE pref."userId" = ${actorId} AND pref."authorId" = p."authorId" AND pref."hidden" = true
              )
          ) ranked
          ${afterCursor}
          ORDER BY ranked.score DESC, ranked."publishedAt" DESC, ranked.id DESC
          LIMIT ${q.pageSize + 1}
        `);
        const visible = ranked.slice(0, q.pageSize);
        const rows = visible.length ? await db.feedPost.findMany({
          where: { id: { in: visible.map(row => row.id) } },
          include: postInclude,
        }) : [];
        const byId = new Map(rows.map(row => [row.id, row]));
        const at = now();
        return {
          items: await feedDto(actorId, visible.flatMap(row => {
            const post = byId.get(row.id);
            return post ? [post] : [];
          }), at),
          nextCursor: ranked.length > q.pageSize && visible.length
            ? encodeRankedCursor(sort, visible[visible.length - 1]!) : null,
          serverNow: at.toISOString(),
        };
      }
      const c = decodeCursor(q.cursor);
      const where: Prisma.FeedPostWhereInput = {
        status: "published", deletedAt: null, moderationState: "visible", publishedAt: { not: null },
        ...(bookmarksOnly ? { bookmarks: { some: { userId: actorId } } } : { author: { feedSubscribers: { none: { userId: actorId, hidden: true } } } }),
        ...(c ? { OR: [{ publishedAt: { lt: c.date } }, { publishedAt: c.date, id: { lt: c.id } }] } : {}),
      };
      const rows = await db.feedPost.findMany({
        where, include: postInclude,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }], take: q.pageSize + 1,
      });
      const page = rows.slice(0, q.pageSize);
      const at = now();
      if (!bookmarksOnly && sort === "new" &&
          process.env.FEED_SMART_SHADOW_ENABLED === "true" &&
          assignSmartExperiment(actorId, {
            enabled: true,
            enrollmentPercent: Number(process.env.FEED_SMART_SHADOW_PERCENT ?? "1"),
            treatmentPercent: 100, key: "feed-shadow-rule-v1",
          }) === "treatment") {
        // Shadow computes recommendations against a sampled chronological page,
        // emits aggregate overlap/latency only, and NEVER affects the response.
        void (async () => {
          const preference = await db.feedPersonalizationPreference.findUnique({ where: { userId: actorId } });
          if (preference?.enabled === false) return;
          const started = Date.now();
          const ranked = await rankSmartCandidates(db, actorId, at, {
            useCity: preference?.useCity ?? true, usePets: preference?.usePets ?? true,
            useBehavior: preference?.useBehavior ?? true,
            exploration: preference?.exploration ?? true,
            historyResetAt: preference?.historyResetAt,
            multiSource: process.env.FEED_SMART_MULTI_SOURCE_ENABLED === "true",
          });
          const referenceIds = new Set(page.map(post => post.id));
          smartFeedLogger.info("Smart feed shadow comparison", {
            referenceCount: referenceIds.size,
            candidateCount: ranked.length,
            overlapTop20: ranked.slice(0, 20).filter(post => referenceIds.has(post.id)).length,
            elapsedMs: Date.now() - started,
          });
        })().catch(error => smartFeedLogger.warn("Smart feed shadow failed", {
          reason: error instanceof Error ? error.name : "unknown",
        }));
      }
      return { items: await feedDto(actorId, page, at), nextCursor: rows.length > q.pageSize ? cursorFromPost(page[page.length - 1]!) : null, serverNow: at.toISOString() };
    },
    async listProfile(actorId: string, username: string, query: FeedListQuery = {}): Promise<FeedPostPageDto> {
      await actor(actorId);
      const profile = await db.user.findUnique({ where: { username }, select: { id: true } });
      if (!profile) throw new FeedError("NOT_FOUND", undefined, 404);
      const q = s.feedParse(s.feedListSchema, query);
      const c = decodeCursor(q.cursor);
      const rows = await db.feedPost.findMany({
        where: { authorId: profile.id, deletedAt: null, status: "published", ...(profile.id !== actorId ? { moderationState: "visible" } : {}),
          ...(c ? { OR: [{ publishedAt: { lt: c.date } }, { publishedAt: c.date, id: { lt: c.id } }] } : {}) },
        include: postInclude,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }], take: q.pageSize + 1,
      });
      const at = now(), page = rows.slice(0, q.pageSize);
      return { items: await feedDto(actorId, page, at), nextCursor: rows.length > q.pageSize ? cursorFromPost(page[page.length - 1]!) : null, serverNow: at.toISOString() };
    },
    async pending(actorId: string, query: FeedListQuery = {}): Promise<FeedPostPageDto> {
      await actor(actorId);
      const q = s.feedParse(s.feedListSchema, query);
      const rows = await db.feedPost.findMany({ where: { authorId: actorId, deletedAt: null, status: { in: ["draft", "pending", "failed"] } }, include: postInclude, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: q.pageSize });
      const at = now();
      return { items: await feedDto(actorId, rows, at), nextCursor: null, serverNow: at.toISOString() };
    },
    async get(actorId: string, id: string): Promise<FeedPostDto> {
      await actor(actorId);
      const row = await db.feedPost.findFirst({ where: { id, status: "published", deletedAt: null, moderationState: "visible" }, include: postInclude });
      if (!row) throw new FeedError("NOT_FOUND", undefined, 404);
      return (await feedDto(actorId, [row], now()))[0]!;
    },
    editor,
    /** Authoritative media lookup for short-lived outage fallback, never trusting a client path. */
    async fallbackSource(actorId: string, mediaId: string, variant: "thumb" | "full" | "poster" | "video360" | "video720") {
      await actor(actorId);
      s.feedParse(s.feedIdSchema, mediaId);
      const media = await db.feedMediaAsset.findFirst({ where: { id: mediaId, status: "ready" } });
      if (!media || (variant === "poster" || variant.startsWith("video") ? media.kind !== "video" : media.kind !== "photo"))
        throw new FeedError("NOT_FOUND", undefined, 404);
      const post = await db.feedPost.findFirst({
        where: { id: media.postId, status: "published", deletedAt: null, moderationState: "visible" },
      });
      if (!post?.activeRevisionId) throw new FeedError("NOT_FOUND", undefined, 404);
      const linked = await db.feedRevisionAttachment.findFirst({
        where: { revisionId: post.activeRevisionId, mediaId }, select: { mediaId: true },
      });
      const pollPhoto = !linked && variant !== "poster"
        ? await db.feedPollOption.findFirst({
            where: { imageMediaId: mediaId, poll: { postId: post.id } }, select: { id: true },
          }) : null;
      // Comment media uses canonical Feed V2 keys without a post revision link.
      const commentMedia = !linked && !pollPhoto
        ? await db.feedCommentMedia.findFirst({
            where: { mediaId, comment: { postId: post.id, deletedAt: null,
              moderationState: "visible" } }, select: { mediaId: true },
          }) : null;
      if (!linked && !pollPhoto && !commentMedia) throw new FeedError("NOT_FOUND", undefined, 404);
      const videoQuality = /^video(360|720)$/.exec(variant)?.[1];
      const expectedVideoKey = videoQuality ? `media/v2/${media.id}/v1/video/${videoQuality}.mp4` : null;
      const key = expectedVideoKey
        ? media.mp4Keys.includes(expectedVideoKey) ? expectedVideoKey : null
        : variant === "thumb" ? media.thumbKey : variant === "full" ? media.fullKey : media.posterKey;
      if (!key) throw new FeedError("NOT_FOUND", undefined, 404);
      return { key };
    },
    async create(actorId: string, input: FeedPostCreateInput) {
      await actor(actorId);
      const value = s.feedParse(s.feedCreatePostSchema, input);
      const id = await transact(async tx => {
        await assertFeedPublishingAllowed(tx, actorId);
        const prior = await tx.feedPost.findUnique({ where: { authorId_clientRequestId: { authorId: actorId, clientRequestId: value.clientRequestId } } });
        if (prior) return prior.id;
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
        const again = await tx.feedPost.findUnique({ where: { authorId_clientRequestId: { authorId: actorId, clientRequestId: value.clientRequestId } } });
        return again?.id ?? (await tx.feedPost.create({ data: { authorId: actorId, clientRequestId: value.clientRequestId } })).id;
      });
      return editor(actorId, id);
    },
    async saveRevision(actorId: string, postId: string, input: FeedRevisionInput) {
      await actor(actorId);
      const value = s.feedParse(s.feedRevisionSchema, input);
      await transact(async tx => {
        await assertFeedPublishingAllowed(tx, actorId);
        await lock(tx, postId);
        const post = await ownedPost(tx, actorId, postId);
        const previous = await tx.feedPostRevision.findUnique({
          where: { postId_clientRequestId: { postId, clientRequestId: value.clientRequestId } },
          include: { attachments: { orderBy: { position: "asc" } } },
        });
        if (previous) {
          // A retried idempotency key may only replay the identical original request.
          // Never silently accept a different body after another device changed the post.
          const originalIds = previous.attachments.map(a => a.mediaId);
          if (previous.text !== value.text || previous.revisionNumber !== value.expectedVersion + 1 ||
              originalIds.length !== value.attachmentIds.length ||
              originalIds.some((id, position) => id !== value.attachmentIds[position])) {
            throw new FeedError("VERSION_CONFLICT", undefined, 409);
          }
          return;
        }
        checkEditable(post, now());
        if (post.version !== value.expectedVersion) throw new FeedError("VERSION_CONFLICT", undefined, 409);
        if (value.pollOnly) {
          const poll = await tx.feedPoll.findUnique({ where: { postId }, select: { id: true } });
          if (!poll) throw new FeedError("EMPTY_POST", undefined, 400);
        }
        const media = await tx.feedMediaAsset.findMany({ where: {
          id: { in: value.attachmentIds }, postId, ownerId: actorId,
          status: { notIn: ["failed", "cancelled", "expired"] },
          commentAttachments: { none: {} },
          OR: [{ upload: { is: null } }, { upload: { is: { purpose: "post" } } }],
        } });
        if (media.length !== value.attachmentIds.length) throw new FeedError("VALIDATION_ERROR", "Недоступное вложение", 400);
        if (media.filter(a => a.kind === "video").length > L.maxVideos) throw new FeedError("VIDEO_LIMIT", undefined, 400);
        await tx.feedPostRevision.updateMany({ where: { postId, status: { in: ["draft", "pending", "failed"] } }, data: { status: "superseded" } });
        const next = post.version + 1;
        await tx.feedPostRevision.create({ data: { postId, clientRequestId: value.clientRequestId, revisionNumber: next, text: value.text, status: "draft",
          attachments: { create: value.attachmentIds.map((mediaId, position) => ({ mediaId, position })) } } });
        await tx.feedPost.update({ where: { id: postId }, data: { version: next, status: post.activeRevisionId ? "published" : "draft" } });
      });
      return editor(actorId, postId);
    },
    async publish(actorId: string, postId: string, input: FeedPublishInput) {
      await actor(actorId);
      s.feedParse(s.feedPublishSchema, input);
      await transact(async tx => {
        await assertFeedPublishingAllowed(tx, actorId);
        await lock(tx, postId);
        const post = await ownedPost(tx, actorId, postId);
        const latest = await tx.feedPostRevision.findFirst({ where: { postId, revisionNumber: post.version }, orderBy: { createdAt: "desc" } });
        if (!latest) throw new FeedError("EMPTY_POST", undefined, 400);
        if (!latest.text.trim() && !await tx.feedRevisionAttachment.count({ where: { revisionId: latest.id } })) {
          const savedPoll = await tx.feedPoll.findUnique({ where: { postId }, select: { id: true } });
          if (!savedPoll) throw new FeedError("EMPTY_POST", undefined, 400);
        }
        if (latest.status === "ready" || latest.status === "pending") return;
        if (latest.status !== "draft" && latest.status !== "failed") throw new FeedError("VERSION_CONFLICT", undefined, 409);
        // The edit window was checked at revision acceptance, not at processing completion.
        if (!post.activeRevisionId) checkEditable(post, now());
        await tx.feedPostRevision.update({ where: { id: latest.id }, data: { status: "pending", acceptedAt: latest.acceptedAt ?? now() } });
        if (!post.activeRevisionId) await tx.feedPost.update({ where: { id: postId }, data: { status: "pending" } });
        await maybeActivate(tx, postId, latest.id, now());
      });
      return editor(actorId, postId);
    },
    async remove(actorId: string, postId: string) {
      await actor(actorId);
      await transact(async tx => {
        await lock(tx, postId);
        const post = await ownedPost(tx, actorId, postId, true);
        const at = now();
        await enqueueFeedPostCleanup(tx, postId, actorId, at, "delete");
        await tx.feedPost.update({ where: { id: post.id }, data: { deletedAt: at, status: "deleted" } });
        await tx.feedUpload.updateMany({ where: { postId, status: { in: ["reserved", "uploaded", "processing"] } }, data: { status: "cancelled", attemptToken: null, leaseUntil: null } });
      });
      return { id: postId };
    },
    async reserveUpload(actorId: string, postId: string, input: FeedReserveUploadInput): Promise<FeedUploadDto> {
      await actor(actorId);
      if (!storage.enabled) throw new FeedError("FEED_DISABLED", "Обработка вложений пока недоступна", 503);
      const value = s.feedParse(s.feedUploadSchema, input);
      if (value.kind === "photo" && (value.declaredMime !== "image/webp" ||
          value.declaredBytes > 1_750_000))
        throw new FeedError("VALIDATION_ERROR", "Нужна фотография WebP, подготовленная на устройстве", 410);
      // Purpose determines authorization, not a second storage/processing pipeline.
      // A published post allows comment-media uploads by other authenticated users.
      // A draft only allows uploads by its author.
      // A signed POST may have succeeded while its Complete ACK was lost.
      // Probe the existing owner's key OUTSIDE the PostgreSQL transaction;
      // do not expire a valid uploaded object merely because the POST URL aged.
      let prior = await db.feedUpload.findUnique({
        where: { ownerId_clientRequestId: {
          ownerId: actorId, clientRequestId: value.clientRequestId,
        } },
      });
      if (prior?.status === "processing" && prior.leaseUntil && prior.leaseUntil < now()) {
        await recoverClientMediaLease(actorId, prior.id, prior);
        prior = await db.feedUpload.findUnique({
          where: { ownerId_clientRequestId: { ownerId: actorId, clientRequestId: value.clientRequestId } },
        });
      }
      let recoveredSource: { id: string; etag: string } | null = null;
      if (prior?.status === "reserved" && prior.postExpiresAt <= now() &&
          prior.reservationExpiresAt > now()) {
        let metadata: Awaited<ReturnType<FeedStoragePort["head"]>>;
        try { metadata = await storage.head(prior.sourceKey); }
        catch { throw new FeedError("FEED_DISABLED", "Хранилище временно недоступно", 503); }
        const maxBytes = prior.declaredMime.startsWith("image/") ? L.photoBytes : L.videoBytes;
        if (metadata && metadata.contentType === prior.declaredMime &&
            metadata.bytes === prior.declaredBytes && metadata.bytes > 0 &&
            metadata.bytes <= maxBytes) {
          recoveredSource = { id: prior.id, etag: metadata.etag };
        }
      }
      const row = await transact(async tx => {
        await lock(tx, postId);
        if (value.purpose === "comment") await assertFeedPublishingAllowed(tx, actorId);
        const post = value.purpose === "comment"
          ? await tx.feedPost.findFirst({ where: { id: postId, status: "published", deletedAt: null, moderationState: "visible" } })
          : await ownedPost(tx, actorId, postId);
        if (!post) throw new FeedError("NOT_FOUND", undefined, 404);
        if (value.purpose !== "comment") checkEditable(post, now());
        const previous = await tx.feedUpload.findUnique({ where: { ownerId_clientRequestId: { ownerId: actorId, clientRequestId: value.clientRequestId } }, include: { media: true } });
        if (previous) {
          const fingerprint = createHash("sha256").update(JSON.stringify({ postId, kind: value.kind, declaredMime: value.declaredMime, declaredBytes: value.declaredBytes, filename: value.filename, ...(value.purpose === "comment" ? { purpose: "comment" } : {}) })).digest("hex");
          if (previous.requestFingerprint !== fingerprint) throw new FeedError("VERSION_CONFLICT", undefined, 409);
          if (previous.status === "reserved" && previous.postExpiresAt <= now()) {
            if (!previous.declaredMime.startsWith("image/") &&
                previous.reservationExpiresAt > now() &&
                recoveredSource?.id === previous.id) {
              // Same verified object, recovered after a lost Complete ACK.
              // Preserve its original media ID and enqueue the normal worker.
              await tx.feedUpload.update({ where: { id: previous.id },
                data: { status: "uploaded", sourceETag: recoveredSource.etag } });
              await tx.feedMediaAsset.update({ where: { id: previous.mediaId },
                data: { status: "uploaded" } });
              await tx.feedStorageJob.create({ data: {
                dedupeKey: `feed-process:${previous.id}`,
                postId, ownerId: actorId, uploadId: previous.id,
                mediaId: previous.mediaId,
                kind: "publish_video",
                sourceKeys: [previous.sourceKey],
              } });
              return { ...previous, status: "uploaded" as const };
            }
            // A POST URL expires before its reservation. Make that reservation
            // retryable immediately and clean up any late-written source key.
            await tx.feedUpload.update({ where: { id: previous.id }, data: { status: "expired" } });
            await tx.feedMediaAsset.update({ where: { id: previous.mediaId }, data: { status: "expired" } });
            await tx.feedStorageJob.create({ data: {
              dedupeKey: `feed-upload-cleanup:${previous.id}`,
              postId, ownerId: actorId, uploadId: previous.id,
              kind: "delete_keys", sourceKeys: [previous.sourceKey],
              availableAt: new Date(Math.max(
                now().getTime(), previous.postExpiresAt.getTime(),
                previous.reservationExpiresAt.getTime(), previous.leaseUntil?.getTime() ?? 0,
              ) + 60_000),
            } });
            return { ...previous, status: "expired" as const };
          }
          return previous;
        }
        const mediaId = randomUUID(), uploadId = randomUUID(), at = now();
        const ext: Record<string,string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };
        const sourceKey = `posts/${actorId}/${postId}/incoming/${uploadId}/source.${ext[value.declaredMime]}`;
        const fingerprint = createHash("sha256").update(JSON.stringify({ postId, kind: value.kind, declaredMime: value.declaredMime, declaredBytes: value.declaredBytes, filename: value.filename, ...(value.purpose === "comment" ? { purpose: "comment" } : {}) })).digest("hex");
        await tx.feedMediaAsset.create({ data: { id: mediaId, postId, ownerId: actorId, kind: value.kind } });
        return tx.feedUpload.create({ data: {
          id: uploadId, postId, ownerId: actorId, mediaId, clientRequestId: value.clientRequestId,
          requestFingerprint: fingerprint, filename: value.filename, declaredMime: value.declaredMime,
          declaredBytes: value.declaredBytes, purpose: value.purpose ?? "post", sourceKey,
          postExpiresAt: new Date(at.getTime() + L.uploadUrlSeconds * 1000),
          reservationExpiresAt: new Date(at.getTime() + L.reservationSeconds * 1000),
        }, include: { media: true } });
      });
      const active = row.status === "reserved" && row.postExpiresAt > now() && row.reservationExpiresAt > now();
      const signed = active ? await storage.presignPost({ key: row.sourceKey, contentType: row.declaredMime, maxBytes: value.kind === "photo" ? L.photoBytes : L.videoBytes, expiresAt: row.postExpiresAt }) : null;
      return {
        uploadId: row.id, postId, mediaId: row.mediaId, status: row.status,
        kind: row.declaredMime.startsWith("image/") ? "photo" : "video",
        postUrl: signed?.url ?? null, postFields: signed?.fields ?? null,
        urlExpiresAt: signed ? row.postExpiresAt.toISOString() : null,
        reservationExpiresAt: row.reservationExpiresAt.toISOString(),
        media: null, errorCode: row.errorCode, errorMessage: row.errorCode ? FEED_ERROR_MESSAGES.MEDIA_PROCESSING_FAILED : null,
      };
    },
    async getUpload(actorId: string, uploadId: string): Promise<FeedUploadDto> {
      await actor(actorId);
      s.feedParse(s.feedIdSchema, uploadId);
      await recoverClientMediaLease(actorId, uploadId);
      const row = await db.feedUpload.findFirst({ where: { id: uploadId, ownerId: actorId } });
      if (!row) throw new FeedError("NOT_FOUND", undefined, 404);
      return {
        uploadId: row.id, postId: row.postId, mediaId: row.mediaId, status: row.status,
        kind: row.declaredMime.startsWith("image/") ? "photo" : "video",
        postUrl: null, postFields: null, urlExpiresAt: null,
        reservationExpiresAt: row.reservationExpiresAt.toISOString(),
        media: null, errorCode: row.errorCode,
        errorMessage: row.errorCode ? FEED_ERROR_MESSAGES.MEDIA_PROCESSING_FAILED : null,
      };
    },
    /** Phone-side photo WebP renditions; old clients retain the Cloud Job route. */
    async reserveClientRenditions(actorId: string, uploadId: string) {
      await actor(actorId);
      if (!storage.signClientRenditions || !storage.publishClientPhoto)
        throw new FeedError("FEED_DISABLED", "Ускоренная загрузка ещё не включена", 503);
      const row = await db.feedUpload.findFirst({ where: { id: uploadId, ownerId: actorId } });
      if (!row) throw new FeedError("NOT_FOUND", undefined, 404);
      if (row.status !== "reserved" || row.reservationExpiresAt <= now() ||
          row.postExpiresAt <= now() || row.declaredMime !== "image/webp" ||
          row.declaredBytes > 1_750_000)
        throw new FeedError("VALIDATION_ERROR", "Недопустимая загрузка готовых фото", 409);
      let staging: ReturnType<typeof feedClientPhotoStageKeys>;
      try { staging = feedClientPhotoStageKeys(row.sourceKey); }
      catch { throw new FeedError("VALIDATION_ERROR", "Неверный временный ключ фото", 422); }
      const guardKeys = [staging.small, staging.medium];
      await transact(async tx => {
        await lock(tx, row.postId);
        const fresh = await tx.feedUpload.findUnique({ where: { id: uploadId } });
        if (!fresh || fresh.ownerId !== actorId || fresh.status !== "reserved")
          throw new FeedError("VALIDATION_ERROR", undefined, 409);
        await tx.feedStorageJob.upsert({
          where: { dedupeKey: `feed-client-staging:${uploadId}` },
          create: { dedupeKey: `feed-client-staging:${uploadId}`, ownerId: actorId,
            uploadId, postId: row.postId, mediaId: row.mediaId, kind: "delete_keys",
            sourceKeys: guardKeys, availableAt: new Date(row.postExpiresAt.getTime() + 60_000) },
          update: {},
        });
        await tx.feedStorageJob.upsert({
          where: { dedupeKey: `feed-client-final-guard:${uploadId}` },
          create: { dedupeKey: `feed-client-final-guard:${uploadId}`, ownerId: actorId,
            uploadId, postId: row.postId, mediaId: row.mediaId, kind: "delete_keys",
            sourceKeys: [`media/v2/${row.mediaId}/v1/image/s.webp`,
              `media/v2/${row.mediaId}/v1/image/m.webp`, `media/v2/${row.mediaId}/v1/image/l.webp`],
            availableAt: new Date(row.reservationExpiresAt.getTime() + 120_000) },
          update: {},
        });
      });
      const signed = await storage.signClientRenditions({
        sourceKey: row.sourceKey, expiresAt: row.postExpiresAt,
      });
      return { small: { ...signed.small, method: "POST" as const },
        medium: { ...signed.medium, method: "POST" as const } };
    },
    async completeClientPhoto(actorId: string, uploadId: string): Promise<FeedUploadDto> {
      await actor(actorId);
      if (!storage.publishClientPhoto)
        throw new FeedError("FEED_DISABLED", "Ускоренная загрузка ещё не включена", 503);
      await recoverClientMediaLease(actorId, uploadId);
      const row = await db.feedUpload.findFirst({ where: { id: uploadId, ownerId: actorId } });
      if (!row) throw new FeedError("NOT_FOUND", undefined, 404);
      if (row.status === "ready") return service.getUpload(actorId, uploadId);
      if (row.status !== "reserved" || row.declaredMime !== "image/webp" ||
          row.reservationExpiresAt <= now() || row.declaredBytes > 1_750_000)
        throw new FeedError("VALIDATION_ERROR", "Файл нельзя подтвердить", 409);
      const head = await storage.head(row.sourceKey);
      if (!head || head.contentType !== "image/webp" || head.bytes !== row.declaredBytes || !head.etag)
        throw new FeedError("VALIDATION_ERROR", "Файл не прошёл проверку S3", 422);
      const token = randomUUID();
      const claimed = await transact(async tx => {
        await lock(tx, row.postId);
        const post = row.purpose === "comment"
          ? await tx.feedPost.findFirst({ where: { id: row.postId, status: "published",
            deletedAt: null, moderationState: "visible" } })
          : await ownedPost(tx, actorId, row.postId);
        if (!post) throw new FeedError("NOT_FOUND", undefined, 404);
        const fresh = await tx.feedUpload.findUnique({ where: { id: uploadId } });
        if (!fresh || fresh.status !== "reserved" || fresh.reservationExpiresAt <= now())
          throw new FeedError("VALIDATION_ERROR", "Повторное подтверждение", 409);
        await tx.feedUpload.update({ where: { id: uploadId }, data: {
          status: "processing", attemptToken: token, sourceETag: head.etag,
          leaseUntil: new Date(now().getTime() + 180_000),
        } });
        await tx.feedMediaAsset.update({ where: { id: row.mediaId }, data: { status: "processing" } });
        return true;
      });
      if (!claimed) throw new FeedError("VALIDATION_ERROR", undefined, 409);
      const keys = { sourceKey: row.sourceKey,
        smallKey: `media/v2/${row.mediaId}/v1/image/s.webp`,
        thumbKey: `media/v2/${row.mediaId}/v1/image/m.webp`,
        fullKey: `media/v2/${row.mediaId}/v1/image/l.webp` };
      try {
        const output = await storage.publishClientPhoto(keys);
        await transact(async tx => {
          await lock(tx, row.postId);
          const fresh = await tx.feedUpload.findUnique({ where: { id: uploadId } });
          if (!fresh || fresh.ownerId !== actorId || fresh.status !== "processing" ||
              fresh.attemptToken !== token)
            throw new FeedError("VALIDATION_ERROR", "Подтверждение устарело", 409);
          const verified = await Promise.all([keys.smallKey,keys.thumbKey,keys.fullKey]
            .map(key => storage.head(key)));
          if (verified.some(v => !v || !v.etag || v.bytes <= 0 || v.contentType !== "image/webp"))
            throw new FeedError("VALIDATION_ERROR", "Варианты фото не найдены в S3", 422);
          await tx.feedMediaAsset.update({ where: { id: row.mediaId }, data: {
            status: "ready", width: output.width, height: output.height,
            smallKey: keys.smallKey, thumbKey: keys.thumbKey, fullKey: keys.fullKey,
          } });
          await tx.feedUpload.update({ where: { id: uploadId }, data: {
            status: "ready", attemptToken: null, leaseUntil: null,
          } });
          await tx.feedStorageJob.updateMany({
            where: { dedupeKey: `feed-client-final-guard:${uploadId}`, ownerId: actorId, status: "pending" },
            data: { status: "completed" },
          });
        });
        return service.getUpload(actorId, uploadId);
      } catch (error) {
        await transact(async tx => {
          await lock(tx, row.postId);
          const reset = await tx.feedUpload.updateMany({
            where: { id: uploadId, ownerId: actorId, status: "processing", attemptToken: token },
            data: { status: "reserved", attemptToken: null, leaseUntil: null },
          });
          if (reset.count) await tx.feedMediaAsset.updateMany({
            where: { id: row.mediaId, ownerId: actorId, status: "processing" }, data: { status: "reserved" },
          });
        });
        throw error;
      }
    },
    /** Reserve only an owner-derived private poster.webp staging key for MP4. */
    async reserveClientVideoPoster(actorId:string,uploadId:string) {
      await actor(actorId);s.feedParse(s.feedIdSchema,uploadId);
      if(!storage.signClientVideoPoster)
        throw new FeedError("FEED_DISABLED","Загрузка обложки недоступна",503);
      const row=await db.feedUpload.findFirst({where:{id:uploadId,ownerId:actorId}});
      if(!row)throw new FeedError("NOT_FOUND",undefined,404);
      if(row.declaredMime!=="video/mp4"||row.status!=="reserved"||
        row.reservationExpiresAt<=now()||row.postExpiresAt<=now())
        throw new FeedError("VALIDATION_ERROR","Загрузка обложки устарела",409);
      const stage=row.sourceKey.replace(/source\.mp4$/,"poster.webp");
      if(stage===row.sourceKey)throw new FeedError("VALIDATION_ERROR",undefined,422);
      await transact(async tx=>{
        await lock(tx,row.postId);
        const fresh=await tx.feedUpload.findUnique({where:{id:uploadId}});
        if(!fresh||fresh.ownerId!==actorId||fresh.status!=="reserved")
          throw new FeedError("VERSION_CONFLICT",undefined,409);
        await tx.feedStorageJob.upsert({
          where:{dedupeKey:`feed-client-video-staging:${uploadId}`},
          create:{dedupeKey:`feed-client-video-staging:${uploadId}`,kind:"delete_keys",
            ownerId:actorId,postId:row.postId,mediaId:row.mediaId,uploadId,
            sourceKeys:[stage],availableAt:new Date(row.postExpiresAt.getTime()+60_000)},update:{},
        });
      });
      return {...await storage.signClientVideoPoster({sourceKey:row.sourceKey,
        expiresAt:row.postExpiresAt}),method:"POST" as const};
    },
    /** A ready H.264 720p and device-generated poster are published here,
     * without waiting on the optional 360p Job.
     * Only server-verified S3 MP4 metadata is accepted; the user supplies no
     * width/fps/duration/key and cannot promote an arbitrary S3 object.
     */
    async completeUpload(actorId: string, uploadId: string): Promise<FeedUploadDto> {
      await actor(actorId);
      s.feedParse(s.feedIdSchema, uploadId);
      if (!storage.enabled || !storage.publishClientVideo)
        throw new FeedError("FEED_DISABLED", "Хранилище видео недоступно", 503);
      await recoverClientMediaLease(actorId, uploadId);
      const row = await db.feedUpload.findFirst({ where: { id: uploadId, ownerId: actorId } });
      if (!row) throw new FeedError("NOT_FOUND", undefined, 404);
      if (row.declaredMime !== "video/mp4")
        throw new FeedError("VALIDATION_ERROR", "Отправьте готовое видео MP4 H.264", 410);
      if (row.status === "ready") return service.getUpload(actorId, uploadId);
      if (row.status !== "reserved" || row.reservationExpiresAt <= now())
        throw new FeedError("UPLOAD_EXPIRED", "Загрузка устарела. Повторите отправку этого видео", 409);
      const metadata = await storage.head(row.sourceKey);
      if (!metadata || metadata.contentType !== "video/mp4" ||
          metadata.bytes !== row.declaredBytes || !metadata.etag)
        throw new FeedError("VALIDATION_ERROR", "S3 не подтвердил загрузку MP4", 422);
      const finalKey = `media/v2/${row.mediaId}/v1/video/720.mp4`;
      const posterKey = `media/v2/${row.mediaId}/v1/poster.webp`;
      const token = randomUUID();
      await transact(async tx => {
        await lock(tx,row.postId);
        const post = row.purpose === "comment"
          ? await tx.feedPost.findFirst({where:{id:row.postId,status:"published",
              deletedAt:null,moderationState:"visible"}})
          : await ownedPost(tx,actorId,row.postId);
        if (!post) throw new FeedError("NOT_FOUND",undefined,404);
        const fresh=await tx.feedUpload.findUnique({where:{id:uploadId}});
        if (!fresh || fresh.ownerId !== actorId || fresh.status !== "reserved" ||
            fresh.reservationExpiresAt <= now())
          throw new FeedError("VERSION_CONFLICT", "Загрузка уже подтверждается", 409);
        await tx.feedStorageJob.upsert({
          where:{dedupeKey:`feed-client-video-final-guard:${uploadId}`},
          create:{dedupeKey:`feed-client-video-final-guard:${uploadId}`,
            ownerId:actorId,postId:row.postId,mediaId:row.mediaId,uploadId,
            kind:"delete_keys",sourceKeys:[finalKey,posterKey],
            availableAt:new Date(row.postExpiresAt.getTime()+180_000)},update:{},
        });
        await tx.feedUpload.update({where:{id:uploadId},data:{status:"processing",
          attemptToken:token,leaseUntil:new Date(now().getTime()+180_000),
          sourceETag:metadata.etag}});
        await tx.feedMediaAsset.update({where:{id:row.mediaId},data:{status:"processing"}});
      });
      try {
        const output=await storage.publishClientVideo({sourceKey:row.sourceKey,
          finalKey,posterKey,bytes:row.declaredBytes});
        const [finalHead,posterHead]=await Promise.all([
          storage.head(finalKey),storage.head(posterKey),
        ]);
        if(!finalHead || finalHead.contentType!=="video/mp4" ||
            finalHead.bytes!==row.declaredBytes || !finalHead.etag ||
            !posterHead || posterHead.contentType!=="image/webp" ||
            posterHead.bytes<12 || posterHead.bytes>1_750_000 || !posterHead.etag)
          throw new FeedError("VALIDATION_ERROR", "MP4 не удалось сохранить в S3", 422);
        await transact(async tx=>{
          await lock(tx,row.postId);
          const fresh=await tx.feedUpload.findUnique({where:{id:uploadId}});
          if(!fresh || fresh.ownerId!==actorId || fresh.status!=="processing" ||
              fresh.attemptToken!==token)
            throw new FeedError("VERSION_CONFLICT", "Подтверждение видео устарело",409);
          await tx.feedMediaAsset.update({where:{id:row.mediaId},data:{
            status:"ready",width:output.width,height:output.height,
            durationSeconds:output.durationSeconds,mp4Keys:[finalKey],posterKey,
          }});
          await tx.feedUpload.update({where:{id:uploadId},data:{
            status:"ready",attemptToken:null,leaseUntil:null,
          }});
          await tx.feedStorageJob.upsert({
            where:{dedupeKey:`feed-video-360:${row.mediaId}`},
            create:{dedupeKey:`feed-video-360:${row.mediaId}`,kind:"publish_video",
              ownerId:actorId,postId:row.postId,mediaId:row.mediaId,
              uploadId:null,sourceKeys:[finalKey],
              targetKeys:[`media/v2/${row.mediaId}/v1/video/360.mp4`],availableAt:now()},
            update:{},
          });
          await tx.feedStorageJob.updateMany({where:{
            dedupeKey:`feed-client-video-final-guard:${uploadId}`,status:"pending",
          },data:{status:"completed"}});
          await tx.feedStorageJob.upsert({
            where:{dedupeKey:`feed-client-video-source-cleanup:${uploadId}`},
            create:{dedupeKey:`feed-client-video-source-cleanup:${uploadId}`,
              kind:"delete_keys",ownerId:actorId,postId:row.postId,
              mediaId:row.mediaId,uploadId,sourceKeys:[row.sourceKey],
              availableAt:new Date(Math.max(now().getTime(),row.postExpiresAt.getTime())+60_000)},
            update:{},
          });
        });
        return service.getUpload(actorId,uploadId);
      }catch(cause){
        await transact(async tx=>{
          await lock(tx,row.postId);
          const reset=await tx.feedUpload.updateMany({where:{id:uploadId,
            ownerId:actorId,status:"processing",attemptToken:token},
            data:{status:"reserved",attemptToken:null,leaseUntil:null}});
          if(reset.count)await tx.feedMediaAsset.updateMany({where:{
            id:row.mediaId,ownerId:actorId,status:"processing"},data:{status:"reserved"}});
        });
        throw cause;
      }
    },
    async cancelUpload(actorId: string, uploadId: string): Promise<FeedUploadDto> {
      await actor(actorId);
      s.feedParse(s.feedIdSchema, uploadId);
      const existing = await db.feedUpload.findFirst({ where: { id: uploadId, ownerId: actorId } });
      if (!existing) throw new FeedError("NOT_FOUND", undefined, 404);
      await transact(async tx => {
        await lock(tx, existing.postId);
        const row = await tx.feedUpload.findUnique({ where: { id: uploadId } });
        if (!row || row.ownerId !== actorId) throw new FeedError("NOT_FOUND", undefined, 404);
        if (!["reserved", "uploaded", "failed"].includes(row.status)) return;
        await tx.feedUpload.update({ where: { id: uploadId }, data: { status: "cancelled", attemptToken: null, leaseUntil: null } });
        await tx.feedMediaAsset.update({ where: { id: row.mediaId }, data: { status: "cancelled" } });
        await tx.feedStorageJob.create({
          data: {
            dedupeKey: `feed-upload-cleanup:${uploadId}`,
            postId: row.postId, ownerId: actorId, uploadId,
            kind: "delete_keys", sourceKeys: row.purpose === "comment"
              ? [row.sourceKey, ...feedPossibleOutputKeys(actorId, row.postId, row.mediaId,
                  row.declaredMime.startsWith("image/") ? "photo" : "video")]
              : [row.sourceKey],
            // An outstanding signed POST can still write this key after cancellation.
            // Delay final deletion until every reservation/lease has expired, plus
            // a safety interval; otherwise a late client upload leaves an orphan.
            availableAt: new Date(Math.max(
              now().getTime(), row.postExpiresAt.getTime(),
              row.reservationExpiresAt.getTime(), row.leaseUntil?.getTime() ?? 0,
            ) + 60_000),
          },
        });
      });
      return service.getUpload(actorId, uploadId);
    },
    async retryUpload(actorId: string, uploadId: string, input: { clientRequestId: string }): Promise<FeedUploadDto> {
      await actor(actorId);
      s.feedParse(s.feedIdSchema, uploadId);
      const validated = s.feedParse(s.feedCreatePostSchema, input);
      const previous = await db.feedUpload.findFirst({ where: { id: uploadId, ownerId: actorId } });
      if (!previous) throw new FeedError("NOT_FOUND", undefined, 404);
      if (!["cancelled", "failed", "expired"].includes(previous.status)) {
        throw new FeedError("VERSION_CONFLICT", "Повтор возможен после ошибки или отмены", 409);
      }
      return service.reserveUpload(actorId, previous.postId, {
        filename: previous.filename,
        kind: previous.declaredMime.startsWith("image/") ? "photo" : "video",
        declaredMime: previous.declaredMime as FeedReserveUploadInput["declaredMime"],
        declaredBytes: previous.declaredBytes,
        ...(previous.purpose === "comment" ? { purpose: "comment" as const } : {}),
        clientRequestId: validated.clientRequestId,
      });
    },
    /** Reuse already-encoded Gallery WebP through S3 CopyObject, not a photo Job.
     * The idempotency binding is a FeedUpload row, never a queued image job.
     */
    async copyAlbumPhoto(actorId: string, postId: string, input: FeedCopyAlbumPhotoInput) {
      await actor(actorId);
      if (!storage.enabled || !storage.copyGalleryPhotoVariants)
        throw new FeedError("FEED_DISABLED", "Копирование фото из альбома не настроено", 503);
      const value = s.feedParse(s.feedCopyPhotoSchema, input);
      const fingerprint = createHash("sha256").update(JSON.stringify({
        kind: "album-webp-copy", postId, photoId: value.photoId,
      })).digest("hex");
      const pending = await transact(async tx => {
        await lock(tx, postId);
        const post = await ownedPost(tx, actorId, postId);
        checkEditable(post, now());
        const photo = await tx.galleryPhoto.findFirst({ where: {
          id: value.photoId, ownerId: actorId, deletedAt: null, status: "ready",
          album: { deletedAt: null },
        } });
        if (!photo?.thumbKey || !photo.fullKey)
          throw new FeedError("NOT_FOUND", "Фотография недоступна", 404);
        const previous = await tx.feedUpload.findUnique({
          where: { ownerId_clientRequestId: { ownerId: actorId, clientRequestId: value.clientRequestId } },
        });
        if (previous && (previous.postId !== postId ||
            previous.requestFingerprint !== fingerprint || previous.declaredMime !== "image/webp"))
          throw new FeedError("VERSION_CONFLICT", "Конфликт повторной отправки", 409);
        if (previous && !["ready", "processing"].includes(previous.status))
          throw new FeedError("VERSION_CONFLICT", "Фотография уже отменена", 409);
        if (previous) return {
          uploadId: previous.id, mediaId: previous.mediaId,
          photoId: photo.id, albumId: photo.albumId,
          thumbKey: photo.thumbKey, fullKey: photo.fullKey,
          ready: previous.status === "ready",
        };
        const uploadId = randomUUID(), mediaId = randomUUID(), at = now();
        await tx.feedMediaAsset.create({ data: {
          id: mediaId, ownerId: actorId, postId, kind: "photo", status: "processing",
        } });
        await tx.feedUpload.create({ data: {
          id: uploadId, ownerId: actorId, postId, mediaId,
          clientRequestId: value.clientRequestId, requestFingerprint: fingerprint,
          filename: "album-photo.webp", declaredMime: "image/webp",
          declaredBytes: 1, purpose: "post", status: "processing",
          sourceKey: `posts/${actorId}/${postId}/incoming/${uploadId}/source.webp`,
          postExpiresAt: new Date(at.getTime() + 600_000),
          reservationExpiresAt: new Date(at.getTime() + 900_000),
        } });
        return { uploadId, mediaId, photoId: photo.id, albumId: photo.albumId,
          thumbKey: photo.thumbKey, fullKey: photo.fullKey, ready: false };
      });
      if (pending.ready) {
        const existing = await db.feedMediaAsset.findUnique({ where: { id: pending.mediaId } });
        if (!existing || existing.ownerId !== actorId || existing.status !== "ready")
          throw new FeedError("VERSION_CONFLICT", "Результат копирования изменился", 409);
        return { id: existing.id, kind: "photo" as const, position: 0,
          status: "ready" as const, width: existing.width, height: existing.height,
          durationSeconds: null, thumbUrl: null, fullUrl: null,
          posterUrl: null, urlsExpireAt: null };
      }
      const copied = await storage.copyGalleryPhotoVariants({
        ownerId: actorId, albumId: pending.albumId, photoId: pending.photoId,
        mediaId: pending.mediaId, thumbKey: pending.thumbKey, fullKey: pending.fullKey,
      });
      await transact(async tx => {
        await lock(tx, postId);
        const post = await ownedPost(tx, actorId, postId);
        if (post.deletedAt) throw new FeedError("NOT_FOUND", undefined, 404);
        const row = await tx.feedUpload.findUnique({ where: { id: pending.uploadId } });
        if (!row || row.ownerId !== actorId || row.mediaId !== pending.mediaId ||
            !["processing", "ready"].includes(row.status))
          throw new FeedError("VERSION_CONFLICT", "Копирование отменено", 409);
        if (row.status === "ready") return;
        const prefix = `media/v2/${pending.mediaId}/v1/image/`;
        for (const key of [prefix+"s.webp",prefix+"m.webp",prefix+"l.webp"]) {
          const meta = await storage.head(key);
          if (!meta || meta.contentType !== "image/webp" || !meta.etag || !meta.bytes)
            throw new FeedError("VALIDATION_ERROR", "S3 не подтвердил скопированное фото", 422);
        }
        await tx.feedMediaAsset.update({ where: { id: pending.mediaId }, data: {
          status: "ready", width: copied.width, height: copied.height,
          smallKey: prefix + "s.webp", thumbKey: prefix + "m.webp", fullKey: prefix + "l.webp",
        } });
        await tx.feedUpload.update({ where: { id: pending.uploadId }, data: { status: "ready" } });
      });
      return { id: pending.mediaId, kind: "photo" as const, position: 0,
        status: "ready" as const, width: copied.width, height: copied.height,
        durationSeconds: null, thumbUrl: null, fullUrl: null,
        posterUrl: null, urlsExpireAt: null };
    },
    // Asset completion is handled exclusively by createFeedStorageJobs.complete():
    // its lease token and transactional CAS prevent a stale processor from publishing.
  };
  return service;
}
export type FeedService = ReturnType<typeof createFeedService>;
