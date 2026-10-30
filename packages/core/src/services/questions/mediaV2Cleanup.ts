import type { Prisma } from "@gafus/prisma";
/** Outbox must survive the QuestionPhoto row being unbound or deleted.
 * Sources may still arrive via 10-minute signed POST; running Jobs can outlive
 * a cancellation. Delay final S3 removal until neither can recreate objects. */
export async function scheduleQuestionsV2Cleanup(
  tx:Prisma.TransactionClient,photoIds:readonly string[],
  date=new Date(),
){
  if(!photoIds.length)return;
  const tasks=await tx.questionV2MediaTask.findMany({
    where:{photoId:{in:[...new Set(photoIds)]}},
    select:{mediaId:true,status:true,createdAt:true,leaseUntil:true},
  });
  for(const task of tasks){
    // A signed POST may be replayed for 10 min regardless of task status.
    // Also allow an already-running, aborted processor to release its writes.
    const deadline=Math.max(task.createdAt.getTime()+11*60_000,
      task.status==="PROCESSING"
        ?(task.leaseUntil?.getTime()??date.getTime())+60_000
        :date.getTime());
    await tx.questionV2MediaTask.update({
      where:{mediaId:task.mediaId},
      data:{status:"EXPIRED",attemptToken:null,leaseUntil:null,errorCode:"PHOTO_REMOVED",
        cleanupKind:"ALL",cleanupCompletedAt:null,cleanupToken:null,cleanupLeaseUntil:null,
        cleanupNextAt:new Date(Math.max(date.getTime(),deadline))},
    });
  }
}
