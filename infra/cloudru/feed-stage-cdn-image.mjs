/**
 * Mutates synthetic-only FEED staging Container App. --activate grants the
 * existing gallery-dev test CDN's header for synthetic objects only; --restore
 * removes it and restores the exact previously observed staging image.
 */
import { readFile, writeFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'dotenv';
const e=process.env, action=process.argv[2];
if(!['--activate','--restore'].includes(action)||e.GAFUS_FEED_STAGE_CDN_CONFIRM!=='synthetic-only-with-restore')throw Error('NO_STAGING_CONFIRM');
const name='gafus-feed-origin-staging', backup=join(homedir(),'.codex/cloudru/feed-stage-cdn-image-rollback.json');
const auth=await fetch('https://iam.api.cloud.ru/api/v1/auth/token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keyId:e.CLOUDRU_KEY_ID,secret:e.CLOUDRU_KEY_SECRET})});
if(!auth.ok)throw Error('STAGE_IAM_DENIED');const token=(await auth.json()).access_token;
const get=`https://containers.api.cloud.ru/v1/containers/${name}?projectId=${e.CLOUDRU_PROJECT_ID}`;
const patch=`https://containers.api.cloud.ru/v2/containers/${name}?projectId=${e.CLOUDRU_PROJECT_ID}`;
const q=await fetch(get,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
if(!q.ok)throw Error('STAGE_RESOURCE_READ_DENIED');
const d=await q.json(), c=d.template?.containers?.[0];
if(d.name!==name||!c?.image?.includes('gafus-feed-origin-stageonly@sha256:')||
 c.env?.find(x=>x.name==='GAFUS_STAGING_ORIGIN_MODE')?.value!=='validation-only'||
 c.env?.find(x=>x.name==='FEED_BUCKET')?.value!=='gafus-feed-private')throw Error('NOT_SYNTHETIC_STAGE_ONLY');
if(action==='--activate'){
 const source=parse(await readFile('.env'));
 if((source.TF_VAR_origin_secret??'').length<32)throw Error('TEST_GALLERY_CDN_HEADER_SECRET_MISSING');
 if(c.env?.some(x=>x.name==='FEED_STAGING_GALLERY_SECRET'))throw Error('STAGE_ALIAS_ALREADY_PRESENT');
 await writeFile(backup,JSON.stringify({name,expectedImage:c.image,addedEnv:'FEED_STAGING_GALLERY_SECRET',savedAt:new Date().toISOString()}),{flag:'wx',mode:0o600});
 c.env=[...c.env,{name:'FEED_STAGING_GALLERY_SECRET',value:source.TF_VAR_origin_secret}];
 c.image='gafus.cr.cloud.ru/gafus-feed-origin-stageonly:stg-cdn-smoke-20261012-05c5b67f';
}else{
 const b=JSON.parse(await readFile(backup,'utf8'));
 if(b.name!==name||!b.expectedImage?.startsWith('gafus.cr.cloud.ru/gafus-feed-origin-stageonly@sha256:'))throw Error('UNTRUSTED_ROLLBACK_IMAGE');
 if(!c.image.startsWith('gafus.cr.cloud.ru/gafus-feed-origin-stageonly@sha256:'))throw Error('UNEXPECTED_IMAGE_TO_ROLLBACK');
 c.image=b.expectedImage;
 c.env=c.env.filter(x=>x.name!==b.addedEnv);
}
const out=await fetch(patch,{method:'PATCH',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(d),signal:AbortSignal.timeout(25000)});
if(!out.ok){console.log('STAGE_PATCH_STATUS',out.status);throw Error('STAGING_ONLY_PATCH_FAILED')}
console.log(JSON.stringify({name,action,operationId:(await out.json()).id??null,productionAffected:false}));
if(action==='--restore')await rm(backup,{force:true});
