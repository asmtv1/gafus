/** All table names, SQL transaction details and actor lookups stay in
 * feed-server. Core receives only business values and application methods. */
import { prisma } from "@gafus/prisma";
import type { SmartFeedPreferencesPort } from "@gafus/core/services/feed";
export const smartFeedPreferencesRows: SmartFeedPreferencesPort = {
  async actorExists(actorId) {
    return Boolean(await prisma.user.findUnique({ where:{id:actorId},select:{id:true} }));
  },
  async read(actorId) {
    const row=await prisma.feedPersonalizationPreference.findUnique({where:{userId:actorId}});
    return row ? {enabled:row.enabled,useCity:row.useCity,usePets:row.usePets,
      useBehavior:row.useBehavior,exploration:row.exploration} : null;
  },
  async patch(actorId, update, defaults) {
    const row=await prisma.feedPersonalizationPreference.upsert({
      where:{userId:actorId},create:{userId:actorId,...defaults,...update},update,
    });
    return {enabled:row.enabled,useCity:row.useCity,usePets:row.usePets,
      useBehavior:row.useBehavior,exploration:row.exploration};
  },
  async resetDerived(actorId, at, defaults) {
    await prisma.$transaction(async tx=>{
      await tx.feedPersonalizationPreference.upsert({
        where:{userId:actorId},
        create:{userId:actorId,...defaults,historyResetAt:at},
        update:{historyResetAt:at},
      });
      await tx.feedUserAuthorAffinity.deleteMany({where:{userId:actorId}});
      await tx.feedRankingEvent.deleteMany({where:{userId:actorId}});
      await tx.feedImpression.deleteMany({where:{userId:actorId}});
      await tx.feedUserPostFeedback.deleteMany({where:{userId:actorId}});
    });
  },
};
