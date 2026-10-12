/**
 * Connects ONLY the allowlisted Cloud.ru staging jobs to ephemeral isolated
 * GAFUS Core. Never changes production URLs or runs a job in --connect.
 */
import { readFile,writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const e=process.env;
const scope={
 'gafus-gallery-process-staging':{key:'GALLERY',type:'gallery'},
 'gafus-feed-photo-staging':{key:'FEED',type:'feed'},
 'gafus-feed-video-staging':{key:'FEED',type:'feed'},
};
const action=process.argv[2]??'--inspect';
if(!['--inspect','--connect','--execute','--disconnect'].includes(action))throw Error('UNEXPECTED_ACTION');
if(action!=='--inspect'&&e.GAFUS_STAGE_JOBS_CONFIRM!=='isolated-test-only')throw Error('STAGE_JOBS_UNAUTHORIZED');
const url='https://acosmistic-brantley-preoccupiedly.ngrok-free.dev';
if(new URL(url).hostname.endsWith('.gafus.ru'))throw Error('PRODUCTION_CORE_URL_DENIED');
const text=await readFile(join(homedir(),'.codex/cloudru/gafus-media-core-staging/core.env'),'utf8');
const envs=Object.fromEntries(text.split('\n').filter(x=>x.includes('=')).map(x=>x.split('=',2)));
const a=await fetch('https://iam.api.cloud.ru/api/v1/auth/token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keyId:e.CLOUDRU_KEY_ID,secret:e.CLOUDRU_KEY_SECRET})});if(!a.ok)throw Error('IAM_AUTH_DENIED');
const token=(await a.json()).access_token;const api=async(method,path,data)=>{
 const r=await fetch('https://containers.api.cloud.ru'+path,{method,headers:{authorization:'Bearer '+token,...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(30000)});
 if(!r.ok){const fault=await r.json().catch(()=>({}));console.log('CLOUD_STAGE_JOB_HTTP',r.status,fault.code??null);throw Error('CLOUD_STAGE_JOB_API_FAILED')}
 return r.json();
};
if(action==='--connect'){
 const health=await fetch(url+'/stage-health',{signal:AbortSignal.timeout(10000)});
 if(health.status!==200||(await health.json()).environment!=='isolated-staging')throw Error('UNVERIFIED_ISOLATED_CORE');
}
for(const [name,meta] of Object.entries(scope)){
 const path=`/v2/jobs/${name}?projectId=${e.CLOUDRU_PROJECT_ID}`;
 const old=await api('GET',path);
 if(old.name!==name||old.projectId!==e.CLOUDRU_PROJECT_ID||!old.template?.containers?.[0]?.image?.includes('gafus-')||
  !old.template.containers[0].image.includes('worker@sha256:'))
   throw Error('UNEXPECTED_STAGING_JOB_RESOURCE');
 const env=old.template.containers[0].env??[];
 const key=meta.key+'_INTERNAL_BASE_URL',secretKey=meta.key+'_INTERNAL_HMAC_SECRET';
 const oldUrl=env.find(v=>v.name===key)?.value;
 if(action==='--disconnect'){
  if(![url,'https://stage-core-not-configured.invalid'].includes(oldUrl))throw Error('UNEXPECTED_STAGING_CORE_URL');
  old.template.containers[0].env=env.map(v=>v.name===key?{...v,value:'https://stage-core-not-configured.invalid'}:v);
  const op=await api('PATCH',path,old);
  console.log(JSON.stringify({name,isolatedCoreDisconnected:true,operationId:op.id??null}));
 }else if(action==='--connect'){
  if(![url,'https://stage-core-not-configured.invalid'].includes(oldUrl))throw Error('UNEXPECTED_EXISTING_CORE_URL');
  old.template.containers[0].env=env.map(v=>v.name===key?{...v,value:url}:
   v.name===secretKey?{...v,value:envs[secretKey]}:v);
  // Gallery originally disabled, remains so: image processing must only be enabled
  // after registered synthetic staging uploads are present in isolated database.
  const op=await api('PATCH',path,old);
  console.log(JSON.stringify({name,connected:true,operationId:op.id??null,environment:'isolated',executed:false}));
 }else if(action==='--execute'){
  if(oldUrl!==url||old.template.containers[0].env.find(v=>v.name===secretKey)?.value!==envs[secretKey])
   throw Error('UNVERIFIED_JOB_CONNECTION');
  const result=await api('POST',`/v2/jobs/${name}:execute`,{projectId:e.CLOUDRU_PROJECT_ID,jobName:name,params:{}});
  console.log(JSON.stringify({name,executed:true,executionId:result.id??result.executionId??null,status:result.status??null}));
 }else {
  console.log(JSON.stringify({name,connected:oldUrl===url,isolated:oldUrl!== 'https://api.gafus.ru',
  ready:old.status,executionAllowed:oldUrl===url}));
 }
}
