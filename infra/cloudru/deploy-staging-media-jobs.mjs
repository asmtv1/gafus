/**
 * Staging-only dormant media processing jobs. No invocation of production core:
 * GAFUS_STAGE_CORE_BASE_URL must be a VERIFIED nonproduction core before they
 * may be executed. This phase creates jobs with runImmediately=false.
 */
import { randomBytes } from 'node:crypto';
const e=process.env;
if (e.GAFUS_STAGING_JOBS_CONFIRM!=='create-only-no-execution' ||
    !/^[a-f0-9-]{32,40}$/.test(e.CLOUDRU_PROJECT_ID??'') ||
    e.CLOUDRU_S3_ENDPOINT!=='https://s3.cloud.ru')throw Error('STAGING_JOBS_NOT_AUTHORIZED');
const pass=randomBytes(36).toString('base64url');
const auth=await fetch('https://iam.api.cloud.ru/api/v1/auth/token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keyId:e.CLOUDRU_KEY_ID,secret:e.CLOUDRU_KEY_SECRET})});
if(!auth.ok)throw Error('CLOUDRU_IAM_DENIED');
const token=(await auth.json()).access_token;
const base='https://containers.api.cloud.ru/v2/jobs';
const api=async (method,url,payload)=>{
 const r=await fetch(url,{method,headers:{authorization:`Bearer ${token}`,...(payload?{'content-type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(24000)});
 if(!r.ok){const detail=await r.json().catch(()=>({}));console.error('STAGING_JOB_API_ERROR',r.status,detail.code??'unknown',(detail.details??[]).map(x=>x.fieldViolations?.map(y=>y.field)).flat());throw Error('STAGING_JOB_CREATE_FAILED')}
 return r.json();
};
const existing=await api('GET',`${base}?projectId=${e.CLOUDRU_PROJECT_ID}&pageSize=100`);
const galleryEnv={GALLERY_BUCKET:'gafus-gallery-private',GALLERY_S3_ENDPOINT:'https://s3.cloud.ru',
 GALLERY_S3_ACCESS_KEY_ID:e.CLOUDRU_S3_ACCESS_KEY_ID,GALLERY_S3_SECRET_ACCESS_KEY:e.CLOUDRU_S3_SECRET_ACCESS_KEY,
 GALLERY_ENABLED:'false',GALLERY_INTERNAL_BASE_URL:'https://stage-core-not-configured.invalid',GALLERY_INTERNAL_HMAC_SECRET:pass};
const feedEnv={FEED_BUCKET:'gafus-feed-private',FEED_S3_ENDPOINT:'https://s3.cloud.ru',
 FEED_S3_ACCESS_KEY_ID:e.CLOUDRU_S3_ACCESS_KEY_ID,FEED_S3_SECRET_ACCESS_KEY:e.CLOUDRU_S3_SECRET_ACCESS_KEY,
 GALLERY_S3_ENDPOINT:'https://s3.cloud.ru',FEED_ALBUM_BUCKET:'gafus-gallery-private',
 GALLERY_S3_ACCESS_KEY_ID:e.CLOUDRU_S3_ACCESS_KEY_ID,GALLERY_S3_SECRET_ACCESS_KEY:e.CLOUDRU_S3_SECRET_ACCESS_KEY,
 FEED_INTERNAL_BASE_URL:'https://stage-core-not-configured.invalid',FEED_INTERNAL_HMAC_SECRET:pass,
 FEED_RUN_ONCE:'true'};
const rev='stg-20261012-05c5b67f';
const jobs=[
 ['gafus-gallery-process-staging','gallery-worker','0.5','1024Mi',120,3,galleryEnv],
 ['gafus-feed-photo-staging','feed-worker','0.5','1024Mi',240,3,{...feedEnv,FEED_WORKER_TYPE:'photo'}],
 ['gafus-feed-video-staging','feed-worker','1','4096Mi',650,3,{...feedEnv,FEED_WORKER_TYPE:'video'}],
];
for(const [name,image,cpu,memory,timeout,maxRetries,variables] of jobs){
 if((existing.data??[]).some(x=>x.name===name)){console.log(JSON.stringify({name,exists:true,started:false}));continue;}
 const body={projectId:e.CLOUDRU_PROJECT_ID,name,description:'STAGING ONLY, not executed until isolated core deployed',runImmediately:false,
 configuration:{privileged:false},
 template:{timeout,maxRetries,containers:[{name,image:`gafus.cr.cloud.ru/gafus-${image}:${rev}`,
 resources:{cpu,memory},env:Object.entries(variables).map(([name,value])=>({name,value}))}]}};
 const created=await api('POST',base,body);console.log(JSON.stringify({name,created:true,started:false,operationId:created.id??null}));
}
