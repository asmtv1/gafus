import { createFeedPlayback } from "./playback.js";
import { FeedError, feedParse, feedListSchema, feedPostListSchema, feedReactionListSchema,
  feedCreatePostSchema, feedRevisionSchema, feedPublishSchema, feedCommentSchema, feedCommentEditSchema,
  feedReactionSchema, feedUploadSchema, feedCopyPhotoSchema, feedIdSchema, feedPollSaveSchema, feedPollVoteSchema,
  smartImpressionsSchema, smartRankingEventsSchema, smartRedisTimeout, smartFeedbackSchema, isSmartMlVector, verifySmartExposure,
  hasSmartFeedActor, getSmartFeedTelemetryPreference,
  eligibleSmartImpressionPostIds, recordSmartFeedImpressions,
  createCurrentFeedRuntime, eligibleSmartOutcomePostIds, getQualifiedSmartImpressions,
  recordSmartFeedRankingEvents, storeSmartFeedPostFeedback,
} from "@gafus/core/services/feed";
import type { FeedService, FeedSocialService, FeedPollService, createFeedPreferences } from "@gafus/core/services/feed";
import { createFeedStorageFromEnv, signFeedCloudruFallback } from "@gafus/feed-storage";

export const FEED_MAX_BODY_BYTES = 65_536;
const allowed = new Set(["GET", "POST", "PATCH", "PUT", "DELETE"]);
const flag = () => process.env.FEED_ENABLED === "true" && process.env.FEED_PROCESSOR_READY === "true";
const storage = createFeedStorageFromEnv();
const { service, social, preferences, smartPreferences, polls } = createCurrentFeedRuntime(storage, flag);
export interface FeedHttpError {
  status: number;
  body: { success: false; error: string; code: string };
}
export function feedHttpError(error: unknown): FeedHttpError {
  if (error instanceof FeedError) {
    return { status: error.status, body: { success: false, error: error.message, code: error.code } };
  }
  return { status: 500, body: { success: false, error: "Не удалось выполнить запрос раздела «Моменты»", code: "INTERNAL_ERROR" } };
}
async function readJson(request: Request) {
  const type = request.headers.get("content-type");
  if (type && type.split(";")[0]?.trim().toLowerCase() !== "application/json") throw new FeedError("VALIDATION_ERROR", "Принимается только JSON", 415);
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > FEED_MAX_BODY_BYTES) throw new FeedError("VALIDATION_ERROR", "Слишком большой запрос", 413);
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > FEED_MAX_BODY_BYTES) {
        await reader.cancel();
        throw new FeedError("VALIDATION_ERROR", "Слишком большой запрос", 413);
      }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  if (!length) return {};
  if (!type) throw new FeedError("VALIDATION_ERROR", "Принимается только JSON", 415);
  const merged = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(merged);
    return JSON.parse(decoded) as unknown;
  } catch {
    throw new FeedError("VALIDATION_ERROR", "Некорректный JSON", 400);
  }
}
function assertEmpty(body: unknown) {
  if (typeof body !== "object" || !body || Array.isArray(body) || Object.keys(body).length !== 0)
    throw new FeedError("VALIDATION_ERROR", "Тело должно быть пустым объектом", 400);
}
function partsFromPath(path: string) {
  if (path.length > 2048 || path.includes("\\")) throw new FeedError("NOT_FOUND", undefined, 404);
  try {
    return path.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    throw new FeedError("NOT_FOUND", undefined, 404);
  }
}
function parseQuery(url: URL, reaction = false, postSort = false) {
  const entries = [...url.searchParams.entries()];
  const accepted = reaction ? ["cursor", "pageSize", "reaction"] : postSort ? ["cursor", "pageSize", "sort"] : ["cursor", "pageSize"];
  if (entries.some(([key]) => !accepted.includes(key)) || new Set(entries.map(([key]) => key)).size !== entries.length)
    throw new FeedError("VALIDATION_ERROR", "Некорректные параметры списка", 400);
  const size = url.searchParams.get("pageSize"), cursor = url.searchParams.get("cursor");
  if (size !== null && !/^[1-9]\d{0,2}$/.test(size)) throw new FeedError("VALIDATION_ERROR", "Некорректный размер страницы", 400);
  const input = {
    ...(size !== null ? { pageSize: Number(size) } : {}),
    ...(cursor !== null ? { cursor } : {}),
    ...(reaction && url.searchParams.has("reaction") ? { reaction: url.searchParams.get("reaction") } : {}),
    ...(postSort && url.searchParams.has("sort") ? { sort: url.searchParams.get("sort") } : {}),
  };
  return reaction ? feedParse(feedReactionListSchema, input) : postSort ? feedParse(feedPostListSchema, input) : feedParse(feedListSchema, input);
}
function routeId(input: string) { return feedParse(feedIdSchema, input); }

export async function dispatchFeedRequest(
  actorId: string,
  request: Request,
  path: string,
  posts: FeedService = service,
  actions: FeedSocialService = social,
  personal: ReturnType<typeof createFeedPreferences> = preferences,
  pollActions: FeedPollService = polls,
): Promise<unknown> {
  const method = request.method.toUpperCase();
  if (!allowed.has(method)) throw new FeedError("VALIDATION_ERROR", "Метод не поддерживается", 405);
  const pathParts = partsFromPath(path), url = new URL(request.url);
  const [one, two, three] = pathParts;
  const len = pathParts.length;
  const input = method === "GET" ? undefined : await readJson(request);
  const is = (n: number, first: string, last?: string) =>
    len === n && one === first && (last === undefined || pathParts[n - 1] === last);

  if (is(1, "status") && method === "GET") return {
    enabled: flag() && storage.enabled,
    smartEnabled: flag() && storage.enabled && process.env.FEED_SMART_ENABLED === "true",
  };
  if (is(1, "personalization")) {
    if (process.env.FEED_SMART_ENABLED !== "true") throw new FeedError("FEED_DISABLED", undefined, 503);
    if (method === "GET") return smartPreferences.get(actorId);
    if (method === "PATCH") return smartPreferences.patch(actorId, input);
  }
  if (len === 2 && one === "personalization" && two === "reset" && method === "POST") {
    if (process.env.FEED_SMART_ENABLED !== "true") throw new FeedError("FEED_DISABLED", undefined, 503);
    assertEmpty(input);
    return smartPreferences.reset(actorId);
  }
  if (len === 2 && one === "impressions" && two === "batch" && method === "POST") {
    if (!await hasSmartFeedActor(actorId))
      throw new FeedError("UNAUTHENTICATED", undefined, 401);
    const { events } = feedParse(smartImpressionsSchema, input);
    if (process.env.FEED_SMART_ENABLED !== "true") return { accepted: 0 };
    const preference = await getSmartFeedTelemetryPreference(actorId);
    if (preference?.enabled === false) return { accepted: 0 };
    const preferencesUpdatedAt = preference?.updatedAt.getTime() ?? 0;
    const { connection } = await import("@gafus/queues");
    if (connection.status !== "ready") return { accepted: 0, retryable: true };
    type Snapshot = {
      actorId: string; version: string; preferencesUpdatedAt: number;
      modelVersion?: string | null; experimentVariant?: "control" | "treatment" | null;
      rows: { id: string; features?: number[]; sources?: string[]; exposureToken?: string }[];
    };
    const sessions = new Map<string, Snapshot>();
    const sessionIds = [...new Set(events.map(event => event.rankingSessionId))];
    // Fetch in parallel so malformed/bogus session IDs cannot multiply Redis
    // timeouts sequentially. Impressions are best-effort, never block the feed.
    try {
      const raws = await Promise.all(sessionIds.map(sessionId =>
        smartRedisTimeout(connection.get(`feed:smart:${sessionId}`)),
      ));
      raws.forEach((raw, index) => {
        if (raw) sessions.set(sessionIds[index]!, JSON.parse(raw) as Snapshot);
      });
    } catch {
      return { accepted: 0, retryable: true };
    }
    const verified = events.filter(event => {
      const session = sessions.get(event.rankingSessionId);
      return verifySmartExposure(session, actorId, preferencesUpdatedAt, event,
        process.env.FEED_SMART_EXPOSURE_TOKENS_REQUIRED === "true");
    });
    if (!verified.length) return { accepted: 0 };
    const visible = await eligibleSmartImpressionPostIds(actorId, verified.map(event => event.postId));
    const allowedPosts = new Set(visible);
    const data = verified.filter(event => allowedPosts.has(event.postId)).map(event => {
      const session = sessions.get(event.rankingSessionId)!;
      const snapshot = session.rows[event.rank]!;
      return {
        eventId: event.eventId, userId: actorId, postId: event.postId,
        rankingSessionId: event.rankingSessionId, algorithmVersion: event.algorithmVersion,
        rank: event.rank, visibleMs: event.visibleMs,
        features: isSmartMlVector(snapshot.features) ? snapshot.features : undefined,
        candidateSources: (snapshot.sources ?? []).filter(source =>
          ["recent", "local", "pet", "affinity", "trending"].includes(source),
        ).slice(0, 5),
        modelVersion: typeof session.modelVersion === "string" ? session.modelVersion : null,
        experimentVariant: session.experimentVariant === "control" || session.experimentVariant === "treatment"
          ? session.experimentVariant : null,
      };
    });
    if (!data.length) return { accepted: 0 };
    const accepted = await recordSmartFeedImpressions(data);
    return { accepted };
  }
  if (len === 2 && one === "ranking-events" && two === "batch" && method === "POST") {
    const { events } = feedParse(smartRankingEventsSchema, input);
    if (process.env.FEED_SMART_ENABLED !== "true" || process.env.FEED_SMART_EVENTS_ENABLED !== "true") {
      return { accepted: 0 };
    }
    if (!await hasSmartFeedActor(actorId)) {
      throw new FeedError("UNAUTHENTICATED", undefined, 401);
    }
    const preference = await getSmartFeedTelemetryPreference(actorId);
    if (preference?.enabled === false || preference?.useBehavior === false) return { accepted: 0 };
    const { connection } = await import("@gafus/queues");
    if (connection.status !== "ready") return { accepted: 0, retryable: true };
    // Shared Redis limiter; client-controlled event IDs never decide quota or identity.
    const windowKey = `feed:ranking-events:limit:${actorId}:${Math.floor(Date.now() / 60_000)}`;
    try {
      const hits = await smartRedisTimeout(connection.incrby(windowKey, events.length));
      if (hits === events.length) await smartRedisTimeout(connection.expire(windowKey, 70));
      if (hits > 180) return { accepted: 0, retryable: true };
    } catch { return { accepted: 0, retryable: true }; }
    const ids = [...new Set(events.map(event => event.rankingSessionId))];
    const sessions = new Map<string, {
      actorId: string; version: string; preferencesUpdatedAt: number;
      rows: { id: string; exposureToken?: string }[];
    }>();
    try {
      const raws = await Promise.all(ids.map(id => smartRedisTimeout(connection.get(`feed:smart:${id}`))));
      raws.forEach((raw, index) => {
        if (raw) sessions.set(ids[index]!, JSON.parse(raw));
      });
    } catch { return { accepted: 0, retryable: true }; }
    const prefVersion = preference?.updatedAt.getTime() ?? 0;
    const validated = events.filter(event => {
      const snapshot = sessions.get(event.rankingSessionId);
      return verifySmartExposure(snapshot, actorId, prefVersion, event);
    });
    if (!validated.length) return { accepted: 0 };
    // No event for hidden, removed, blocked or own content.
    const eligible = await eligibleSmartOutcomePostIds(
      actorId, [...new Set(validated.map(event => event.postId))],
    );
    const idsAllowed = new Set(eligible);
    const impressions = await getQualifiedSmartImpressions(actorId,
      validated.filter(event => idsAllowed.has(event.postId)).map(event => ({
        postId: event.postId, rankingSessionId: event.rankingSessionId,
      })),
    );
    const qualified = new Set(impressions.map(row => `${row.rankingSessionId}:${row.postId}`));
    const accepted = validated.filter(event => idsAllowed.has(event.postId) &&
      qualified.has(`${event.rankingSessionId}:${event.postId}`)).map(event => ({
      eventId: event.eventId, userId: actorId, postId: event.postId,
      rankingSessionId: event.rankingSessionId, kind: event.kind,
      durationMs: event.kind === "dwell" ? Math.min(event.durationMs ?? 0, 120_000) : 0,
    }));
    if (!accepted.length) return { accepted: 0 };
    const inserted = await recordSmartFeedRankingEvents(accepted);
    return { accepted: inserted };
  }
  if (len === 3 && one === "media") {
    const mediaId = routeId(two!);
    if (three === "fallback" && method === "POST") {
      if (url.search || process.env.FEED_MEDIA_FALLBACK_ENABLED !== "true")
        throw new FeedError("NOT_FOUND", undefined, 404);
      if (!input || typeof input !== "object" || Array.isArray(input) ||
          Object.keys(input).length !== 1 || !("variant" in input) ||
          !["thumb", "full", "poster"].includes(String(input.variant)))
        throw new FeedError("VALIDATION_ERROR", "Недопустимый вариант файла", 400);
      const { key } = await posts.fallbackSource(actorId, mediaId, input.variant as "thumb" | "full" | "poster");
      const fallbackUrl = await signFeedCloudruFallback(key);
      return { url: fallbackUrl, source: "cloudru", expiresAt: new Date(Date.now() + 120_000).toISOString() };
    }
    if (three === "playback" && method === "POST") {
      assertEmpty(input);
      if (url.search) throw new FeedError("VALIDATION_ERROR", undefined, 400);
      return playbackService(posts).ticket(actorId, mediaId);
    }
    if (three === "manifest" && method === "GET") {
      const entries = [...url.searchParams];
      if (entries.length !== 1 || entries[0]?.[0] !== "ticket") throw new FeedError("VALIDATION_ERROR", undefined, 400);
      return playbackService(posts).manifest(mediaId, entries[0][1], actorId);
    }
  }
  if (len === 2 && one === "me" && two === "bookmarks" && method === "GET") return posts.list(actorId, parseQuery(url), true);
  if (len === 2 && one === "me" && two === "hidden-authors" && method === "GET") return personal.hiddenAuthors(actorId, parseQuery(url));
  if (len === 3 && one === "authors" && three === "preferences" && method === "PATCH") return personal.preference(actorId, routeId(two!), input);
  if (len === 3 && (one === "posts" || one === "comments") && three === "report" && method === "POST") return personal.report(actorId, one === "posts" ? "post" : "comment", routeId(two!), input);
  if (len === 3 && one === "posts" && three === "bookmark" && (method === "PUT" || method === "DELETE")) {
    assertEmpty(input); return personal.bookmark(actorId, routeId(two!), method === "PUT");
  }
  if (is(1, "posts") && method === "GET") return posts.list(actorId, parseQuery(url, false, true));
  if (len === 3 && one === "profiles" && three === "posts" && method === "GET")
    return posts.listProfile(actorId, two!, parseQuery(url));
  if (len === 2 && one === "me" && two === "pending-posts" && method === "GET")
    return posts.pending(actorId, parseQuery(url));
  if (is(1, "posts") && method === "POST")
    return posts.create(actorId, feedParse(feedCreatePostSchema, input));
  if (len === 3 && one === "posts" && three === "poll") {
    if (url.search) throw new FeedError("VALIDATION_ERROR", undefined, 400);
    const postId = routeId(two!);
    if (method === "GET") return pollActions.get(actorId, postId);
    if (method === "PUT") return pollActions.save(actorId, postId, feedParse(feedPollSaveSchema, input));
    if (method === "DELETE") { assertEmpty(input); return pollActions.remove(actorId, postId); }
  }
  if (len === 4 && one === "posts" && three === "poll" && pathParts[3] === "vote" && method === "POST") {
    if (url.search) throw new FeedError("VALIDATION_ERROR", undefined, 400);
    return pollActions.vote(actorId, routeId(two!), feedParse(feedPollVoteSchema, input));
  }
  if (len >= 2 && one === "posts") {
    const id = routeId(two!);
    if (len === 3 && three === "feedback" && method === "POST") {
      if (process.env.FEED_SMART_ENABLED !== "true") throw new FeedError("FEED_DISABLED", undefined, 503);
      const { kind } = feedParse(smartFeedbackSchema, input);
      return storeSmartFeedPostFeedback({ actorId, postId: id, kind });
    }
    if (len === 2 && method === "GET") return posts.get(actorId, id);
    if (len === 2 && method === "DELETE") { assertEmpty(input); return posts.remove(actorId, id); }
    if (len === 3 && three === "editor" && method === "GET") return posts.editor(actorId, id);
    if (len === 3 && three === "revisions" && method === "PUT") return posts.saveRevision(actorId, id, feedParse(feedRevisionSchema, input));
    if (len === 3 && three === "publish" && method === "POST") return posts.publish(actorId, id, feedParse(feedPublishSchema, input));
    if (len === 3 && three === "uploads" && method === "POST") return posts.reserveUpload(actorId, id, feedParse(feedUploadSchema, input));
    if (len === 3 && three === "album-copies" && method === "POST") return posts.copyAlbumPhoto(actorId, id, feedParse(feedCopyPhotoSchema, input));
    if (len === 3 && three === "comments") {
      if (method === "GET") return actions.listComments(actorId, id, parseQuery(url));
      if (method === "POST") return actions.createComment(actorId, id, feedParse(feedCommentSchema, input));
    }
    if (len === 3 && three === "reaction") {
      if (method === "PUT") { const { reaction } = feedParse(feedReactionSchema, input); await actions.setPostReaction(actorId, id, reaction); return posts.get(actorId, id); }
      if (method === "DELETE") { assertEmpty(input); await actions.removePostReaction(actorId, id); return posts.get(actorId, id); }
    }
    if (len === 3 && three === "reactions" && method === "GET") return actions.reactions(actorId, { postId: id }, parseQuery(url, true));
    if (len === 3 && three === "views" && method === "POST") { assertEmpty(input); return actions.recordView(actorId, id); }
  }
  if (len >= 2 && one === "uploads") {
    const uploadId = routeId(two!);
    if (len === 2 && method === "GET") return posts.getUpload(actorId, uploadId);
    if (len === 2 && method === "DELETE") {
      assertEmpty(input);
      return posts.cancelUpload(actorId, uploadId);
    }
    if (len === 3 && three === "complete" && method === "POST") {
      assertEmpty(input);
      return posts.completeUpload(actorId, uploadId);
    }
    if (len === 3 && three === "retry" && method === "POST") {
      const body = feedParse(feedCreatePostSchema, input);
      return posts.retryUpload(actorId, uploadId, body);
    }
  }
  if (len >= 2 && one === "comments") {
    const id = routeId(two!);
    if (len === 2 && method === "GET") return actions.getComment(actorId, id);
    if (len === 2 && method === "PATCH") return actions.editComment(actorId, id, feedParse(feedCommentEditSchema, input));
    if (len === 2 && method === "DELETE") { assertEmpty(input); return actions.deleteComment(actorId, id); }
    if (len === 3 && three === "replies" && method === "GET") return actions.listReplies(actorId, id, parseQuery(url));
    if (len === 3 && three === "reaction") {
      if (method === "PUT") { const { reaction } = feedParse(feedReactionSchema, input); return actions.setCommentReaction(actorId, id, reaction); }
      if (method === "DELETE") { assertEmpty(input); return actions.removeCommentReaction(actorId, id); }
    }
    if (len === 3 && three === "reactions" && method === "GET") return actions.reactions(actorId, { commentId: id }, parseQuery(url, true));
  }
  if (len === 1 && one === "notifications" && method === "GET")
    return actions.listNotifications(actorId, parseQuery(url));
  if (len === 2 && one === "notifications" && two === "unread-count" && method === "GET")
    return actions.unreadCount(actorId);
  if (len === 2 && one === "notifications" && two === "read-all" && method === "POST") {
    assertEmpty(input); return actions.markAllNotificationsRead(actorId);
  }
  if (len === 2 && one === "notifications" && method === "PATCH") {
    if (typeof input !== "object" || !input || Array.isArray(input) || Object.keys(input).length !== 1 || (input as { read?: unknown }).read !== true)
      throw new FeedError("VALIDATION_ERROR", "Ожидалось {read:true}", 400);
    return actions.markNotificationRead(actorId, routeId(two!));
  }
  throw new FeedError("NOT_FOUND", "Запрошенный раздел «Моментов» недоступен", 404);
}

export { createFeedInternalDispatcher, dispatchFeedInternalRequest, FEED_INTERNAL_MAX_BODY_BYTES } from "./internal.js";

function playbackService(posts: FeedService = service) {
  if (!flag() || !storage.enabled) throw new FeedError("FEED_DISABLED", undefined, 503);
  const key = Buffer.from(process.env.FEED_PLAYBACK_SECRET ?? process.env.FEED_INTERNAL_HMAC_SECRET ?? "", "utf8");
  return createFeedPlayback({ posts, storage, key,
    cdnHost: new URL(process.env.FEED_CDN_BASE_URL!).hostname,
    fallbackSign: process.env.FEED_MEDIA_FALLBACK_ENABLED === "true"
      ? (objectKey, ttl) => signFeedCloudruFallback(objectKey, ttl)
      : undefined,
  });
}
/** A narrowly scoped bearer ticket is required; this endpoint never serves sources or arbitrary keys. */
export async function feedPlaybackResponse(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const match = /^\/api\/v1\/feed-playback\/([A-Za-z0-9_-]{1,128})$/.exec(url.pathname);
    const source = url.searchParams.get("source");
    const direct = source === "cloudru";
    const validQuery = direct
      ? [...url.searchParams].length === 2 && url.searchParams.has("ticket")
      : source === null && [...url.searchParams].length === 1 && url.searchParams.has("ticket");
    if (request.method !== "GET" || !match || !validQuery ||
        (direct && process.env.FEED_MEDIA_FALLBACK_ENABLED !== "true"))
      throw new FeedError("NOT_FOUND", undefined, 404);
    const result = await playbackService().manifest(routeId(match[1]), url.searchParams.get("ticket")!, undefined,
      direct ? "cloudru" : "cdn");
    return new Response(result.playlist, { headers: { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    const mapped = feedHttpError(error);
    return Response.json(mapped.body, { status: mapped.status, headers: { "Cache-Control": "no-store" } });
  }
}
export { createFeedPlayback } from "./playback.js";
