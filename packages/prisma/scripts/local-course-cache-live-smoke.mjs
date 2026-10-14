/**
 * Real local PostgreSQL + Redis course cache smoke.
 * Refuses non-loopback services and any database other than the isolated fixture.
 * Reader processes are independent Node.js processes, sharing Redis DB 14.
 *
 * Usage (from GAFUS Main root):
 * DATABASE_URL=postgresql://asmtv1@127.0.0.1:5432/gafus_course_cache_live_20261015 \
 * REDIS_URL=redis://127.0.0.1:6379/14 COURSE_CACHE_SYNC_ENABLED=true \
 * ENABLE_COURSE_CACHE=true NODE_ENV=production \
 * node packages/prisma/scripts/local-course-cache-live-smoke.mjs
 */
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const dbUrl = process.env.DATABASE_URL ?? "";
const redisUrl = process.env.REDIS_URL ?? "";
const safeDatabase = /^postgres(?:ql)?:\/\/[^@/]*@?(?:127\.0\.0\.1|localhost):5432\/gafus_course_cache_live_20261015$/.test(dbUrl);
const safeRedis = /^redis:\/\/(?:127\.0\.0\.1|localhost):6379\/14$/.test(redisUrl);
assert.ok(safeDatabase, "REFUSING: DATABASE_URL must target the isolated local course-cache test database");
assert.ok(safeRedis, "REFUSING: REDIS_URL must target loopback Redis DB 14");
assert.equal(process.env.COURSE_CACHE_SYNC_ENABLED, "true");
assert.equal(process.env.ENABLE_COURSE_CACHE, "true");

const prisma = new PrismaClient();
const coreBase = new URL("../../core/dist/core/src/services/", import.meta.url);
const queuesRedisUrl = new URL("../../queues/dist/redis.js", import.meta.url);

if (process.argv[2] === "reader") {
  const { getTrainingDayContent, clearTrainingDayContentCache } = await import(new URL("training/trainingDayContent.js", coreBase));
  const { getTrainingDayWithUserSteps } = await import(new URL("training/trainingService.js", coreBase));
  const { getCourseCacheMetricsSnapshot } = await import(
    new URL("training/trainingContentMetrics.js", coreBase)
  );
  const { connection } = await import(queuesRedisUrl);
  const originalRetryStrategy = connection.options.retryStrategy;
  process.on("message", async ({ id, op, args = {} }) => {
    try {
      let result;
      if (op === "ping") {
        assert.equal(await connection.ping(), "PONG");
        result = { redisStatus: connection.status };
      } else if (op === "content") {
        const value = await getTrainingDayContent(args.courseType, args.linkId);
        result = value && {
          title: value.day.title,
          description: value.day.description,
          stepText: value.day.stepLinks.map(x => x.step.description),
          courseId: value.courseId,
          duration: value.course.duration,
          stepOrder: value.day.stepLinks.map(x => x.order),
          dayOrder: value.order,
        };
      } else if (op === "detail") {
        const value = await getTrainingDayWithUserSteps(args.userId, args.courseType, args.linkId);
        result = value && {
          title: value.title,
          description: value.description,
          userStatus: value.userStatus,
          stepText: value.steps.map(x => x.description),
          stepStatus: value.steps.map(x => x.status),
          stepUserId: value.steps.map(x => x.userStepId),
        };
      } else if (op === "setCacheEnabled") {
        process.env.ENABLE_COURSE_CACHE = args.enabled ? "true" : "false";
        result = { enabled: process.env.ENABLE_COURSE_CACHE === "true" };
      } else if (op === "clearCache") {
        clearTrainingDayContentCache();
        result = true;
      } else if (op === "parallel") {
        const values = await Promise.all(
          Array.from({ length: 20 }, () => getTrainingDayContent(args.courseType, args.linkId))
        );
        result = values.map(x => x?.day.title ?? null);
      } else if (op === "benchmark") {
        const iterations = 40;
        const wasEnabled = process.env.ENABLE_COURSE_CACHE;
        await getTrainingDayContent(args.courseType, args.linkId);
        const hotStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          await getTrainingDayContent(args.courseType, args.linkId);
        }
        const cachedMs = performance.now() - hotStart;
        process.env.ENABLE_COURSE_CACHE = "false";
        let directMs;
        try {
          const directStart = performance.now();
          for (let i = 0; i < iterations; i++) {
            await getTrainingDayContent(args.courseType, args.linkId);
          }
          directMs = performance.now() - directStart;
        } finally {
          process.env.ENABLE_COURSE_CACHE = wasEnabled;
        }
        result = {
          iterations,
          cacheReadAvgMs: Number((cachedMs / iterations).toFixed(3)),
          directSqlAvgMs: Number((directMs / iterations).toFixed(3)),
        };
      } else if (op === "metrics") {
        result = getCourseCacheMetricsSnapshot();
      } else if (op === "offline") {
        // Disable automatic reconnect and close ONLY this reader's Redis socket.
        // This does not affect the other reader or the local Redis server.
        connection.options.retryStrategy = () => null;
        connection.disconnect();
        await new Promise(resolve => setTimeout(resolve, 100));
        result = { status: connection.status };
      } else if (op === "online") {
        connection.options.retryStrategy = originalRetryStrategy;
        await connection.connect();
        assert.equal(await connection.ping(), "PONG");
        result = { status: connection.status };
      } else if (op === "advanceTTL") {
        const originalNow = Date.now;
        Date.now = () => originalNow() + 61_000; // only in this disposable reader
        result = { advancedMs: 61_000 };
      } else if (op === "stop") {
        await Promise.allSettled([prisma.$disconnect(), connection.quit()]);
        result = { done: true };
      } else {
        throw new Error("UNKNOWN_READER_COMMAND");
      }
      process.send?.({ id, result });
      if (op === "stop") setTimeout(() => process.exit(0), 10);
    } catch (error) {
      process.send?.({ id, error: String(error?.message ?? error) });
    }
  });
} else {
  const readers = [];
  let requestId = 0;
  function rpc(reader, op, args = {}) {
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reader.off("message", onMessage);
        reject(new Error(`READER_TIMEOUT:${op}`));
      }, 15_000);
      function onMessage(message) {
        if (message.id !== id) return;
        clearTimeout(timer);
        reader.off("message", onMessage);
        if (message.error) reject(new Error(`${op}: ${message.error}`));
        else resolve(message.result);
      }
      reader.on("message", onMessage);
      reader.send({ id, op, args });
    });
  }
  let checks = 0;
  function check(value, expected, message) {
    assert.deepEqual(value, expected, message);
    console.log("PASS", message);
    checks += 1;
  }
  async function startReader(name) {
    const child = fork(new URL(import.meta.url).pathname, ["reader"], {
      cwd: process.cwd(),
      env: { ...process.env, GAFUS_TEST_READER_NAME: name },
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    readers.push(child);
    const status = await rpc(child, "ping");
    check(status.redisStatus, "ready", `${name}: separate Node.js process connected to real Redis`);
    return child;
  }

  try {
    check(await prisma.$queryRaw`SELECT current_database() AS name`.then(rows => rows[0].name),
      "gafus_course_cache_live_20261015", "PostgreSQL target is isolated localhost database");

    const run = randomUUID().slice(0, 8);
    const trainer = await prisma.user.create({ data: {
      username: "cache-trainer-" + run, password: "local-test-not-a-login", role: "TRAINER",
    } });
    const alice = await prisma.user.create({ data: {
      username: "cache-alice-" + run, password: "local-test-not-a-login",
    } });
    const bob = await prisma.user.create({ data: {
      username: "cache-bob-" + run, password: "local-test-not-a-login",
    } });
    const step = await prisma.step.create({ data: {
      authorId: trainer.id, title: "Theory Test",
      description: "Урок для {{userName}}: версия один",
      type: "THEORY", videoUrl: "https://example.invalid/local-only.mp4",
      imageUrls: ["https://example.invalid/local-only.png"],
    } });
    const day = await prisma.trainingDay.create({ data: {
      title: "День для {{userName}}", description: "Локальное описание",
      authorId: trainer.id,
      stepLinks: { create: { stepId: step.id, order: 1 } },
    } });
    const publicCourse = await prisma.course.create({ data: {
      name: "Local smoke public", type: "local-" + run + "-public",
      duration: "7", logoImg: "", authorId: trainer.id, isPersonalized: true,
      trainingLevel: "BEGINNER",
      dayLinks: { create: { dayId: day.id, order: 1 } },
    }, include: { dayLinks: true } });
    const paidCourse = await prisma.course.create({ data: {
      name: "Local smoke private/paid", type: "local-" + run + "-paid",
      duration: "7", logoImg: "", authorId: trainer.id, isPaid: true, isPrivate: true,
      trainingLevel: "BEGINNER",
      dayLinks: { create: { dayId: day.id, order: 1 } },
    }, include: { dayLinks: true } });
    const publicLink = publicCourse.dayLinks[0].id;
    const paidLink = paidCourse.dayLinks[0].id;
    await prisma.userCourse.createMany({ data: [
      { userId: alice.id, courseId: publicCourse.id, userDisplayName: "Алиса", userGender: "female", petName: "Пёс", petGender: "male" },
      { userId: bob.id, courseId: publicCourse.id, userDisplayName: "Борис", userGender: "male", petName: "Кот", petGender: "male" },
    ] });
    await prisma.courseAccess.create({ data: { courseId: paidCourse.id, userId: alice.id } });
    const initialUserTraining = await prisma.userTraining.create({ data: {
      userId: alice.id, dayOnCourseId: publicLink, status: "IN_PROGRESS",
    } });
    const stepOnDay = await prisma.stepOnDay.findFirstOrThrow({ where: { dayId: day.id } });
    await prisma.userStep.create({ data: {
      userTrainingId: initialUserTraining.id,
      stepOnDayId: stepOnDay.id, status: "COMPLETED",
    } });
    console.log("Seeded TEST-ONLY Prisma fixtures: two courses sharing a day and step; three local users");

    const web = await startReader("Web");
    const mobileApi = await startReader("Mobile API");
    const publicQuery = { courseType: publicCourse.type, linkId: publicLink };
    const paidQuery = { courseType: paidCourse.type, linkId: paidLink };

    const [coldWeb, coldApi] = await Promise.all([
      rpc(web, "content", publicQuery), rpc(mobileApi, "content", publicQuery),
    ]);
    check(coldWeb.stepText[0], "Урок для {{userName}}: версия один", "Web: original shared content from PostgreSQL");
    check(coldApi.stepText[0], coldWeb.stepText[0], "Mobile API: same shared content from PostgreSQL");
    await Promise.all([rpc(web, "content", publicQuery), rpc(mobileApi, "content", publicQuery)]);
    const [mWeb, mApi] = await Promise.all([rpc(web, "metrics"), rpc(mobileApi, "metrics")]);
    check([mWeb.counters.hit, mApi.counters.hit], [1, 1], "Separate Web/API hot-cache reads on real Redis");
    check([mWeb.prismaRead.count, mApi.prismaRead.count], [1, 1], "Repeat reads avoid SQL for shared content");

    const [aliceDetail, bobDetail] = await Promise.all([
      rpc(web, "detail", { ...publicQuery, userId: alice.id }),
      rpc(mobileApi, "detail", { ...publicQuery, userId: bob.id }),
    ]);
    check([aliceDetail.title, bobDetail.title], ["День для Алиса", "День для Борис"],
      "Personalized lessons differ by user on real SQL");
    check([aliceDetail.userStatus, bobDetail.userStatus], ["COMPLETED", "NOT_STARTED"],
      "User progress never leaks through shared content cache");
    check([aliceDetail.stepStatus[0], bobDetail.stepStatus[0]], ["COMPLETED", "NOT_STARTED"],
      "Step status is fetched from real per-user tables");

    const allowed = await rpc(web, "detail", { ...paidQuery, userId: alice.id });
    const denied = await rpc(mobileApi, "detail", { ...paidQuery, userId: bob.id });
    check([Boolean(allowed), denied], [true, null], "Paid/private course ACL evaluated per reader");
    await prisma.courseAccess.delete({ where: {
      courseId_userId: { courseId: paidCourse.id, userId: alice.id },
    } });
    check(await rpc(web, "detail", { ...paidQuery, userId: alice.id }), null,
      "Live access revocation denies previously authorized viewer despite cache");

    // Update through the ACTUAL trainer step service, not synthetic Redis INCR.
    const { updateStep } = await import(new URL("trainerStep/trainerStepService.js", coreBase));
    const { connection } = await import(queuesRedisUrl);
    check(await connection.ping(), "PONG", "Trainer process uses real Redis");
    const revisionKey = "gafus:training-content:revision:v1";
    const beforeRevision = Number(await connection.get(revisionKey) ?? 0);
    const changed = await updateStep({
      id: step.id, title: "Theory Test updated",
      description: "Урок для {{userName}}: версия два",
      durationSec: null, estimatedDurationSec: null,
      type: "THEORY", videoUrl: "https://example.invalid/updated-only.mp4",
      imageUrls: ["https://example.invalid/updated-only.png"],
      pdfUrls: [], checklist: null, requiresVideoReport: false,
      requiresWrittenFeedback: false, hasTestQuestions: false,
      surveySlug: null, isDailyCourse: false,
    });
    check(changed.success, true, "Trainer Step.update committed to real PostgreSQL");
    check(Number(await connection.get(revisionKey)), beforeRevision + 1,
      "Trainer write increments shared revision using real Redis INCR");
    const [updatedWeb, updatedApi] = await Promise.all([
      rpc(web, "content", publicQuery), rpc(mobileApi, "content", publicQuery),
    ]);
    check([updatedWeb.stepText[0], updatedApi.stepText[0]],
      ["Урок для {{userName}}: версия два", "Урок для {{userName}}: версия два"],
      "Both processes invalidate and reload real SQL immediately after trainer edit");
    const [sharedPaidWeb, sharedPaidApi] = await Promise.all([
      rpc(web, "content", paidQuery), rpc(mobileApi, "content", paidQuery),
    ]);
    check([sharedPaidWeb.stepText[0], sharedPaidApi.stepText[0]],
      ["Урок для {{userName}}: версия два", "Урок для {{userName}}: версия два"],
      "Shared Step update invalidates both public and paid course references");

    const [afterWeb, afterApi] = await Promise.all([
      rpc(web, "metrics"), rpc(mobileApi, "metrics"),
    ]);
    check([afterWeb.counters.revisionFlush >= 1, afterApi.counters.revisionFlush >= 1],
      [true, true], "Real Redis invalidation reported in Web and API metrics");

    // Failed trainer mutation MUST NOT increment revision.
    const failed = await updateStep({
      id: "nonexistent-step-" + run, title: "No such step",
      description: "This is an intentionally failing test update.",
      durationSec: null, estimatedDurationSec: null, type: "THEORY",
      imageUrls: [], pdfUrls: [], checklist: null,
      requiresVideoReport: false, requiresWrittenFeedback: false,
      hasTestQuestions: false, surveySlug: null, isDailyCourse: false,
    });
    check(failed.success, false, "Failed Prisma write handled safely");
    check(Number(await connection.get(revisionKey)), beforeRevision + 1,
      "Failed trainer update does NOT publish invalidation");

    // Force a cold local cache in only this reader before testing single-flight.
    await rpc(mobileApi, "clearCache");
    const beforeParallel = (await rpc(mobileApi, "metrics")).prismaRead.count;
    const parallel = await rpc(mobileApi, "parallel", paidQuery);
    check(parallel.length, 20, "Twenty concurrent authenticated-process shared reads finish");
    check(parallel.every(x => x === day.title), true,
      "Twenty parallel shared reads return the same day without corruption");
    const parallelMetrics = await rpc(mobileApi, "metrics");
    check(parallelMetrics.prismaRead.count - beforeParallel, 1,
      "Twenty cold reads issue only ONE real PostgreSQL content query");

    // The preceding intentionally unsuccessful UPDATE fires a statement-level
    // trigger even if it changed no rows; rewarm this reader first.
    await rpc(web, "content", publicQuery);
    // Simulate Redis outage for ONE reader connection, without stopping local Redis.
    // PostgreSQL's committed revision alone is enough for freshness.
    const beforeOutage = (await rpc(web, "metrics")).prismaRead.count;
    check((await rpc(web, "offline")).status, "end", "Disconnect only Web reader's Redis client");
    const cachedWhileRedisDown = await rpc(web, "content", publicQuery);
    check(cachedWhileRedisDown.stepText[0], "Урок для {{userName}}: версия два",
      "Web serves current cached content while Redis is disconnected");
    check((await rpc(web, "metrics")).prismaRead.count, beforeOutage,
      "Redis outage does not force a full PostgreSQL content reload");

    const redisBeforeDirectChange = Number(await connection.get(revisionKey));
    await prisma.trainingDay.update({ where: { id: day.id }, data: {
      description: "Changed while Web Redis was down",
    } });
    const changedWhileOffline = await rpc(web, "content", publicQuery);
    check(changedWhileOffline.description, "Changed while Web Redis was down",
      "Web gets a newly committed lesson while its Redis connection remains down");
    check((await rpc(web, "metrics")).prismaRead.count, beforeOutage + 1,
      "PostgreSQL revision invalidates Web cache without reader Redis");
    check(Number(await connection.get(revisionKey)), redisBeforeDirectChange,
      "No Redis INCR was required to invalidate the reader cache");
    check((await rpc(web, "online")).status, "ready", "Web reader Redis connection restores");
    await rpc(web, "content", publicQuery);
    const reconnectedMetrics = await rpc(web, "metrics");
    check(reconnectedMetrics.prismaRead.count, beforeOutage + 1,
      "Web keeps valid hot cache when Redis recovers");

    // TTL expiration is simulated with a per-reader clock, leaving global clock unaffected.
    const beforeExpiry = (await rpc(mobileApi, "metrics")).prismaRead.count;
    check((await rpc(mobileApi, "advanceTTL")).advancedMs, 61000, "Advance isolated API clock > 60s TTL");
    await rpc(mobileApi, "content", publicQuery);
    check((await rpc(mobileApi, "metrics")).prismaRead.count, beforeExpiry + 1,
      "TTL expiry refreshes stale cache using real PostgreSQL");

    // Real trainer TrainingDay mutation must propagate to all course links.
    const { updateTrainingDay } = await import(
      new URL("trainingDay/trainingDayService.js", coreBase)
    );
    const preDayRevision = Number(await connection.get(revisionKey));
    const daySaved = await updateTrainingDay({
      id: day.id, title: "Обновлённый день для {{userName}}",
      description: "Новая версия описания дня",
      type: "regular", equipment: "", showCoursePathExport: false,
      shareProgressAcrossCourses: false, stepIds: [step.id],
    });
    check(daySaved.success, true, "Trainer TrainingDay.update committed to real PostgreSQL");
    check(Number(await connection.get(revisionKey)), preDayRevision + 1,
      "TrainingDay update publishes Redis invalidation");
    const dayAcrossCourses = await Promise.all([
      rpc(web, "content", publicQuery), rpc(mobileApi, "content", paidQuery),
    ]);
    check(dayAcrossCourses.map(x => x.title),
      ["Обновлённый день для {{userName}}", "Обновлённый день для {{userName}}"],
      "Shared TrainingDay edit refreshes both public and private course caches");

    // Real Trainer Course mutation updates metadata projected into lesson cache.
    const { updateCourse } = await import(
      new URL("trainerCourse/trainerCourseService.js", coreBase)
    );
    const preCourseRevision = Number(await connection.get(revisionKey));
    const courseSaved = await updateCourse({
      id: publicCourse.id, name: "Renamed local test course",
      shortDesc: "", description: "Updated course metadata",
      duration: "14", logoImg: "", isPublic: true, isPaid: false,
      isPersonalized: true, trainingDays: [day.id],
      equipment: "", trainingLevel: "BEGINNER", allowedUsers: [],
    });
    check(courseSaved.success, true, "Trainer Course.update committed to real PostgreSQL");
    check(Number(await connection.get(revisionKey)), preCourseRevision + 1,
      "Course update publishes Redis invalidation");
    const changedMetadata = await Promise.all([
      rpc(web, "content", publicQuery), rpc(mobileApi, "content", publicQuery),
    ]);
    check(changedMetadata.map(x => x.duration), ["14", "14"],
      "Web and Mobile API pick up modified Course metadata without TTL delay");

    // Crucial regression: PostgreSQL commit succeeds while trainer's Redis
    // publication fails. The DB trigger increments durable revision atomically.
    // BOTH readers must immediately see the changed lesson despite unchanged
    // Redis version and warm local caches.
    await Promise.all([rpc(web, "content", publicQuery), rpc(mobileApi, "content", publicQuery)]);
    const revisionBeforeLostPublish = Number(await connection.get(revisionKey));
    const originalRetry = connection.options.retryStrategy;
    connection.options.retryStrategy = () => null;
    connection.disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    check(connection.status, "end", "Disconnect only trainer writer's Redis client");
    const lostPublish = await updateStep({
      id: step.id, title: "Step after writer Redis outage",
      description: "Урок для {{userName}}: версия три без публикации",
      durationSec: null, estimatedDurationSec: null, type: "THEORY",
      imageUrls: [], pdfUrls: [], videoUrl: null, checklist: null,
      requiresVideoReport: false, requiresWrittenFeedback: false,
      hasTestQuestions: false, surveySlug: null, isDailyCourse: false,
    });
    check(lostPublish.success, true,
      "PostgreSQL write succeeds even if the writer cannot reach Redis");
    const { getCourseCacheMetricsSnapshot } = await import(
      new URL("training/trainingContentMetrics.js", coreBase)
    );
    check(getCourseCacheMetricsSnapshot().counters.redisPublishFailure >= 1, true,
      "Writer reports failed invalidation in local metrics");
    const [afterMissedRedisWeb, afterMissedRedisApi] = await Promise.all([
      rpc(web, "content", publicQuery),
      rpc(mobileApi, "content", publicQuery),
    ]);
    check([afterMissedRedisWeb.stepText[0], afterMissedRedisApi.stepText[0]],
      ["Урок для {{userName}}: версия три без публикации",
       "Урок для {{userName}}: версия три без публикации"],
      "FIXED: both readers immediately see PostgreSQL edit when Redis publication fails");
    connection.options.retryStrategy = originalRetry;
    await connection.connect();
    check(await connection.ping(), "PONG", "Writer Redis connection restored");
    check(Number(await connection.get(revisionKey)), revisionBeforeLostPublish,
      "Redis revision did NOT advance on failed publish; freshness came from Postgres");
    const { publishCourseContentChange } = await import(
      new URL("training/trainingContentRevision.js", coreBase)
    );
    await publishCourseContentChange();
    check(Number(await connection.get(revisionKey)), revisionBeforeLostPublish + 1,
      "Optional Redis republish still works, but is not required for freshness");
    const fullyRestored = await Promise.all([
      rpc(web, "content", publicQuery), rpc(mobileApi, "content", publicQuery),
    ]);
    check(fullyRestored.map(x => x.stepText[0]),
      ["Урок для {{userName}}: версия три без публикации",
       "Урок для {{userName}}: версия три без публикации"],
      "Both processes refresh after recovering writer publication");

    // Raw Prisma write does not call trainer Redis publishing, but the
    // PostgreSQL trigger still changes the durable revision atomically.
    const baseRedisRevision = Number(await connection.get(revisionKey));
    const previousOrder = (await rpc(web, "content", publicQuery)).stepOrder;
    check(previousOrder, [0], "Shared step ordering was already cached");
    // Trainer's updateTrainingDay recreates StepOnDay records, so resolve the
    // CURRENT association rather than using the earlier fixture's ID.
    const currentStepLink = await prisma.stepOnDay.findFirstOrThrow({
      where: { dayId: day.id, stepId: step.id },
    });
    await prisma.stepOnDay.update({
      where: { id: currentStepLink.id }, data: { order: 2 },
    });
    check(Number(await connection.get(revisionKey)), baseRedisRevision,
      "Direct Prisma StepOnDay update does not publish a Redis signal");
    const relinked = await Promise.all([
      rpc(web, "content", publicQuery), rpc(mobileApi, "content", paidQuery),
    ]);
    check(relinked.map(x => x.stepOrder), [[2], [2]],
      "StepOnDay database trigger refreshes both caches without Redis notification");

    await prisma.dayOnCourse.update({
      where: { id: publicLink }, data: { order: 3 },
    });
    check((await rpc(web, "content", publicQuery)).dayOrder, 3,
      "DayOnCourse trigger invalidates order changes without Redis signal");
    check(Number(await connection.get(revisionKey)), baseRedisRevision,
      "Association updates remain consistent without any Redis version change");

    // Transaction rollback undoes the version bump together with the content.
    const durableBeforeRollback = (
      await prisma.$queryRaw`SELECT "revision" FROM "CourseContentRevision" WHERE "id" = 1`
    )[0].revision;
    const beforeFailedTransaction = (await rpc(web, "content", publicQuery)).stepText[0];
    await assert.rejects(
      prisma.$transaction(async tx => {
        await tx.step.update({ where: { id: step.id },
          data: { description: "This edit will ROLLBACK." } });
        throw new Error("LOCAL_ROLLBACK_MARKER");
      }),
      /LOCAL_ROLLBACK_MARKER/,
    );
    check((
      await prisma.$queryRaw`SELECT "revision" FROM "CourseContentRevision" WHERE "id" = 1`
    )[0].revision, durableBeforeRollback,
      "Rolled-back PostgreSQL edit does not advance the durable cache version");
    check((await rpc(web, "content", publicQuery)).stepText[0],
      beforeFailedTransaction, "Rolled-back content is never served");

    // In-progress SQL transaction remains invisible until COMMIT. Once committed,
    // the next reader request sees the new durable revision without Redis INCR.
    let releaseCommit;
    let signalMutation;
    const mutationReached = new Promise(resolve => { signalMutation = resolve; });
    const holdTransaction = new Promise(resolve => { releaseCommit = resolve; });
    const durableBeforeCommit = (
      await prisma.$queryRaw`SELECT "revision" FROM "CourseContentRevision" WHERE "id" = 1`
    )[0].revision;
    const committing = prisma.$transaction(async tx => {
      await tx.step.update({ where: { id: step.id },
        data: { description: "Урок для {{userName}}: версия четыре (atomic)" } });
      signalMutation();
      await holdTransaction;
    }, { timeout: 10_000 });
    try {
      await mutationReached;
      check((await rpc(web, "content", publicQuery)).stepText[0],
        beforeFailedTransaction, "Uncommitted PostgreSQL content is not visible");
      check((
        await prisma.$queryRaw`SELECT "revision" FROM "CourseContentRevision" WHERE "id" = 1`
      )[0].revision, durableBeforeCommit,
        "Uncommitted PostgreSQL revision remains invisible");
    } finally {
      releaseCommit();
    }
    await committing;
    check((await rpc(web, "content", publicQuery)).stepText[0],
      "Урок для {{userName}}: версия четыре (atomic)",
      "Next cache read immediately sees committed SQL without Redis publication");
    check(Number(await connection.get(revisionKey)), baseRedisRevision,
      "PostgreSQL transaction revision is authoritative even with unchanged Redis");

    // Local-only latency comparison with actual Redis and SQL, no assertion
    // on relative speed because benchmark results are machine-dependent.
    const bench = await rpc(web, "benchmark", publicQuery);
    check(bench.iterations, 40, "40 PostgreSQL-validated cached vs 40 direct SQL reads measured");
    console.log("LOCAL LATENCY, not production p95:",
      JSON.stringify({ cachedAvgMs: bench.cacheReadAvgMs, directSqlAvgMs: bench.directSqlAvgMs }));

    // Full feature-flag rollback uses direct SQL for every request, without
    // restarting Redis/PostgreSQL or affecting the second reader.
    check((await rpc(web, "setCacheEnabled", { enabled: false })).enabled, false,
      "Disable cache on Web reader without changing other services");
    const beforeRollback = (await rpc(web, "metrics")).prismaRead.count;
    await rpc(web, "content", publicQuery);
    await rpc(web, "content", publicQuery);
    check((await rpc(web, "metrics")).prismaRead.count, beforeRollback + 2,
      "With feature flag disabled, every request reaches real PostgreSQL");
    check((await rpc(web, "setCacheEnabled", { enabled: true })).enabled, true,
      "Re-enable cache on one Web reader");
    const beforeReenable = (await rpc(web, "metrics")).prismaRead.count;
    await rpc(web, "content", publicQuery);
    await rpc(web, "content", publicQuery);
    check((await rpc(web, "metrics")).prismaRead.count, beforeReenable + 1,
      "After re-enabling, first request fills cache and second skips SQL");

    console.log(`SUCCESS: ${checks} real localhost Redis/PostgreSQL checks passed`);
  } catch (error) {
    console.error("LIVE SMOKE FAILED:", error.stack || String(error));
    process.exitCode = 1;
  } finally {
    for (const child of readers) {
      try {
        if (child.connected) await Promise.race([
          rpc(child, "stop"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("STOP_TIMEOUT")), 3000)),
        ]);
      } catch {
        child.kill();
      }
    }
    await prisma.$disconnect();
    try {
      const { connection } = await import(queuesRedisUrl);
      if (connection.status === "ready") await connection.quit();
      else connection.disconnect();
    } catch {}
  }
}
