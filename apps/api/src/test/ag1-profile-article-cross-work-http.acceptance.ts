/** Original Hono cross-screen regression: profile author→public projection→real subscriber Article full read.
 * Opt-in original JWT and permanent local WORK PG only. No S3, email or external recipient.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";

const prefix = "ag1_cross_profile_article_20261025_" + randomBytes(6).toString("hex");
const api = "http://127.0.0.1:3001/api/v1";
type Actor = { id: string; username: string; password: string; token: string };
const users: Actor[] = [];
let articleId = "";
let slug = "";
const fullCanary = "AG1 уникальный полный текст: вторая глава о воспитании";
const privateCanary = "AG1_PRIVATE_PAYWALL_BODY";
const title = "AG1 авторский материал — тест контракта";
function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function ok(value: unknown, label: string): asserts value {
  if (!value) throw new Error("ASSERT_" + label);
}
function pass(label: string) {
  console.warn("AG1_CROSS_PROFILE_ARTICLE " + label + "=PASS");
}
async function http(path: string, opts?: { token?: string; method?: string; body?: unknown }) {
  const response = await fetch(api + path, {
    method: opts?.method ?? "GET",
    headers: {
      ...(opts?.token ? { Authorization: "Bearer " + opts.token } : {}),
      ...(opts?.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(opts?.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
    signal: AbortSignal.timeout(12000),
  });
  return {
    status: response.status,
    body: asObject(await response.json()),
    cache: response.headers.get("cache-control"),
  };
}
async function createActor(suffix: string, role: "USER" | "TRAINER") {
  const password = randomBytes(26).toString("base64url");
  const row = await prisma.user.create({
    data: {
      username: prefix + "_" + suffix,
      password: await bcrypt.hash(password, 10),
      passwordSetAt: new Date(),
      registrationPending: false,
      role,
    },
  });
  const signed = await http("/auth/login", {
    method: "POST",
    body: { username: row.username, password },
  });
  ok(signed.status === 200 && signed.body.success === true, "AUTH_LOGIN");
  const token = asObject(signed.body.data).accessToken;
  ok(typeof token === "string" && token.length > 32, "AUTH_REAL_JWT");
  const actor = { id: row.id, username: row.username, password, token };
  users.push(actor);
  return actor;
}
async function cleanup() {
  if (articleId && users[0]?.id) {
    await prisma.article.deleteMany({ where: { id: articleId, authorId: users[0].id } });
  }
  for (const user of users) {
    const actual = await prisma.user.findUnique({
      where: { id: user.id },
      select: { username: true },
    });
    if (actual?.username === user.username && actual.username.startsWith(prefix)) {
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
}
async function main() {
  ok(process.env.AG1_CROSS_PROFILE_ARTICLE_WORK_HTTP === "1", "EXPLICIT_OPT_IN");
  const target = new URL(process.env.DATABASE_URL ?? "");
  ok(
    ["127.0.0.1", "localhost"].includes(target.hostname) &&
      target.port === "55921" &&
      target.pathname === "/gafus_refactor_real_work_20261024",
    "REFUSE_OTHER_DB",
  );
  const db = await prisma.$queryRawUnsafe<{ db: string; version: string }[]>(
    "SELECT current_database() AS db, current_setting('server_version_num') AS version",
  );
  ok(
    db[0]?.db === "gafus_refactor_real_work_20261024" && db[0].version === "180004",
    "WORK_PG18_IDENTITY",
  );
  const health = await fetch("http://127.0.0.1:3001/health", {
    signal: AbortSignal.timeout(4500),
  });
  ok(health.status === 200, "HONO_HEALTH");
  pass("GENUINE_HONO_PERMANENT_WORK_PG18");

  const author = await createActor("author", "TRAINER");
  const entitled = await createActor("subscribed", "USER");
  const unentitled = await createActor("unsubscribed", "USER");
  pass("THREE_STOCK_PASSWORD_JWT_ACTORS");

  const saved = await http("/user/profile", {
    method: "PUT",
    token: author.token,
    body: {
      fullName: "Тестовый автор ГАФУС",
      city: "Самара",
      about: "AG1 cross-screen author biography",
      website: "https://example.org",
    },
  });
  ok(saved.status === 200 && saved.body.success === true, "AUTHOR_SIGNED_PUT");
  const profile = await prisma.userProfile.findUnique({ where: { userId: author.id } });
  ok(
    profile?.fullName === "Тестовый автор ГАФУС" &&
      profile.city === "Самара" &&
      profile.about === "AG1 cross-screen author biography",
    "PROFILE_PHYSICAL_SQL",
  );
  const publicResult = await http(
    "/user/profile/public?username=" + encodeURIComponent(author.username),
  );
  const publicProjection = asObject(publicResult.body.data);
  ok(publicResult.status === 200 && publicResult.body.success === true, "PUBLIC_GET");
  ok(asObject(publicProjection.profile).city === "Самара", "PUBLIC_CROSS_READBACK");
  const exposed = JSON.stringify(publicProjection);
  ok(
    !exposed.includes("password") &&
      !exposed.includes("refreshToken") &&
      !exposed.includes("registrationPending") &&
      !exposed.includes(author.password),
    "PUBLIC_STRICT_NO_SECRET",
  );
  pass("AUTHOR_PROFILE_PUT_PHYSICAL_SQL_PUBLIC_GET");

  const article = await prisma.article.create({
    data: {
      authorId: author.id,
      slug: prefix.toLowerCase(),
      title,
      contentType: "HTML",
      visibility: "PAID",
      description: "AG1 only an excerpt should be public",
      content:
        "<h2>" +
        fullCanary +
        "</h2><p>" +
        privateCanary +
        "</p><script>alert('AG1_XSS_REJECT')</script>",
      logoImg: "",
      imageUrls: [],
    },
  });
  articleId = article.id;
  slug = article.slug;
  await prisma.appSubscription.create({
    data: {
      userId: entitled.id,
      provider: "MANUAL",
      status: "ACTIVE",
      planCode: "THREE_MONTHS",
      currentPeriodStart: new Date(Date.now() - 3600000),
      currentPeriodEnd: new Date(Date.now() + 14 * 86400000),
      manualReason: "AG1 local synthetic cross-domain article read; zero payment",
    },
  });

  const list = await http("/articles", { token: entitled.token });
  ok(list.status === 200 && Array.isArray(list.body.data), "ARTICLE_CATALOG");
  const card = (list.body.data as unknown[]).map(asObject).find((a) => a.id === articleId);
  ok(
    card && card.authorUsername === author.username && card.title === title,
    "ARTICLE_AUTHOR_FROM_REAL_USER",
  );
  ok(!JSON.stringify(card).includes(privateCanary), "CARD_NO_PREMIUM_BODY");
  pass("PROFILE_OWNER_TO_ARTICLE_AUTHOR_CATALOG");

  const locked = await http("/articles/" + encodeURIComponent(slug), {
    token: unentitled.token,
  });
  const lockedData = asObject(locked.body.data);
  ok(
    locked.status === 200 &&
      locked.body.success === true &&
      lockedData.hasAccess === false &&
      lockedData.content === null &&
      asObject(lockedData.monetization).locked === true,
    "UNENTITLED_LOCKED",
  );
  ok(!JSON.stringify(lockedData).includes(privateCanary), "UNENTITLED_NO_SECRET_BODY");

  const full = await http("/articles/" + encodeURIComponent(slug), {
    token: entitled.token,
  });
  const fullData = asObject(full.body.data);
  ok(
    full.status === 200 &&
      full.body.success === true &&
      fullData.hasAccess === true &&
      typeof fullData.content === "string",
    "ENTITLED_ACTUAL_FULL_BODY",
  );
  ok(
    String(fullData.content).includes(fullCanary) &&
      String(fullData.content).includes(privateCanary) &&
      !String(fullData.content).includes("<script") &&
      !String(fullData.content).includes("alert("),
    "FULL_SANITIZED_REAL_BODY",
  );
  ok(
    locked.cache === "private, no-store" && full.cache === "private, no-store",
    "NO_SHARED_CACHE_PREMIUM",
  );
  pass("SAME_ARTICLE_LOCKED_VS_REAL_FULL_SUBSCRIBER_HTML");

  const ownerAgain = await http("/user/profile", { token: author.token });
  const foreignProfile = await http("/user/profile", { token: unentitled.token });
  ok(ownerAgain.status === 200 && foreignProfile.status === 200, "PRIVATE_GETS");
  ok(
    JSON.stringify(ownerAgain.body.data).includes("Самара") &&
      !JSON.stringify(foreignProfile.body.data).includes("AG1 cross-screen author biography"),
    "PRIVATE_JWT_ISOLATION",
  );
  const fullSql = await prisma.article.findUnique({
    where: { id: articleId },
    select: { content: true },
  });
  ok(fullSql?.content.includes(privateCanary), "SANITIZER_NONDESTRUCTIVE_SOURCE");
  pass("CROSS_DOMAIN_JWT_PRIVACY_AND_SQL_SOURCE_INTACT");
}
void (async () => {
  try {
    await main();
  } catch (error) {
    process.exitCode = 1;
    console.error(
      "AG1_CROSS_PROFILE_ARTICLE_FAILED",
      error instanceof Error && error.message.startsWith("ASSERT_")
        ? error.message
        : "UNEXPECTED_REDACTED",
    );
  } finally {
    try {
      await cleanup();
      console.warn("AG1_CROSS_PROFILE_ARTICLE_SYNTHETIC_CLEANUP=PASS");
    } catch {
      process.exitCode = 1;
      console.error("AG1_CROSS_PROFILE_ARTICLE_CLEANUP_REVIEW_REQUIRED");
    }
    await prisma.$disconnect();
  }
})();
