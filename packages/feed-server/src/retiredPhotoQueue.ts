/** One-way cleanup of pre-cutover Feed image/album-copy tasks.
 * The video worker MUST NEVER claim a photo job. Existing stale records need a
 * terminal status instead of remaining PROCESSING forever after Cloud deletion.
 * No image transformation, S3 upload or Cloud.ru API calls are made here.
 */
import {prisma} from '@gafus/prisma';

export function createRetiredFeedPhotoQueueTick(input:{
 database:typeof prisma;
 now?:()=>Date;
}){
 const now=input.now??(()=>new Date());
 let running=false;
 return async()=>{
  if(running)return {skipped:true,retired:0};
  running=true;
  let retired=0;
  try{
   const at=now();
   const tasks=await input.database.feedStorageJob.findMany({
    where:{kind:{in:['publish_photo','copy_album']},OR:[
      {status:'pending'}, {status:'processing',leaseUntil:{lt:at}},
    ]},orderBy:[{availableAt:'asc'},{id:'asc'}],take:20,
    select:{id:true,kind:true,uploadId:true,mediaId:true},
   });
   for(const job of tasks){
    await input.database.$transaction(async tx=>{
     const r=await tx.feedStorageJob.updateMany({
      where:{id:job.id,kind:{in:['publish_photo','copy_album']},OR:[
        {status:'pending'},{status:'processing',leaseUntil:{lt:now()}},
      ]},data:{status:'failed',errorCode:'PHOTO_JOB_RETIRED',attemptToken:null,leaseUntil:null},
     });
     if(!r.count)return;
     if(job.uploadId)await tx.feedUpload.updateMany({
      where:{id:job.uploadId,status:{in:['uploaded','processing']}},
      data:{status:'failed',errorCode:'PHOTO_JOB_RETIRED',attemptToken:null,leaseUntil:null},
     });
     if(job.mediaId){
      await tx.feedMediaAsset.updateMany({
       where:{id:job.mediaId,status:{in:['uploaded','processing']}},
       data:{status:'failed',errorCode:'PHOTO_JOB_RETIRED'},
      });
      await tx.feedPostRevision.updateMany({
       where:{status:'pending',attachments:{some:{mediaId:job.mediaId}}},
       data:{status:'failed',errorCode:'PHOTO_JOB_RETIRED'},
      });
     }
     retired++;
    });
   }
   return {retired};
  }finally{running=false;}
 };
}


export const createCurrentRetiredFeedPhotoQueueTick=()=>createRetiredFeedPhotoQueueTick({database:prisma});
