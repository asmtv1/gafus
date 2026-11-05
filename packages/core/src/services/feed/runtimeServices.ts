import { prisma } from "@gafus/prisma";
import { createFeedService } from "./service";
import { createFeedSocial } from "./social";
import { createFeedPolls } from "./polls";
import { createFeedPreferences } from "./preferences";
import { createSmartFeedPreferences } from "./smart-preferences";
import { createFeedStorageJobs } from "./jobs";
import { createFeedMaintenance } from "./maintenance";
import { createFeedUploadRecovery } from "./recovery";
import type { FeedStoragePort } from "./ports";

/**
 * Production implementations are assembled in core.
 * HTTP / Redis / object storage transports supply only external ports.
 */
export function createCurrentFeedRuntime(
  storage: FeedStoragePort,
  enabled: () => boolean,
) {
  return {
    service: createFeedService({ db: prisma, storage, enabled }),
    social: createFeedSocial({ db: prisma, storage, enabled }),
    polls: createFeedPolls({ db: prisma, storage, enabled }),
    preferences: createFeedPreferences({ db: prisma, enabled }),
    smartPreferences: createSmartFeedPreferences(prisma),
  };
}

export function createCurrentFeedInternalRuntime(storage: Pick<FeedStoragePort, "head">) {
  return {
    jobs: createFeedStorageJobs({ db: prisma, storage }),
    maintenance: createFeedMaintenance({ db: prisma }),
    recovery: createFeedUploadRecovery({ db: prisma, storage }),
  };
}

export function createCurrentFeedMaintenanceRuntime() {
  return {
    db: {feedStorageJob: {findMany: prisma.feedStorageJob.findMany.bind(prisma.feedStorageJob)}},
    jobs: createFeedStorageJobs({db: prisma}),
    maintenance: createFeedMaintenance({db: prisma}),
  };
}

export function listDueFeedCleanupJobs(db: {feedStorageJob: Pick<typeof prisma.feedStorageJob,"findMany">}, at: number) {
  return db.feedStorageJob.findMany({
        where:{kind:{in:['delete_keys','cleanup_source']},OR:[
          {status:'pending',availableAt:{lte:new Date(at)}},
          {status:'processing',leaseUntil:{lt:new Date(at)}},
        ]},
        orderBy:[{availableAt:'asc'},{id:'asc'}],take:10,
        select:{id:true,ownerId:true,kind:true},
      });
}
