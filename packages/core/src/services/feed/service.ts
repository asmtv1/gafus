import { assertFeedPublishingAllowed } from "./preferences";
import { activateFeedPostRevisionTx } from "./publish";
import { enqueueFeedPostCleanup } from "./cleanup";
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
const authorSelect = { id: true, username: true, profile: { select: { fullName: true, avatarUrl: true } } } as const;
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
    const [versions, views, comments, counts, mine, bookmarks, preferences] = await Promise.all([
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
    ]);
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
    const expire = new Date(at.getTime() + L.mediaUrlSeconds * 1000);
    const sign = (key: string | null) => key ? storage.signCdn({ key, expiresAt: expire }) : Promise.resolve(null);
    return Promise.all(posts.map(async post => {
      const revision = post.activeRevisionId ? versionById.get(post.activeRevisionId) : undefined;
      const attachments: FeedMediaDto[] = await Promise.all((revision?.attachments ?? []).map(async ({ media, position }) => ({
        id: media.id, kind: media.kind, position, status: media.status, width: media.width, height: media.height,
        durationSeconds: media.durationSeconds, thumbUrl: await sign(media.thumbKey),
        fullUrl: await sign(media.fullKey), posterUrl: await sign(media.posterKey),
        urlsExpireAt: media.status === "ready" ? expire.toISOString() : null,
      })));
      const editUntil = post.publishedAt ? new Date(post.publishedAt.getTime() + L.editSeconds * 1000) : null;
      const published = post.status === "published" && !!revision;
      return {
        id: post.id, bookmarked: saved.has(post.id), authorHidden: prefs.get(post.authorId)?.hidden ?? false,
        authorNotify: prefs.get(post.authorId)?.notify ?? false,
        moderationState: post.moderationState, moderationReason: post.authorId === actorId ? post.moderationReason : null,
        author: {
          id: post.author.id, username: post.author.username,
          name: post.author.profile?.fullName ?? post.author.username,
          avatarUrl: post.author.profile?.avatarUrl ?? null,
        },
        status: post.status, text: revision?.text ?? "", attachments,
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
    async fallbackSource(actorId: string, mediaId: string, variant: "thumb" | "full" | "poster") {
      await actor(actorId);
      s.feedParse(s.feedIdSchema, mediaId);
      const media = await db.feedMediaAsset.findFirst({ where: { id: mediaId, status: "ready" } });
      if (!media || (variant === "poster" ? media.kind !== "video" : media.kind !== "photo"))
        throw new FeedError("NOT_FOUND", undefined, 404);
      const post = await db.feedPost.findFirst({
        where: { id: media.postId, status: "published", deletedAt: null, moderationState: "visible" },
      });
      if (!post?.activeRevisionId || !await db.feedRevisionAttachment.findFirst({
        where: { revisionId: post.activeRevisionId, mediaId }, select: { mediaId: true },
      })) throw new FeedError("NOT_FOUND", undefined, 404);
      const key = variant === "thumb" ? media.thumbKey : variant === "full" ? media.fullKey : media.posterKey;
      if (!key) throw new FeedError("NOT_FOUND", undefined, 404);
      return { key };
    },
    async playbackSource(actorId: string, mediaId: string) {
      await actor(actorId);
      s.feedParse(s.feedIdSchema, mediaId);
      const media = await db.feedMediaAsset.findFirst({ where: { id: mediaId, kind: "video", status: "ready" } });
      if (!media?.playlistKey) throw new FeedError("NOT_FOUND", undefined, 404);
      const post = await db.feedPost.findFirst({ where: { id: media.postId, status: "published", deletedAt: null, moderationState: "visible" } });
      if (!post?.activeRevisionId || !await db.feedRevisionAttachment.findFirst({
        where: { revisionId: post.activeRevisionId, mediaId }, select: { mediaId: true },
      })) throw new FeedError("NOT_FOUND", undefined, 404);
      return { ownerId: media.ownerId, postId: media.postId, mediaId: media.id,
        playlistKey: media.playlistKey, segmentKeys: media.videoSegmentKeys };
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
        const media = await tx.feedMediaAsset.findMany({ where: { id: { in: value.attachmentIds }, postId, ownerId: actorId, status: { notIn: ["failed", "cancelled", "expired"] } } });
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
      const row = await transact(async tx => {
        await lock(tx, postId);
        const post = await ownedPost(tx, actorId, postId);
        checkEditable(post, now());
        const previous = await tx.feedUpload.findUnique({ where: { ownerId_clientRequestId: { ownerId: actorId, clientRequestId: value.clientRequestId } }, include: { media: true } });
        if (previous) {
          const fingerprint = createHash("sha256").update(JSON.stringify({ postId, kind: value.kind, declaredMime: value.declaredMime, declaredBytes: value.declaredBytes, filename: value.filename })).digest("hex");
          if (previous.requestFingerprint !== fingerprint) throw new FeedError("VERSION_CONFLICT", undefined, 409);
          return previous;
        }
        const mediaId = randomUUID(), uploadId = randomUUID(), at = now();
        const ext: Record<string,string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };
        const sourceKey = `posts/${actorId}/${postId}/incoming/${uploadId}/source.${ext[value.declaredMime]}`;
        const fingerprint = createHash("sha256").update(JSON.stringify({ postId, kind: value.kind, declaredMime: value.declaredMime, declaredBytes: value.declaredBytes, filename: value.filename })).digest("hex");
        await tx.feedMediaAsset.create({ data: { id: mediaId, postId, ownerId: actorId, kind: value.kind } });
        return tx.feedUpload.create({ data: {
          id: uploadId, postId, ownerId: actorId, mediaId, clientRequestId: value.clientRequestId,
          requestFingerprint: fingerprint, filename: value.filename, declaredMime: value.declaredMime,
          declaredBytes: value.declaredBytes, sourceKey,
          postExpiresAt: new Date(at.getTime() + L.uploadUrlSeconds * 1000),
          reservationExpiresAt: new Date(at.getTime() + L.reservationSeconds * 1000),
        }, include: { media: true } });
      });
      const active = row.status === "reserved" && row.postExpiresAt > now() && row.reservationExpiresAt > now();
      const signed = active ? await storage.presignPost({ key: row.sourceKey, contentType: row.declaredMime, maxBytes: value.kind === "photo" ? L.photoBytes : L.videoBytes, expiresAt: row.postExpiresAt }) : null;
      return {
        uploadId: row.id, postId, mediaId: row.mediaId, status: row.status,
        postUrl: signed?.url ?? null, postFields: signed?.fields ?? null,
        urlExpiresAt: signed ? row.postExpiresAt.toISOString() : null,
        reservationExpiresAt: row.reservationExpiresAt.toISOString(),
        media: null, errorCode: row.errorCode, errorMessage: row.errorCode ? FEED_ERROR_MESSAGES.MEDIA_PROCESSING_FAILED : null,
      };
    },
    async getUpload(actorId: string, uploadId: string): Promise<FeedUploadDto> {
      await actor(actorId);
      s.feedParse(s.feedIdSchema, uploadId);
      const row = await db.feedUpload.findFirst({ where: { id: uploadId, ownerId: actorId } });
      if (!row) throw new FeedError("NOT_FOUND", undefined, 404);
      return {
        uploadId: row.id, postId: row.postId, mediaId: row.mediaId, status: row.status,
        postUrl: null, postFields: null, urlExpiresAt: null,
        reservationExpiresAt: row.reservationExpiresAt.toISOString(),
        media: null, errorCode: row.errorCode,
        errorMessage: row.errorCode ? FEED_ERROR_MESSAGES.MEDIA_PROCESSING_FAILED : null,
      };
    },
    async completeUpload(actorId: string, uploadId: string): Promise<FeedUploadDto> {
      await actor(actorId);
      s.feedParse(s.feedIdSchema, uploadId);
      if (!storage.enabled) throw new FeedError("FEED_DISABLED", "Обработка вложений пока недоступна", 503);
      const existing = await db.feedUpload.findFirst({ where: { id: uploadId, ownerId: actorId } });
      if (!existing) throw new FeedError("NOT_FOUND", undefined, 404);
      if (existing.status !== "reserved") return service.getUpload(actorId, uploadId);
      if (existing.reservationExpiresAt <= now()) {
        await db.feedUpload.updateMany({
          where: { id: uploadId, ownerId: actorId, status: "reserved" },
          data: { status: "expired" },
        });
        throw new FeedError("UPLOAD_EXPIRED", undefined, 409);
      }
      const metadata = await storage.head(existing.sourceKey);
      if (!metadata) throw new FeedError("VALIDATION_ERROR", "Загрузка файла ещё не завершена", 409);
      if (metadata.contentType !== existing.declaredMime || metadata.bytes !== existing.declaredBytes ||
          metadata.bytes <= 0 || metadata.bytes > (existing.declaredMime.startsWith("image/") ? L.photoBytes : L.videoBytes)) {
        throw new FeedError("VALIDATION_ERROR", "Файл не соответствует заявленным параметрам", 422);
      }
      await transact(async tx => {
        await lock(tx, existing.postId);
        const post = await ownedPost(tx, actorId, existing.postId);
        if (post.deletedAt) throw new FeedError("NOT_FOUND", undefined, 404);
        const fresh = await tx.feedUpload.findUnique({ where: { id: uploadId } });
        if (fresh?.status !== "reserved") return;
        if (fresh.reservationExpiresAt <= now()) throw new FeedError("UPLOAD_EXPIRED", undefined, 409);
        await tx.feedUpload.update({
          where: { id: uploadId },
          data: { status: "uploaded", sourceETag: metadata.etag },
        });
        await tx.feedMediaAsset.update({
          where: { id: fresh.mediaId },
          data: { status: "uploaded" },
        });
        await tx.feedStorageJob.create({
          data: {
            dedupeKey: `feed-process:${uploadId}`, postId: fresh.postId,
            ownerId: actorId, uploadId, mediaId: fresh.mediaId,
            kind: fresh.declaredMime.startsWith("image/") ? "publish_photo" : "publish_video",
            sourceKeys: [fresh.sourceKey],
          },
        });
      });
      return service.getUpload(actorId, uploadId);
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
            kind: "delete_keys", sourceKeys: [row.sourceKey],
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
        clientRequestId: validated.clientRequestId,
      });
    },
    async copyAlbumPhoto(actorId: string, postId: string, input: FeedCopyAlbumPhotoInput) {
      await actor(actorId);
      if (!storage.enabled) throw new FeedError("FEED_DISABLED", "Обработка вложений пока недоступна", 503);
      const value = s.feedParse(s.feedCopyPhotoSchema, input);
      return transact(async tx => {
        await lock(tx, postId);
        const post = await ownedPost(tx, actorId, postId);
        const previous = await tx.feedStorageJob.findUnique({
          where: { dedupeKey: `copy-album:${postId}:${value.clientRequestId}` },
        });
        if (previous) {
          if (!previous.mediaId || previous.ownerId !== actorId) {
            throw new FeedError("VERSION_CONFLICT", undefined, 409);
          }
          const existing = await tx.feedMediaAsset.findFirst({
            where: { id: previous.mediaId, postId, ownerId: actorId },
          });
          if (!existing) throw new FeedError("NOT_FOUND", undefined, 404);
          return {
            id: existing.id, kind: "photo" as const, position: 0, status: existing.status,
            width: existing.width, height: existing.height, durationSeconds: null,
            thumbUrl: null, fullUrl: null, posterUrl: null, urlsExpireAt: null,
          };
        }
        checkEditable(post, now());
        const photo = await tx.galleryPhoto.findFirst({
          where: { id: value.photoId, ownerId: actorId, deletedAt: null, status: "ready",
            album: { deletedAt: null } },
        });
        if (!photo?.thumbKey || !photo.fullKey) throw new FeedError("NOT_FOUND", "Фотография недоступна", 404);
        const id = randomUUID();
        const base = `posts/${actorId}/${postId}/attachments/${id}`;
        await tx.feedMediaAsset.create({ data: { id, postId, ownerId: actorId, kind: "photo", status: "processing" } });
        await tx.feedStorageJob.create({ data: {
          dedupeKey: `copy-album:${postId}:${value.clientRequestId}`, ownerId: actorId, postId, mediaId: id,
          kind: "copy_album", sourceKeys: [photo.thumbKey, photo.fullKey],
          targetKeys: [`${base}/thumb.webp`, `${base}/full.webp`],
        } });
        return { id, kind: "photo" as const, position: 0, status: "processing" as const,
          width: photo.width, height: photo.height, durationSeconds: null, thumbUrl: null,
          fullUrl: null, posterUrl: null, urlsExpireAt: null };
      });
    },
    // Asset completion is handled exclusively by createFeedStorageJobs.complete():
    // its lease token and transactional CAS prevent a stale processor from publishing.
  };
  return service;
}
export type FeedService = ReturnType<typeof createFeedService>;
