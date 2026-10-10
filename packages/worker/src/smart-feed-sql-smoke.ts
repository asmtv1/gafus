export {};
/**
 * Non-destructive SQL verification, for a disposable migrated test database.
 * Requires FEED_SMART_TEST_DATABASE_URL and FEED_SMART_TEST_CONFIRM=YES.
 * Any changes made by aggregation are rolled back before the command exits.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.FEED_SMART_TEST_DATABASE_URL;
  if (!databaseUrl || process.env.FEED_SMART_TEST_CONFIRM !== "YES") {
    throw new Error("Explicit isolated test database and confirmation are required");
  }
  const parsed = new URL(databaseUrl);
  const expectedDatabase = decodeURIComponent(parsed.pathname.slice(1));
  if (!/^gafus_[a-z0-9_]*smart_test$/.test(expectedDatabase) ||
      !["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("Refusing a database not named gafus_*smart_test");
  }
  process.env.DATABASE_URL = databaseUrl;
  const { prisma } = await import("@gafus/prisma");
  const { refreshSmartFeedStats, trainSmartFeedRanker } =
    await import("@gafus/core/services/feed");
  const rollbackTag = "SMART_SQL_VERIFICATION_ROLLBACK";
  let succeeded = false;
  try {
    const dbIdentity = await prisma.$queryRaw<Array<{ database: string; encoding: string }>>`
      SELECT current_database() AS database, current_setting('server_encoding') AS encoding
    `;
    if (dbIdentity[0]?.database !== expectedDatabase || dbIdentity[0]?.encoding !== "UTF8") {
      throw new Error("Unexpected database or encoding; UTF8 is required");
    }
    const requiredTables = [
      "FeedPersonalizationPreference", "FeedImpression", "FeedPostStats",
      "FeedUserPostFeedback", "FeedSmartRankerModel", "FeedUserAuthorAffinity",
      "FeedRankingEvent",
    ];
    const tables = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname = 'public'
    `;
    for (const name of requiredTables) {
      if (!tables.some(table => table.name === name)) {
        throw new Error("Missing migration table: " + name);
      }
    }
    const triggers = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT tgname AS name FROM pg_catalog.pg_trigger
      WHERE NOT tgisinternal AND tgname = 'feed_profile_city_key_sync'
    `;
    if (!triggers.length) throw new Error("City normalization trigger missing");
    const indexes = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT indexname AS name FROM pg_catalog.pg_indexes
      WHERE schemaname = 'public'
    `;
    for (const name of ["FeedImpression_userId_postId_rankingSessionId_key",
      "FeedPostStats_pkey", "FeedSmartRankerModel_version_key"]) {
      if (!indexes.some(index => index.name === name)) throw new Error("Missing index: " + name);
    }
    await prisma.$transaction(async tx => {
      const { randomUUID } = await import("node:crypto");
      const { PetType } = await import("@gafus/prisma");
      const { rankSmartCandidates, refreshSmartAuthorAffinities, getSmartExperimentReport } =
        await import("@gafus/core/services/feed");
      const at = new Date();
      const stamp = randomUUID().replace(/-/g, "").slice(0, 15);
      // Isolated synthetic fixtures: never commit a profile, post or interaction.
      const makeUser = (suffix: string, city: string) => tx.user.create({
        data: {
          username: "smoke_" + suffix + "_" + stamp,
          password: "disabled-smoke-fixture",
          profile: { create: { city } },
        },
      });
      const viewer = await makeUser("viewer", "  МОСКВА  ");
      const local = await makeUser("local", "Москва");
      const remote = await makeUser("remote", "Казань");
      const normalized = await tx.userProfile.findUnique({
        where: { userId: viewer.id }, select: { cityKey: true },
      });
      if (normalized?.cityKey !== "москва") {
        throw new Error("Cyrillic city normalization trigger produced " + normalized?.cityKey);
      }
      for (const ownerId of [viewer.id, local.id]) {
        const pet = await tx.pet.create({ data: {
          ownerId, name: "Smoke dog", type: PetType.DOG,
          breed: ownerId === viewer.id ? "Labrador Retriever" : "Лабрадор",
          birthDate: new Date("2023-01-01"), showInProfile: true,
        } });
        const key = await tx.pet.findUnique({ where: { id: pet.id }, select: { breedKey: true } });
        if (key?.breedKey !== "лабрадор") throw new Error("Breed normalization trigger failed");
      }
      const makePost = (authorId: string) => tx.feedPost.create({ data: {
        authorId, status: "published", moderationState: "visible",
        publishedAt: new Date(at.getTime() - 3600000),
        clientRequestId: randomUUID(),
      } });
      const localPost = await makePost(local.id);
      const remotePost = await makePost(remote.id);
      if (process.env.FEED_SMART_SQL_BENCHMARK === "true") {
        await tx.feedPost.createMany({ data: Array.from({ length: 498 }, (_, i) => ({
          authorId: i % 2 === 0 ? local.id : remote.id,
          status: "published" as const, moderationState: "visible",
          publishedAt: new Date(at.getTime() - 2 * 3600000 - i * 60000),
          clientRequestId: randomUUID(),
        })) });
      }
      await tx.feedPostReaction.create({ data: {
        postId: localPost.id, userId: viewer.id, kind: "heart",
      } });
      await tx.feedBookmark.create({ data: { postId: localPost.id, userId: viewer.id } });
      await tx.feedComment.create({ data: {
        postId: localPost.id, authorId: viewer.id,
        clientRequestId: randomUUID(), text: "isolated smoke comment",
      } });
      const impression = await tx.feedImpression.create({ data: {
        eventId: randomUUID(), userId: viewer.id, postId: localPost.id,
        rankingSessionId: randomUUID(), algorithmVersion: "smoke",
        rank: 0, visibleMs: 2000, features: Array(13).fill(0.5),
        candidateSources: ["recent", "local", "pet"],
      } });
      await tx.feedRankingEvent.create({ data: {
        eventId: randomUUID(), userId: viewer.id, postId: localPost.id,
        rankingSessionId: impression.rankingSessionId,
        kind: "dwell", durationMs: 9000,
      } });
      const actualDwell = await tx.feedRankingEvent.count({
        where: { postId: localPost.id, userId: viewer.id, kind: "dwell" },
      });
      if (actualDwell !== 1) throw new Error("Ranking outcome event was not persisted");
      // Exercise the same aggregate SQL used by production worker.
      const updated = await refreshSmartFeedStats(tx as never, 100);
      if (!Number.isSafeInteger(updated) || updated < 2 || updated > 100) {
        throw new Error("Aggregate SQL did not update synthetic posts");
      }
      const refreshed = await refreshSmartAuthorAffinities(tx as never, 100);
      if (refreshed < 1) throw new Error("Affinity materialization did not process fixture viewer");
      const affinity = await tx.feedUserAuthorAffinity.findUnique({
        where: { userId_authorId: { userId: viewer.id, authorId: local.id } },
      });
      if (!affinity || affinity.reactionCount !== 1 || affinity.bookmarkCount !== 1 ||
          affinity.commentCount !== 1 || affinity.qualifiedViewCount !== 1) {
        throw new Error("Author affinity counts or decay calculation incorrect");
      }
      const report = await getSmartExperimentReport(tx as never, at);
      if (report.arms.length !== 0) throw new Error("Immature exposures must not enter experiment analysis");
      const stats = await tx.feedPostStats.findUnique({ where: { postId: localPost.id } });
      if (stats?.reactionCount !== 1 || stats.bookmarkCount !== 1 ||
          stats.uniqueCommenterCount !== 1 || stats.qualifiedImpressionCount !== 1) {
        throw new Error("Aggregate counts do not match fixture interactions");
      }
      // Match locality and pet interests without the intentional seen-post penalty.
      const options = { useCity: true, usePets: true, useBehavior: false,
        exploration: false, multiSource: true };
      const ranked = await rankSmartCandidates(tx as never, viewer.id, at, options);
      const localRank = ranked.findIndex(row => row.id === localPost.id);
      const remoteRank = ranked.findIndex(row => row.id === remotePost.id);
      if (localRank < 0 || (remoteRank >= 0 && localRank >= remoteRank)) {
        throw new Error("Unexpected local/remote ranking positions: local=" + localRank + " remote=" + remoteRank + " total=" + ranked.length);
      }
      await tx.feedUserPostFeedback.create({ data: {
        userId: viewer.id, postId: remotePost.id, kind: "not_interested",
      } });
      const filtered = await rankSmartCandidates(tx as never, viewer.id, at, options);
      if (filtered.some(row => row.id === remotePost.id)) {
        throw new Error("Negative feedback failed to exclude the post");
      }
      if (process.env.FEED_SMART_SQL_BENCHMARK === "true") {
        const { performance } = await import("node:perf_hooks");
        const measurements: number[] = [];
        for (let i = 0; i < 10; i += 1) {
          const started = performance.now();
          const page = await rankSmartCandidates(tx as never, viewer.id, at, {
            ...options, useBehavior: true,
          });
          if (page.length === 0 || page.length > 200) {
            throw new Error("Unexpected benchmark recommendation count");
          }
          measurements.push(performance.now() - started);
        }
        measurements.sort((a, b) => a - b);
        const p50 = measurements[Math.floor(measurements.length / 2)]!;
        const p95 = measurements[Math.floor(measurements.length * 0.95)]!;
        process.stdout.write(
          "Isolated PostgreSQL ranking with 500 seeded posts, 10 requests: " +
          "p50=" + p50.toFixed(2) + "ms p95=" + p95.toFixed(2) +
          "ms (DB + server logic, not full HTTP).\n",
        );
      }
      const training = await trainSmartFeedRanker(tx as never, at);
      if (training.status !== "insufficient_data") {
        throw new Error("Immature fixture data must not train an ML model");
      }
      succeeded = true;
      throw new Error(rollbackTag);
    }, { maxWait: 10000, timeout: 60000 });
  } catch (error) {
    if (!succeeded || !(error instanceof Error) || error.message !== rollbackTag) throw error;
  } finally {
    await prisma.$disconnect();
  }
  process.stdout.write("Smart feed database SQL verified; transaction rolled back.\n");
}
void main().catch(error => {
  process.stderr.write(error instanceof Error ? error.message + "\n" : "SQL verification failed\n");
  process.exitCode = 1;
});
