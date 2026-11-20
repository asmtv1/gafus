import { createFeedService } from "./postRows.js";
import { createFeedSocial } from "./socialRows.js";
import { createFeedPolls } from "./pollRows.js";
import { createFeedStorageJobs } from "./storageJobs.js";
import { createFeedPreferenceOperations } from "./preferenceRows.js";
import { createFeedMaintenance } from "./maintenance.js";
export { createFeedMaintenance } from "./maintenance.js";
import { enqueueDeletedMediaPurge } from "@gafus/media-server/deleted-media-purge";
import { prisma } from "@gafus/prisma";
import { connection as smartFeedRedisConnection } from "@gafus/queues";
import { readSmartFeedPostStats } from "./smartStats.js";
import { readRankedFeedRows } from "@gafus/media-server/feed-ranked-rows";
import { readChronologicalFeedRows } from "./chronologicalRows.js";
import { smartRetrievalRows } from "./smartRetrievalRows.js";
import { smartRankingRows } from "./smartRankingRows.js";
import { smartFeedPreferencesRows } from "./smartPreferencesRows.js";
import { createFeedUploadRecoveryRows } from "./uploadRecoveryRows.js";
export { readSmartFeedPostStats } from "./smartStats.js";
import {
  createFeedPreferences,
  createSmartFeedPreferences,
  createFeedUploadRecovery,
  type FeedStoragePort,
} from "@gafus/core/services/feed";

/**
 * Production database and external-port composition is owned by feed-server.
 * HTTP / Redis / object storage transports supply only external ports.
 */
export function createCurrentFeedRuntime(storage: FeedStoragePort, enabled: () => boolean) {
  return {
    service: createFeedService({
      db: prisma,
      storage,
      enabled,
      readSmartFeedPostStats,
      readSmartRankingSnapshot: smartRankingRows,
      readSmartCandidateSources: smartRetrievalRows,
      readRankedFeedRows,
      readChronologicalRows: readChronologicalFeedRows,
      smartSessionCache: smartFeedRedisConnection,
    }),
    social: createFeedSocial({ db: prisma, storage, enabled }),
    polls: createFeedPolls({ db: prisma, storage, enabled }),
    preferences: createFeedPreferences({ operations: createFeedPreferenceOperations(prisma), enabled }),
    smartPreferences: createSmartFeedPreferences(smartFeedPreferencesRows),
  };
}

export function createCurrentFeedInternalRuntime(storage: Pick<FeedStoragePort, "head">) {
  return {
    jobs: createFeedStorageJobs({ db: prisma, storage, enqueueDeletedMediaPurge }),
    maintenance: createFeedMaintenance({ db: prisma }),
    recovery: createFeedUploadRecovery({ rows: createFeedUploadRecoveryRows(prisma), storage }),
  };
}

export function createCurrentFeedMaintenanceRuntime() {
  return {
    db: {
      feedStorageJob: { findMany: prisma.feedStorageJob.findMany.bind(prisma.feedStorageJob) },
    },
    jobs: createFeedStorageJobs({ db: prisma, enqueueDeletedMediaPurge }),
    maintenance: createFeedMaintenance({ db: prisma }),
  };
}

export function listDueFeedCleanupJobs(
  db: { feedStorageJob: Pick<typeof prisma.feedStorageJob, "findMany"> },
  at: number,
) {
  return db.feedStorageJob.findMany({
    where: {
      kind: { in: ["delete_keys", "cleanup_source"] },
      OR: [
        { status: "pending", availableAt: { lte: new Date(at) } },
        { status: "processing", leaseUntil: { lt: new Date(at) } },
      ],
    },
    orderBy: [{ availableAt: "asc" }, { id: "asc" }],
    take: 10,
    select: { id: true, ownerId: true, kind: true },
  });
}
