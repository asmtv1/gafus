/**
 * Real Hono HTTP + Prisma + Redis course cache check on loopback ONLY.
 * Never imports dotenv, never connects to any external system.
 *
 * Run:
 * DATABASE_URL=postgresql://asmtv1@127.0.0.1:5432/gafus_course_cache_live_20261015
 * REDIS_URL=redis://127.0.0.1:6379/14 ENABLE_COURSE_CACHE=true
 * COURSE_CACHE_SYNC_ENABLED=true pnpm --filter @gafus/api exec tsx scripts/local-course-cache-http-smoke.ts
 */
/* eslint-disable no-console -- Human-readable output for an opt-in local CLI smoke. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { SignJWT } from "jose";

const dbUrl = process.env.DATABASE_URL ?? "";
const redisUrl = process.env.REDIS_URL ?? "";
assert.match(
  dbUrl,
  /^postgresql:\/\/asmtv1@(?:127\.0\.0\.1|localhost):5432\/gafus_course_cache_live_20261015$/,
);
assert.match(redisUrl, /^redis:\/\/(?:127\.0\.0\.1|localhost):6379\/14$/);
assert.equal(process.env.COURSE_CACHE_SYNC_ENABLED, "true");
assert.equal(process.env.ENABLE_COURSE_CACHE, "true");
// Never use the account's real production JWT or metrics secret for this smoke.
process.env.JWT_SECRET = randomBytes(48).toString("hex");
process.env.COURSE_CACHE_METRICS_TOKEN = randomBytes(36).toString("hex");
const { app } = await import("../src/app.js");
const { prisma } = await import("@gafus/prisma");
const { connection: redis } = await import("@gafus/queues");

let checks = 0;
function check<T>(actual: T, expected: T, name: string) {
  assert.deepEqual(actual, expected, name);
  checks++;
  console.log("PASS", name);
}

const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
// Hono rate limiting runs before JWT auth and keys the request by client IP.
// Each isolated local smoke uses its own test-net IP to avoid accumulated
// Redis rate-limit counters from earlier runs. Production nginx overwrites
// this header before it reaches Hono; this direct loopback test is special.
const mockClientIp = `198.18.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
console.log("TEST-ONLY Hono HTTP server on loopback ephemeral port");

async function sign(user: { id: string; username: string; role: string }) {
  return new SignJWT({
    sub: user.id,
    username: user.username,
    role: user.role,
    authenticatedAt: Date.now(),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("https://api.gafus.ru")
    .setAudience("gafus-app")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

async function call(path: string, options: { auth?: string; metrics?: boolean; ip?: string } = {}) {
  const response = await fetch(base + path, {
    headers: {
      "x-real-ip": options.ip ?? mockClientIp,
      ...(options.auth ? { Authorization: "Bearer " + options.auth } : {}),
      ...(options.metrics
        ? { Authorization: "Bearer " + process.env.COURSE_CACHE_METRICS_TOKEN }
        : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const text = await response.text();
  type JsonResponse = {
    data?: { title?: string; steps?: { description?: string }[] };
    counters?: Record<string, number>;
    flags?: { enabled?: boolean };
  };
  let data: JsonResponse | null = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 250) } as JsonResponse;
    }
  }
  return { status: response.status, data, headers: response.headers };
}

try {
  const userId = randomUUID().slice(0, 8);
  const trainer = await prisma.user.create({
    data: {
      username: "http-trainer-" + userId,
      password: "disabled-test-login",
      role: "TRAINER",
    },
  });
  const alice = await prisma.user.create({
    data: {
      username: "http-alice-" + userId,
      password: "disabled-test-login",
    },
  });
  const bob = await prisma.user.create({
    data: {
      username: "http-bob-" + userId,
      password: "disabled-test-login",
    },
  });
  const step = await prisma.step.create({
    data: {
      title: "Теория",
      description: "До обновления {{userName}}",
      type: "BREAK",
      authorId: trainer.id,
    },
  });
  const day = await prisma.trainingDay.create({
    data: {
      title: "Тестовый урок {{userName}}",
      description: "Тестовый день",
      authorId: trainer.id,
      stepLinks: { create: { stepId: step.id, order: 0 } },
    },
  });
  const publicCourse = await prisma.course.create({
    data: {
      name: "HTTP public",
      type: "http-public-" + userId,
      duration: "5",
      trainingLevel: "BEGINNER",
      logoImg: "",
      authorId: trainer.id,
      isPersonalized: true,
      dayLinks: { create: { dayId: day.id, order: 0 } },
    },
    include: { dayLinks: true },
  });
  const paid = await prisma.course.create({
    data: {
      name: "HTTP paid",
      type: "http-paid-" + userId,
      duration: "5",
      trainingLevel: "BEGINNER",
      logoImg: "",
      authorId: trainer.id,
      isPrivate: true,
      isPaid: true,
      dayLinks: { create: { dayId: day.id, order: 0 } },
    },
    include: { dayLinks: true },
  });
  await prisma.userCourse.create({
    data: {
      userId: alice.id,
      courseId: publicCourse.id,
      userDisplayName: "Алиса",
      userGender: "female",
    },
  });

  const aliceToken = await sign(alice);
  const bobToken = await sign(bob);
  const aliceDay = `/api/v1/training/day?courseType=${encodeURIComponent(publicCourse.type)}&dayOnCourseId=${publicCourse.dayLinks[0].id}`;
  const paidDay = `/api/v1/training/day?courseType=${encodeURIComponent(paid.type)}&dayOnCourseId=${paid.dayLinks[0].id}`;

  check((await call("/health")).status, 200, "HTTP /health");
  check((await call("/ready")).status, 200, "HTTP /ready with real PostgreSQL and Redis");
  check((await call("/metrics/course-cache")).status, 404, "HTTP diagnostics deny absent secret");
  check(
    (await call("/metrics/course-cache", { auth: "wrong-token" })).status,
    404,
    "HTTP diagnostics deny incorrect token",
  );
  const initialMetrics = await call("/metrics/course-cache", { metrics: true });
  check(initialMetrics.status, 200, "HTTP authorized metrics available");
  check(initialMetrics.headers.get("cache-control"), "no-store", "HTTP metrics no-store");
  check((await call(aliceDay)).status, 401, "Unauthenticated HTTP lesson requires JWT");
  check((await call(aliceDay, { auth: "fake-jwt" })).status, 401, "Invalid JWT rejected");
  const invalid = await call("/api/v1/training/day?courseType=foo&dayOnCourseId=not-a-cuid", {
    auth: aliceToken,
  });
  check(invalid.status, 400, "Invalid day identifier rejected");

  const first = await call(aliceDay, { auth: aliceToken });
  check(first.status, 200, "Authenticated Web/Mobile API lesson returns 200");
  check(
    first.data?.data?.title,
    "Тестовый урок Алиса",
    "Real per-user personalization through HTTP",
  );
  await call(aliceDay, { auth: aliceToken });
  const stats = (await call("/metrics/course-cache", { metrics: true })).data;
  check(stats.counters.hit > 0, true, "Second HTTP request reuses local content cache");
  check(stats.flags.enabled, true, "Local HTTP process sees cache enabled");

  const missingPersonalization = await call(aliceDay, { auth: bobToken });
  check(missingPersonalization.status, 428, "Different user cannot bypass personalization gate");

  check(
    (await call(paidDay, { auth: bobToken })).status,
    403,
    "Paid+private course denied without grant",
  );
  await prisma.courseAccess.create({ data: { userId: alice.id, courseId: paid.id } });
  check((await call(paidDay, { auth: aliceToken })).status, 200, "Paid+private course granted");
  await prisma.courseAccess.delete({
    where: { courseId_userId: { courseId: paid.id, userId: alice.id } },
  });
  check(
    (await call(paidDay, { auth: aliceToken })).status,
    403,
    "Revoked grant takes effect with warm cache",
  );

  const beforeRedis = await redis.get("gafus:training-content:revision:v1");
  const revisionBefore = (
    await prisma.$queryRawUnsafe<{ revision: bigint }[]>(
      'SELECT "revision" FROM "CourseContentRevision" WHERE "id" = 1',
    )
  )[0].revision;
  await prisma.step.update({
    where: { id: step.id },
    data: { description: "После изменения {{userName}}" },
  });
  const afterRedis = await redis.get("gafus:training-content:revision:v1");
  check(afterRedis, beforeRedis, "Direct Prisma update did not emit Redis INCR");
  const revisionAfter = (
    await prisma.$queryRawUnsafe<{ revision: bigint }[]>(
      'SELECT "revision" FROM "CourseContentRevision" WHERE "id" = 1',
    )
  )[0].revision;
  check(revisionAfter > revisionBefore, true, "Transactional PostgreSQL revision advanced");
  const changed = await call(aliceDay, { auth: aliceToken });
  check(changed.status, 200, "HTTP lesson after DB update succeeds");
  check(
    changed.data?.data?.steps?.[0]?.description,
    "После изменения Алиса",
    "HTTP immediately reflects new data without Redis INCR",
  );

  const resultMetrics = await call("/metrics/course-cache", { metrics: true });
  check(
    resultMetrics.data.counters.revisionFlush > 0,
    true,
    "HTTP metrics register DB revision flush",
  );

  // End-to-end HTTP latency includes JWT, access control, per-user progress,
  // Prisma revision check, Redis GET and serialization. It is NOT the cache-only
  // microbenchmark, and one local Mac is not a production load test.
  const percentile = (values: number[], pct: number) => {
    const ordered = [...values].sort((a, b) => a - b);
    return Number(ordered[Math.ceil(ordered.length * pct) - 1].toFixed(2));
  };
  async function profileHttp(enabled: boolean) {
    process.env.ENABLE_COURSE_CACHE = String(enabled);
    const times: number[] = [];
    for (let i = 0; i < 28; i++) {
      const start = performance.now();
      const response = await call(aliceDay, { auth: aliceToken });
      if (response.status !== 200) throw new Error("HTTP_BENCHMARK_FAILED_" + response.status);
      times.push(performance.now() - start);
    }
    return {
      count: times.length,
      p50Ms: percentile(times, 0.5),
      p95Ms: percentile(times, 0.95),
      maxMs: Number(Math.max(...times).toFixed(2)),
    };
  }
  // Warm both code paths before measuring.
  const withCache = await profileHttp(true);
  const withoutCache = await profileHttp(false);
  process.env.ENABLE_COURSE_CACHE = "true";
  const metricsAfterBenchmark = (await call("/metrics/course-cache", { metrics: true })).data;
  check(
    metricsAfterBenchmark.counters.bypassDisabled >= withoutCache.count,
    true,
    "HTTP profile without cache used direct PostgreSQL reads",
  );
  check(
    metricsAfterBenchmark.counters.hit >= withCache.count - 1,
    true,
    "HTTP profile with cache reused content",
  );
  console.log(
    "LOCAL END-TO-END HTTP LATENCY (not production p95):",
    JSON.stringify({ withCache, withoutCache }),
  );
  async function profileConcurrent(enabled: boolean, concurrency = 8, count = 48) {
    process.env.ENABLE_COURSE_CACHE = String(enabled);
    // Each loopback test group gets its own synthetic test-net client IP so
    // Redis rate limiting does not mix this batch with previous benchmarks.
    const ip = `198.19.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
    const times: number[] = [];
    const startWall = performance.now();
    for (let index = 0; index < count; index += concurrency) {
      await Promise.all(
        Array.from({ length: Math.min(concurrency, count - index) }, async () => {
          const start = performance.now();
          const response = await call(aliceDay, { auth: aliceToken, ip });
          if (response.status !== 200) throw new Error("CONCURRENT_HTTP_STATUS_" + response.status);
          times.push(performance.now() - start);
        }),
      );
    }
    return {
      count,
      concurrency,
      p50Ms: percentile(times, 0.5),
      p95Ms: percentile(times, 0.95),
      p99Ms: percentile(times, 0.99),
      rps: Number(((1000 * count) / (performance.now() - startWall)).toFixed(1)),
    };
  }
  const concurrent = [];
  for (const concurrency of [8, 16, 32]) {
    // Alternating ABBA order reduces the influence of startup and warmup.
    for (const enabled of [false, true, true, false]) {
      concurrent.push({
        mode: enabled ? "cache" : "direct",
        ...(await profileConcurrent(enabled, concurrency)),
      });
    }
  }
  process.env.ENABLE_COURSE_CACHE = "true";
  check(concurrent.length, 12, "12 bounded HTTP batches: concurrency 8, 16, 32");
  console.log("LOCAL CONCURRENT HTTP LATENCY:", JSON.stringify(concurrent));

  console.log(`LOCAL HTTP SMOKE PASSED: ${checks} checks on localhost Hono, PostgreSQL, Redis`);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
}
