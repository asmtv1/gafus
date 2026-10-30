/** AG1 source-only isolated Hono feed producer. NOT MOUNTED or LISTENING.
 * AG4 producer lease + isolated package/DB role required before network/SQL.
 */
import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth";
import { feedRoutes } from "./feed";

const PREFIX = "/api/v1/feed";
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const CURSOR = /^[A-Za-z0-9_%-]{1,512}$/;
const ALLOWED_QUERY = new Set(["20", "1"]);

export interface FeedAuthorReadFixture {
  authorUsername: string;
  actorId: string;
  visiblePostIds: readonly string[];
  hiddenPostId: string;
  deletedPostId: string;
  visibleCommentId: string;
}

export function isAllowedFeedAuthorRead(
  path: string, query: string, fixture: FeedAuthorReadFixture,
) {
  if (!path.startsWith(PREFIX + "/") || path.includes("//") || path.includes("\\")) {
    return false;
  }
  const suffix = path.slice(PREFIX.length);
  if (suffix === "/status") return !query;
  const profile = /^\/profiles\/([^/]+)\/posts$/.exec(suffix);
  const comment = /^\/comments\/([^/]+)$/.exec(suffix);
  const post = /^\/posts\/([^/]+)$/.exec(suffix);
  const postComments = /^\/posts\/([^/]+)\/comments$/.exec(suffix);
  if (post) {
    return !query && ID.test(post[1]!) && [
      ...fixture.visiblePostIds, fixture.hiddenPostId, fixture.deletedPostId,
    ].includes(post[1]!);
  }
  if (comment) return !query && comment[1] === fixture.visibleCommentId;
  if (!profile && !postComments) return false;
  if (profile && profile[1] !== fixture.authorUsername && profile[1] !== "ag2feed-unknown-author") {
    return false;
  }
  if (postComments && !fixture.visiblePostIds.includes(postComments[1]!)) return false;
  const params = new URLSearchParams(query);
  const keys = [...params.keys()];
  if (keys.length < 1 || keys.length > 2 || new Set(keys).size !== keys.length ||
      keys.some(key => key !== "pageSize" && key !== "cursor")) return false;
  const size = params.get("pageSize");
  if (!size || !ALLOWED_QUERY.has(size)) return false;
  const cursor = params.get("cursor");
  if (cursor !== null && (size !== "1" || !CURSOR.test(cursor))) return false;
  return true;
}

export function createFeedAuthorReviewProducer(
  origin: string,
  fixture: FeedAuthorReadFixture,
) {
  if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(origin)) {
    throw new Error("FEED_PRODUCER_ORIGIN_NOT_LOCAL_LOOPBACK");
  }
  if (![fixture.authorUsername, fixture.actorId, ...fixture.visiblePostIds,
    fixture.hiddenPostId, fixture.deletedPostId, fixture.visibleCommentId].every(v => ID.test(v))) {
    throw new Error("FEED_PRODUCER_INVALID_FIXTURE");
  }
  const app = new Hono();
  // Reject before auth/dispatcher; no Redis rate limiter in this read-only harness.
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    c.header("Referrer-Policy", "no-referrer");
    const url = new URL(c.req.url);
    if (url.origin !== origin || (c.req.header("origin") && c.req.header("origin") !== origin)) {
      return c.json({ success: false, code: "ORIGIN_DENIED" }, 403);
    }
    if (c.req.method !== "GET" || !isAllowedFeedAuthorRead(url.pathname, url.search, fixture)) {
      return c.json({ success: false, code: "ROUTE_NOT_ALLOWED" }, 405);
    }
    await next();
    // The production feed route itself sets no-store. Enforce private after it.
    c.header("Cache-Control", "private, no-store");
  });
  app.use(PREFIX + "/*", authMiddleware);
  app.use(PREFIX + "/*", async (c, next) => {
    if (c.get("user")?.id !== fixture.actorId) {
      return c.json({ success: false, code: "ACTOR_NOT_ALLOWED" }, 403);
    }
    await next();
  });
  app.route(PREFIX, feedRoutes);
  return app;
}
