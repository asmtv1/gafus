/** Bounded SQL cleanup of derived smart-feed analytics; reactions/bookmarks and
 * lifetime views are not touched, with order and limit fixed by policy. */
import {prisma} from "@gafus/prisma";
import type {SmartRetentionPort} from "@gafus/core/services/feed";
export const smartRetentionRows:SmartRetentionPort={
  async pruneImpressions(cutoff,limit){
    const expired=await prisma.feedImpression.findMany({
      where:{occurredAt:{lt:cutoff}},select:{id:true},
      orderBy:[{occurredAt:"asc"},{id:"asc"}],take:limit,
    });
    if(!expired.length)return 0;
    return (await prisma.feedImpression.deleteMany({
      where:{id:{in:expired.map(row=>row.id)}},
    })).count;
  },
  async pruneRankingEvents(cutoff,limit){
    const expired=await prisma.feedRankingEvent.findMany({
      where:{createdAt:{lt:cutoff}},select:{eventId:true},
      orderBy:[{createdAt:"asc"},{eventId:"asc"}],take:limit,
    });
    if(!expired.length)return 0;
    return (await prisma.feedRankingEvent.deleteMany({
      where:{eventId:{in:expired.map(row=>row.eventId)}},
    })).count;
  },
};
