import { prisma } from "@gafus/prisma";

/** Durable due-video read. Never claims jobs or acknowledges external dispatch. */
export function createCountDueChat2VideoRecovery(database: Pick<typeof prisma, "chat2V2MediaTask">) {
  return async (now: Date): Promise<number> => {
    const grouped=await database.chat2V2MediaTask.groupBy({
      by:["sourceMime"],
      where:{attempts:{lt:4},sourceMime:{startsWith:"video/"},OR:[
        {status:"QUEUED",nextAttemptAt:{lte:now}},
        {status:"PROCESSING",leaseUntil:{lt:now}},
        {status:"READY",nextAttemptAt:{lte:now},
          OR:[{attemptToken:null},{leaseUntil:{lt:now}}],
          manifest:{path:["renditions"],array_contains:[{quality:720}]},
          NOT:{manifest:{path:["renditions"],array_contains:[{quality:360}]}}},
      ]},
      _count:{_all:true},
    });
    let videos=0;
    for(const item of grouped){
      if(item.sourceMime.startsWith("video/"))videos+=item._count._all;
    }
    return videos;
  };
}
export const countDueChat2VideoRecovery = createCountDueChat2VideoRecovery(prisma);
