/** Only already granted activity rows count against the daily Gafus earning limit. */
import {prisma} from "@gafus/prisma";

export async function listGrantedGafusActivity(
  authenticatedOwnerId: string, cutoffExclusive: Date, nowInclusive: Date,
): Promise<{amount:number;occurredAt:Date}[]> {
  if (!authenticatedOwnerId) throw new Error("GAFUS_STATUS_OWNER_REQUIRED");
  if (!(cutoffExclusive instanceof Date) || !(nowInclusive instanceof Date) ||
      !Number.isFinite(cutoffExclusive.getTime()) || !Number.isFinite(nowInclusive.getTime()) ||
      cutoffExclusive >= nowInclusive) throw new Error("GAFUS_STATUS_TIME_WINDOW_INVALID");
  return prisma.gafusRewardEvent.findMany({
    where:{
      userId:authenticatedOwnerId,rewardClass:"ACTIVITY",decision:"GRANTED",
      occurredAt:{gt:cutoffExclusive,lte:nowInclusive},
    },
    select:{amount:true,occurredAt:true},
    orderBy:{occurredAt:"asc"},
  });
}
