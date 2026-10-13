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
    social: createFeedSocial({ db: prisma, enabled }),
    polls: createFeedPolls({ db: prisma, storage, enabled }),
    preferences: createFeedPreferences({ db: prisma, enabled }),
    smartPreferences: createSmartFeedPreferences(prisma),
  };
}

export function createCurrentFeedInternalRuntime(storage: Pick<FeedStoragePort, "head">) {
  return {
    jobs: createFeedStorageJobs({ db: prisma }),
    maintenance: createFeedMaintenance({ db: prisma }),
    recovery: createFeedUploadRecovery({ db: prisma, storage }),
  };
}
