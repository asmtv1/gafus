import{readFile,writeFile,unlink}from'node:fs/promises';import{homedir}from'node:os';import{join}from'node:path';
const e=process.env,act=process.argv[2],name='gafus-feed-origin-staging';
if(!['activate','restore'].includes(act)||e.GAFUS_FEED_STAGE_CONFIRM!=='synthetic-only-restore')throw Error('UNCONFIRMED');
const saved=join(homedir(),'.codex/cloudru/feed-real-cdn-secret-backup.json');
const secret=JSON.parse(await readFile('infra/feed/.secrets/runtime.json','utf8')).origin_secret;
if(!secret||secret.length<32)throw Error('NO_FEED_SECRET');
const auth=await fetch('https://iam.api.cloud.ru/api/v1/auth/token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keyId:e.CLOUDRU_KEY_ID,secret:e.CLOUDRU_KEY_SECRET})});if(!auth.ok)throw Error('IAM_FAILED');
const token=(await auth.json()).access_token,base=`https://containers.api.cloud.ru/v1/containers/${name}?projectId=${e.CLOUDRU_PROJECT_ID}`,patch=`https://containers.api.cloud.ru/v2/containers/${name}?projectId=${e.CLOUDRU_PROJECT_ID}`;
const q=await fetch(base,{headers:{authorization:`Bearer ${token}`}});if(!q.ok)throw Error('STAGE_READ_DENIED');
const d=await q.json(),c=d.template?.containers?.[0];
if(d.name!==name||!c?.image?.startsWith('gafus.cr.cloud.ru/gafus-feed-origin-stageonly@sha256:')||c.env?.find(x=>x.name==='GAFUS_STAGING_ORIGIN_MODE')?.value!=='validation-only'||c.env?.find(x=>x.name==='FEED_BUCKET')?.value!=='gafus-feed-private'||c.env?.some(x=>x.name==='FEED_STAGING_GALLERY_SECRET'))throw Error('NOT_EXCLUSIVE_STAGE_ONLY');
const v=c.env.find(x=>x.name==='FEED_ORIGIN_SECRET');if(!v||v.value?.length<32)throw Error('STAGE_SECRET_MISSING');
if(act==='activate'){
 if(v.value===secret)throw Error('STAGE_ALREADY_ACTIVE');
 await writeFile(saved,JSON.stringify({name,image:c.image,old:v.value}),{flag:'wx',mode:0o600});
 v.value=secret;
 // Previously verified *synthetic-only* test image with a protected /metrics route.
 c.image='gafus.cr.cloud.ru/gafus-feed-origin-stageonly:stg-cdn-smoke-20261012-05c5b67f';
}else{
 const b=JSON.parse(await readFile(saved,'utf8'));
 if(b.name!==name||!b.image?.startsWith('gafus.cr.cloud.ru/gafus-feed-origin-stageonly@sha256:')||
   b.image===c.image||v.value!==secret||!b.old)throw Error('STAGE_NOT_EXPECTED');
 v.value=b.old;c.image=b.image;
}
let r;for(let n=0;n<5;n++){
 r=await fetch(patch,{method:'PATCH',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(d),signal:AbortSignal.timeout(20000)});
 if(r.ok)break;
 if(![409,429,500,503].includes(r.status))break;
 await new Promise(done=>setTimeout(done,1500*(n+1)));
}
if(!r?.ok)throw Error('STAGE_PATCH_FAILED_HTTP_'+r?.status);
console.log(JSON.stringify({action:act,onlySynthetic:true,stageName:name,operationId:(await r.json()).id??null}));if(act==='restore')await unlink(saved);
