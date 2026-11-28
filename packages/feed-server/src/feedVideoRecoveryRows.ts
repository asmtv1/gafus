import { prisma } from "@gafus/prisma";

/** Durable due-video read. Never claims jobs or acknowledges external dispatch. */
export function createCountDueFeedVideoRecovery(database: Pick<typeof prisma, "feedStorageJob">) {
  return async (now: Date): Promise<number> => {
    const due = await database.feedStorageJob.groupBy({
      by: ["kind"],
      where: { OR: [
        { status: "pending", availableAt: { lte: now } },
        { status: "processing", leaseUntil: { lt: now } },
      ] },
      _count: { _all: true },
    });
    let videos = 0;
    for (const row of due) {
      if (row.kind === "publish_video") videos += row._count._all;
    }
    return videos;
  };
}
export const countDueFeedVideoRecovery = createCountDueFeedVideoRecovery(prisma);
