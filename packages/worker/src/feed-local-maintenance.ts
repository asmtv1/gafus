/**
 * Feed S3 janitor on existing GAFUS Worker; independent from Cloud.ru Jobs.
 * Cloud video workers are restricted to optional 360p, never image cleanup.
 */
import {prisma} from '@gafus/prisma';
import {createFeedMaintenance,createFeedStorageJobs} from '@gafus/core/services/feed';
import {assertFeedObjectKey,createFeedJanitorObjects,type FeedJanitorObjects} from '@gafus/feed-storage';

type Jobs=Pick<ReturnType<typeof createFeedStorageJobs>,'claim'|'complete'|'fail'>;
type Maintenance=Pick<ReturnType<typeof createFeedMaintenance>,'run'>;
type Database=Pick<typeof prisma,'feedStorageJob'>;
export function createFeedLocalMaintenanceTick(input:{
  db:Database;jobs:Jobs;maintenance:Maintenance;objects:FeedJanitorObjects;
  now?:()=>number;
}){
  const now=input.now??Date.now;
  let running=false;
  return async function tick(){
    if(running)return {skipped:true,processed:0};
    running=true;
    let processed=0;
    try{
      // Expire uploads, retire old publish_photo and enqueue deletion first.
      await input.maintenance.run(10);
      const deadline=now()+50_000;
      const due=await input.db.feedStorageJob.findMany({
        where:{kind:{in:['delete_keys','cleanup_source']},OR:[
          {status:'pending',availableAt:{lte:new Date(now())}},
          {status:'processing',leaseUntil:{lt:new Date(now())}},
        ]},
        orderBy:[{availableAt:'asc'},{id:'asc'}],take:10,
        select:{id:true,ownerId:true,kind:true},
      });
      for(const candidate of due){
        if(now()+10_000>=deadline)break;
        if(candidate.kind!=='delete_keys'&&candidate.kind!=='cleanup_source')continue;
        const claims=await input.jobs.claim(1,undefined,{
          jobId:candidate.id,ownerId:candidate.ownerId,kind:candidate.kind,
        });
        if(!claims.length)continue;
        if(claims.length!==1)throw Error('FEED_LOCAL_CLAIM_UNTRUSTED');
        const job=claims[0]!;
        const latest=Math.min(deadline,Date.parse(job.leaseUntil??'')-5_000);
        const controller=new AbortController();
        const signal=controller.signal;
        const timer=setTimeout(()=>controller.abort(),Math.max(1,latest-now()));
        timer.unref?.();
        let completing=false;
        try{
          const check=()=>{
            if(signal.aborted||!Number.isFinite(latest)||now()>=latest)
              throw Error('FEED_LOCAL_LEASE_EXPIRED');
          };
          if(!['delete_keys','cleanup_source'].includes(job.kind)||
              job.targetKeys.length||job.sourceKeys.length>40)
            throw Error('FEED_LOCAL_UNTRUSTED_CLAIM');
          job.sourceKeys.forEach(assertFeedObjectKey);
          for(const key of job.sourceKeys){
            check();
            await input.objects.delete(key,signal);
            check();
            if(await input.objects.exists(key,signal))
              throw Error('FEED_LOCAL_DELETE_NOT_CONFIRMED');
          }
          check();completing=true;
          const result=await input.jobs.complete(job.id,job.attemptToken);
          if(!result.accepted)throw Error('FEED_LOCAL_COMPLETION_UNACKNOWLEDGED');
          processed++;
        }catch(error){
          if(!completing){
            try{await input.jobs.fail(job.id,job.attemptToken,'FEED_LOCAL_CLEANUP_RETRY');}
            catch{throw Error('FEED_LOCAL_CLEANUP_FAILURE_UNACKNOWLEDGED');}
          }
          throw error;
        }finally{clearTimeout(timer);controller.abort();}
      }
      return {processed};
    }finally{running=false;}
  };
}

let tick:ReturnType<typeof createFeedLocalMaintenanceTick>|undefined;
export async function runFeedLocalMaintenanceTick(){
  if(process.env.FEED_LOCAL_STORAGE_JANITOR_ENABLED!=='true')return;
  if(!tick){
    const objects=createFeedJanitorObjects();
    tick=createFeedLocalMaintenanceTick({db:prisma,objects,
      jobs:createFeedStorageJobs({db:prisma}),
      maintenance:createFeedMaintenance({db:prisma}),
    });
  }
  await tick();
}
