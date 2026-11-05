/**
 * Gallery S3 janitor in the existing GAFUS Worker. No Cloud.ru Container Job.
 * Gallery uploads are client-encoded WebP, finalized synchronously by Hono.
 * Only durable delete/move/storage reconciliation remains in the worker.
 */
import {prisma} from "@gafus/prisma";
import {createGalleryService,type GalleryService,type GalleryStorageJobClaim} from "@gafus/core/services/gallery";
import {createGalleryObjectStore,normalizeETag,objectMd5,type GalleryObjectStore,
  assertFinalKey,assertGalleryKey} from "@gafus/gallery-storage";

type Operations=Pick<GalleryService,"maintenance"|"claimStorageJobs"|"completeStorageJob"|"failStorageJob">;
type Context={core:Operations;objects:GalleryObjectStore;now?:()=>number};
const permanent=new Set(["UNTRUSTED_CLAIM","COPY_MISMATCH","IMMUTABLE_CONFLICT","SOURCE_CHANGED"]);

export function createGalleryLocalMaintenanceTick(input:Context){
  const now=input.now??Date.now;
  let running=false;
  return async function tick(){
    if(running)return {skipped:true,processed:0};
    running=true;
    let processed=0;
    try{
      // Reconcile and expire leases before claiming any S3 operations.
      await input.core.maintenance({limit:10});
      const deadline=now()+50_000;
      for(let index=0;index<10 && now()+10_000<deadline;index++){
        const jobs=await input.core.claimStorageJobs({limit:1});
        if(!jobs.length)break;
        if(jobs.length!==1)throw Error("GALLERY_LOCAL_BATCH_UNTRUSTED");
        const job=jobs[0]!;
        const leaseUntil=Date.parse(job.leaseUntil);
        const latest=Math.min(deadline,leaseUntil-5_000);
        const signal=new AbortController();
        let finishing=false;
        let failure:"GALLERY_LOCAL_RETRY"|"GALLERY_LOCAL_UNTRUSTED"="GALLERY_LOCAL_RETRY";
        const check=()=>{
          if(signal.signal.aborted||!Number.isFinite(latest)||now()>=latest)
            throw Error("GALLERY_LOCAL_LEASE_EXPIRED");
        };
        const timer=setTimeout(()=>signal.abort(),Math.max(1,latest-now()));
        timer.unref?.();
        try{
          check();
          if(job.writeMode!=="create-if-absent"||job.sourceKeys.length>32)
            throw Error("UNTRUSTED_CLAIM");
          job.sourceKeys.forEach(assertGalleryKey);
          if(job.kind==="delete"){
            if(job.targetKeys.length)throw Error("UNTRUSTED_CLAIM");
            for(const key of job.sourceKeys){check();await input.objects.delete(key,signal.signal);}
          }else if(job.kind==="move"){
            if(job.sourceKeys.length!==2||job.targetKeys.length!==2||job.sourceETags.length!==2)
              throw Error("UNTRUSTED_CLAIM");
            job.targetKeys.forEach(assertFinalKey);
            const parseKey=(key:string)=>
              /^albums\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/photos\/([A-Za-z0-9_-]+)\/(thumb|full)\.webp$/.exec(key);
            const sources=job.sourceKeys.map(parseKey),targets=job.targetKeys.map(parseKey);
            if(sources.some(value=>!value)||targets.some(value=>!value)||
               sources[0]![1]!==sources[1]![1]||sources[0]![3]!==sources[1]![3]||
               targets[0]![1]!==sources[0]![1]||targets[1]![1]!==sources[0]![1]||
               targets[0]![3]!==sources[0]![3]||targets[1]![3]!==sources[0]![3]||
               sources[0]![4]!=="thumb"||sources[1]![4]!=="full"||
               targets[0]![4]!=="thumb"||targets[1]![4]!=="full"||
               targets[0]![2]!==targets[1]![2])
              throw Error("UNTRUSTED_CLAIM");
            for(let i=0;i<2;i++){
              check();
              const source=await input.objects.read(job.sourceKeys[i]!,job.sourceETags[i],signal.signal);
              if(source.metadata.etag!==normalizeETag(job.sourceETags[i]!)||
                source.metadata.contentType!=="image/webp"||
                objectMd5(source.bytes)!==source.metadata.etag)
                throw Error("COPY_MISMATCH");
              check();
              const output=await input.objects.create(job.targetKeys[i]!,source.bytes,"image/webp",signal.signal);
              if(output.etag!==source.metadata.etag||output.bytes!==source.metadata.bytes||
                 output.contentType!==source.metadata.contentType)throw Error("COPY_MISMATCH");
            }
          }else if(job.kind==="vetPreview"){
            // Veterinary thumbnails are synchronous after photo-Job retirement.
            // Historical pending previews must reach a terminal state. Old
            // Gallery publish rows are independently retired by Core maintenance.
            finishing=true;
            const done=await input.core.failStorageJob({jobId:job.jobId,
              attemptToken:job.attemptToken,errorCode:"VET_PREVIEW_RETIRED",retryable:false});
            if(!done.accepted)throw Error("GALLERY_LOCAL_VET_SETTLEMENT_LOST");
            processed++;
            continue;
          }else{
            throw Error("UNTRUSTED_CLAIM");
          }
          check();
          finishing=true;
          const result=await input.core.completeStorageJob({jobId:job.jobId,attemptToken:job.attemptToken});
          if(!result.accepted)throw Error("GALLERY_LOCAL_COMPLETION_NOT_ACKNOWLEDGED");
          processed++;
        }catch(error){
          if(!finishing){
            const code=error instanceof Error?error.message:"";
            if(permanent.has(code))failure="GALLERY_LOCAL_UNTRUSTED";
            await input.core.failStorageJob({jobId:job.jobId,attemptToken:job.attemptToken,
              errorCode:failure,retryable:failure==="GALLERY_LOCAL_RETRY"});
          }
          // An unknown completion acknowledgement is never replayed with the
          // same attempt token. A later PG read reconciles the source/target.
          throw error;
        }finally{clearTimeout(timer);signal.abort();}
      }
      return {processed};
    }finally{running=false;}
  };
}

let tick:ReturnType<typeof createGalleryLocalMaintenanceTick>|undefined;
export async function runGalleryLocalMaintenanceTick(){
  // Explicit production opt-in; a local developer Worker without private S3
  // credentials must never attempt remote media maintenance.
  if(process.env.GALLERY_LOCAL_STORAGE_JANITOR_ENABLED!=="true")return;
  if(!tick){
    const bucket=process.env.GALLERY_BUCKET??"";
    const endpoint=process.env.GALLERY_S3_ENDPOINT??"https://s3.cloud.ru";
    const accessKeyId=process.env.GALLERY_S3_ACCESS_KEY_ID??"";
    const secretAccessKey=process.env.GALLERY_S3_SECRET_ACCESS_KEY??"";
    // Never fall back to shared/public storage or a guessed bucket.
    const objects=createGalleryObjectStore({bucket,endpoint,accessKeyId,secretAccessKey,
      cacheableFinalEnabled:process.env.GALLERY_CDN_CACHEABLE_FINAL_ENABLED==="true"});
    const core=createGalleryService({db:prisma,storage:{
      enabled:true,head:key=>objects.head(key,AbortSignal.timeout(5000)),
      presignPost:async()=>{throw Error("GALLERY_JANITOR_NO_UPLOADS");},
      signCdn:async()=>{throw Error("GALLERY_JANITOR_NO_CDN_SIGNING");},
    }});
    tick=createGalleryLocalMaintenanceTick({core,objects});
  }
  await tick();
}
