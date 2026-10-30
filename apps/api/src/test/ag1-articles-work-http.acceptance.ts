/** Real signed registered Hono /articles and WORK SQL, synthetic author/reader/subscriber. */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";

const prefix = "ag1_articles_http_20261025_" + randomBytes(5).toString("hex");
const base = "http://127.0.0.1:3001/api/v1";
type Actor = { id: string; username: string; password: string; token?: string };
const people: Actor[] = [];
let articleId = "",
  slug = "";
function obj(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}
function ensure(v: unknown, name: string): asserts v {
  if (!v) throw Error("ASSERT_" + name);
}
function pass(name: string) {
  console.warn("AG1_ARTICLES_WORK_HTTP " + name + "=PASS");
}
async function api(path: string, method = "GET", who?: Actor, body?: unknown) {
  const result = await fetch(base + path, {
    method,
    headers: {
      ...(who?.token ? { Authorization: "Bearer " + who.token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  });
  return { status: result.status, data: obj(await result.json()), headers: result.headers };
}
async function newActor(role: "TRAINER" | "USER", suffix: string): Promise<Actor> {
  const password = randomBytes(26).toString("base64url");
  const u = await prisma.user.create({
    data: {
      username: prefix + "_" + suffix,
      password: await bcrypt.hash(password, 10),
      passwordSetAt: new Date(),
      registrationPending: false,
      role,
    },
  });
  const who: Actor = { id: u.id, username: u.username, password };
  people.push(who);
  const result = await api("/auth/login", "POST", undefined, { username: who.username, password });
  ensure(result.status === 200 && result.data.success === true, "GENUINE_LOGIN");
  const token = obj(result.data.data).accessToken;
  ensure(typeof token === "string" && token.length > 40, "GENUINE_TOKEN");
  who.token = token;
  return who;
}
async function cleanup() {
  if (articleId)
    await prisma.article.deleteMany({ where: { id: articleId, authorId: people[0]?.id } });
  for (const person of people) {
    const row = await prisma.user.findUnique({
      where: { id: person.id },
      select: { username: true },
    });
    if (row?.username === person.username && row.username.startsWith(prefix))
      await prisma.user.delete({ where: { id: person.id } });
  }
}
async function main() {
  ensure(process.env.AG1_ARTICLES_WORK_HTTP === "1", "EXPLICIT_OPTIN");
  const u = new URL(process.env.DATABASE_URL ?? "");
  ensure(
    ["127.0.0.1", "localhost"].includes(u.hostname) &&
      u.port === "55921" &&
      u.pathname === "/gafus_refactor_real_work_20261024",
    "WORK_PG",
  );
  const metadata = await prisma.$queryRaw<{ db: string; version: string }[]>`
 SELECT current_database() AS db,current_setting('server_version_num') AS version`;
  ensure(
    metadata[0]?.db === "gafus_refactor_real_work_20261024" && metadata[0].version === "180004",
    "PG18",
  );
  ensure(
    (
      await fetch("http://127.0.0.1:3001/health", {
        signal: AbortSignal.timeout(4000),
      })
    ).status === 200,
    "HONO",
  );
  const flag = await prisma.appFeatureFlag.findUnique({
    where: { key: "app_subscription_gating_enabled" },
    select: { enabled: true },
  });
  ensure(flag?.enabled !== false, "EXISTING_ARTICLE_GATING_DISABLED");
  pass("REGISTERED_HONO_PG18_GATING");
  const trainer = await newActor("TRAINER", "trainer");
  const noSub = await newActor("USER", "without");
  const subscriber = await newActor("USER", "sub");
  pass("THREE_GENUINE_AUTHENTICATED_ACTORS");
  slug = prefix.toLowerCase();
  const row = await prisma.article.create({
    data: {
      authorId: trainer.id,
      slug,
      title: "AG1 synthetic locked article",
      description: "AG1 synthetic excerpt",
      contentType: "HTML",
      visibility: "PAID",
      content:
        "<h2>AG1 private text canary</h2><script>alert('REMOVE_SCRIPT')</script><p>Training lesson</p>",
      imageUrls: [],
      logoImg: "",
    },
  });
  articleId = row.id;
  const list = await api("/articles", "GET", noSub);
  const articleItems = list.data.data;
  ensure(
    list.status === 200 &&
      list.data.success &&
      articleItems instanceof Array &&
      articleItems.some((a) => obj(a).id === articleId),
    "PUBLIC_LIST_TEASER",
  );
  ensure(list.headers.get("cache-control") === "private, no-store", "LIST_PRIVATE_CACHE");
  const locked = await api("/articles/" + encodeURIComponent(slug), "GET", noSub);
  const lockedData = obj(locked.data.data);
  ensure(
    locked.status === 200 &&
      locked.data.success &&
      lockedData.hasAccess === false &&
      lockedData.content === null &&
      obj(lockedData.monetization).locked === true,
    "LOCKED_DETAIL",
  );
  ensure(locked.headers.get("cache-control") === "private, no-store", "LOCKED_NO_STORE");
  pass("PUBLIC_LIST_AND_SERVER_LOCKED_DETAIL_NO_PAID_BODY");
  const denied = await api("/articles/" + articleId + "/like", "POST", noSub, {});
  ensure(
    denied.status === 402 && denied.data.code === "SUBSCRIPTION_OR_CREDITS_REQUIRED",
    "LIKE_NO_SUBSCRIPTION_402_" + denied.status + "_" + String(denied.data.code ?? "NO_CODE"),
  );
  ensure(
    (await prisma.articleLike.count({ where: { articleId, userId: noSub.id } })) === 0,
    "LIKE_NO_DB_WRITE",
  );
  pass("DENIED_LIKE_402_NO_SQL_MUTATION");
  await prisma.appSubscription.create({
    data: {
      userId: subscriber.id,
      provider: "MANUAL",
      status: "ACTIVE",
      planCode: "THREE_MONTHS",
      currentPeriodStart: new Date(Date.now() - 3600000),
      currentPeriodEnd: new Date(Date.now() + 90 * 86400000),
      manualReason: "AG1 synthetic WORK article premium test only",
    },
  });
  const allowed = await api("/articles/" + encodeURIComponent(slug), "GET", subscriber);
  const data = obj(allowed.data.data);
  ensure(
    allowed.status === 200 &&
      allowed.data.success &&
      data.hasAccess === true &&
      typeof data.content === "string" &&
      String(data.content).includes("AG1 private text canary") &&
      !String(data.content).includes("<script"),
    "SUBSCRIBER_SANITIZED_CONTENT",
  );
  const first = await api("/articles/" + articleId + "/like", "POST", subscriber, {});
  ensure(
    first.status === 200 &&
      obj(first.data.data).isLiked === true &&
      (await prisma.articleLike.count({ where: { articleId, userId: subscriber.id } })) === 1,
    "FIRST_LIKE_SQL",
  );
  const second = await api("/articles/" + articleId + "/like", "POST", subscriber, {});
  ensure(
    second.status === 200 &&
      obj(second.data.data).isLiked === false &&
      (await prisma.articleLike.count({ where: { articleId, userId: subscriber.id } })) === 0,
    "SECOND_LIKE_SQL",
  );
  pass("MANUAL_NONPROD_ENTITLEMENT_SANITIZED_BODY_LIKE_TOGGLE_SQL");
  const initial = await prisma.article.findUnique({
    where: { id: articleId },
    select: { viewCount: true },
  });
  const view = await api("/articles/" + encodeURIComponent(slug) + "/view", "POST", subscriber, {});
  const replay = await api(
    "/articles/" + encodeURIComponent(slug) + "/view",
    "POST",
    subscriber,
    {},
  );
  ensure(
    view.status === 200 && replay.status === 200 && view.data.success && replay.data.success,
    "VIEW_200",
  );
  const physical = await prisma.article.findUnique({
    where: { id: articleId },
    select: { viewCount: true },
  });
  ensure(
    physical?.viewCount === (initial?.viewCount ?? 0) + 1 &&
      (await prisma.articleViewer.count({ where: { articleId, userId: subscriber.id } })) === 1,
    "VIEW_DEDUPE_SQL",
  );
  const other = await api("/articles/" + encodeURIComponent(slug) + "/view", "POST", noSub, {});
  ensure(
    other.status === 200 &&
      other.data.success &&
      (
        await prisma.article.findUnique({
          where: { id: articleId },
          select: { viewCount: true },
        })
      )?.viewCount ===
        (initial?.viewCount ?? 0) + 2,
    "DISTINCT_VIEW_SQL",
  );
  pass("UNIQUE_AUTHENTICATED_VIEW_ONLY_ONCE_SQL");
  const notFound = await api("/articles/does-not-exist-" + prefix, "GET", subscriber);
  ensure(notFound.status === 404, "MISSING_DETAIL_404");
  const noLike = await api("/articles/does-not-exist-" + prefix + "/like", "POST", subscriber, {});
  ensure(noLike.status === 404, "MISSING_LIKE_404");
  pass("MISSING_ARTICLE_CONTRACTS");
}
void (async () => {
  try {
    await main();
  } catch (e) {
    process.exitCode = 1;
    console.error(
      "AG1_ARTICLES_REAL_HTTP_FAILED",
      e instanceof Error && e.message.startsWith("ASSERT_") ? e.message : "UNEXPECTED_REDACTED",
    );
  } finally {
    try {
      await cleanup();
      console.warn("AG1_ARTICLES_WORK_HTTP_SYNTHETIC_CLEANUP=PASS");
    } catch {
      process.exitCode = 1;
      console.error("AG1_ARTICLES_WORK_HTTP_CLEANUP_REVIEW_REQUIRED");
    }
    await prisma.$disconnect();
  }
})();
