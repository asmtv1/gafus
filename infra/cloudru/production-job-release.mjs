#!/usr/bin/env node
/** Idempotent reconciliation of the 11 existing production Cloud.ru Container Jobs.
 * No Docker builds, no Job creation, no task execution, no S3/CDN mutation.
 * Preflight/verify are read-only; sync is main-only AFTER the API is healthy.
 */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { CLOUDRU_PRODUCTION_JOBS, CLOUDRU_PROJECTS, imageRepository, resolveProjectBindings } from './production-job-inventory.mjs';
import { preflightJobs } from './production-job-release-core.mjs';
import { configuredImage, imagePlan } from './production-job-image-config.mjs';

const mode=process.argv[2]??'--plan';
if(!['--plan','--preflight','--sync','--cutover','--verify'].includes(mode))
  throw Error('INVALID_EXISTING_JOB_RELEASE_MODE');
const e=process.env;
const target=j=>configuredImage(j,e);
const requested=imagePlan(e);
if(mode==='--plan'){
  console.log(JSON.stringify({mode,mutates:false,buildsImages:false,provisionsJobs:false,
    targets:requested.map(({job:j,targetImage})=>({name:j.name,projectId:CLOUDRU_PROJECTS[j.project].projectId,
      targetImage:targetImage??'KEEP_EXISTING_PINNED_CHAT2_IMAGE'}))},null,2));
  process.exit(0);
}
if(e.GITHUB_REF!=='refs/heads/main'||!['push','workflow_dispatch'].includes(e.GITHUB_EVENT_NAME??'')||
   !/^[a-f0-9]{40}$/.test(e.RELEASE_SHA??'')||e.RELEASE_SHA!==e.GITHUB_SHA||
   e.CLOUDRU_PROD_DEPLOY_CONFIRM!=='preapproved-main-only-media-release')
   throw Error('PROD_CLOUDRU_JOB_RELEASE_GUARD');
const bindings=resolveProjectBindings(e);
if(['--cutover','--sync'].includes(mode) && e.CLOUDRU_NEW_BACKEND_DEPLOYED!=='true')throw Error('NEW_BACKEND_MUST_BE_DEPLOYED_BEFORE_JOBS');
// Fail before deploying the new Backend if the first-release Cloud.ru
// activation cannot authenticate or initialize its protected media routes.
for(const key of ['GALLERY_INTERNAL_HMAC_SECRET','FEED_INTERNAL_HMAC_SECRET',
  'QUESTIONS_V2_INTERNAL_HMAC_SECRET','CHAT2_INTERNAL_HMAC_SECRET']){
  if(typeof e[key]!=='string'||Buffer.byteLength(e[key],'utf8')<32)
    throw Error('CLOUDRU_RELEASE_SECRET_MISSING_'+key);
}
for(const key of ['QUESTIONS_V2_S3_ACCESS_KEY_ID','QUESTIONS_V2_S3_SECRET_ACCESS_KEY',
                  'CHAT2_S3_ACCESS_KEY_ID','CHAT2_S3_SECRET_ACCESS_KEY']){
  if(!e[key])throw Error('CLOUDRU_RELEASE_STORAGE_CREDENTIAL_MISSING_'+key);
}
const hmacRoles={'gallery-worker':'GALLERY_INTERNAL_HMAC_SECRET','feed-worker':'FEED_INTERNAL_HMAC_SECRET',
 'questions-photo':'QUESTIONS_V2_INTERNAL_HMAC_SECRET','chat-photo':'CHAT2_INTERNAL_HMAC_SECRET','chat-video':'CHAT2_INTERNAL_HMAC_SECRET'};
const tokens=new Map();
async function req(url,method='GET',body,token){
  const u=new URL(url);
  if(!['iam.api.cloud.ru','containers.api.cloud.ru'].includes(u.hostname)||u.protocol!=='https:')throw Error('CLOUDRU_UNEXPECTED_ENDPOINT');
  if((method==='POST'&&u.hostname!=='iam.api.cloud.ru')||!['GET','POST','PATCH'].includes(method)||
     (method==='PATCH'&&(!['--cutover','--sync'].includes(mode)||u.hostname!=='containers.api.cloud.ru')))
    throw Error('CLOUDRU_OPERATION_FORBIDDEN');
  const response=await fetch(url,{method,headers:{...(token?{authorization:`Bearer ${token}`}:{ }),
   ...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,
   signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`CLOUDRU_${method}_HTTP_${response.status}_${u.pathname}`);
  const t=await response.text();return t?JSON.parse(t):{};
}
for(const j of CLOUDRU_PRODUCTION_JOBS){
  const scope=j.project+':'+j.iamVersion;
  if(tokens.has(scope))continue;
  const auth=bindings[j.project];
  const result=await req(`https://iam.api.cloud.ru/api/${j.iamVersion}/auth/token`,'POST',{keyId:auth.keyId,secret:auth.keySecret});
  if(!result.access_token)throw Error('CLOUDRU_IAM_TOKEN_MISSING_'+scope);
  tokens.set(scope,result.access_token);
}
const api='https://containers.api.cloud.ru/v2/jobs';
const client={
  list:async(scope,id,v)=>{const r=await req(`${api}?projectId=${id}&pageSize=100`,'GET',null,tokens.get(scope+':'+v));return r.data??r.jobs;},
  get:async(scope,id,name,v)=>req(`${api}/${encodeURIComponent(name)}?projectId=${id}`,'GET',null,tokens.get(scope+':'+v)),
  patch:async(scope,id,name,v,payload)=>req(`${api}/${encodeURIComponent(name)}?projectId=${id}`,'PATCH',payload,tokens.get(scope+':'+v)),
};
const snapshots=await preflightJobs({...client,readOnly:true,allowChat2MissingRuntime:mode!=='--verify'});
// Current digest may differ from desired image: this is the drift to sync.
 // preflightJobs ensures pinned, correctly scoped images and exact Job identities.
const imageChanges=snapshots.filter(s=>target(s)!==null &&
  s.before.template.containers[0].image!==target(s)).map(s=>s.name);
const readEnv=(j,key)=>j.template.containers[0].env?.find(x=>x.name===key)?.value;
function changeEnv(job,key,value){
  const env=job.template.containers[0].env;
  if(!Array.isArray(env))throw Error('CLOUDRU_MISSING_ENV_ARRAY_'+job.name);
  const item=env.find(x=>x.name===key);
  if(!item){
    const chat2 = /^gafus-chat-(photo|video)(-2)?$/.test(job.name);
    const bootstrap = new Set(['CHAT2_S3_ACCESS_KEY_ID','CHAT2_S3_SECRET_ACCESS_KEY',
      'CHAT2_INTERNAL_BASE_URL','CHAT2_INTERNAL_HMAC_SECRET']);
    if(!chat2||!bootstrap.has(key))throw Error('CLOUDRU_UNEXPECTED_NEW_ENV_FIELD_'+job.name+'_'+key);
    env.push({name:key,value});return;
  }
  if(typeof item.value!=='string'||item.valueFrom||item.secretRef)throw Error('CLOUDRU_UNSAFE_ENV_FIELD_'+job.name+'_'+key);
  item.value=value;
}
export function desiredConfig(snapshot,vars){
  const j=structuredClone(snapshot.before),requestedImage=target(snapshot);
  if(requestedImage)j.template.containers[0].image=requestedImage;
  const hkey=hmacRoles[snapshot.imageRole], secret=vars[hkey];
  if(typeof secret!=='string'||Buffer.byteLength(secret,'utf8')<32)throw Error('CLOUDRU_HMAC_MISSING_'+hkey);
  changeEnv(j,hkey,secret);
  if(snapshot.imageRole==='chat-photo'||snapshot.imageRole==='chat-video'){
    changeEnv(j,'CHAT2_INTERNAL_BASE_URL','https://api.gafus.ru/');
    changeEnv(j,'CHAT2_S3_ACCESS_KEY_ID',vars.CHAT2_S3_ACCESS_KEY_ID);
    changeEnv(j,'CHAT2_S3_SECRET_ACCESS_KEY',vars.CHAT2_S3_SECRET_ACCESS_KEY);
  }
  if(snapshot.imageRole==='questions-photo'){
    for(const [k,v] of Object.entries({QUESTIONS_V2_JOB_ENABLED:'true',QUESTIONS_V2_MEDIA_ENABLED:'true',
      QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED:'true',QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED:'true',
      QUESTIONS_V2_INTERNAL_BASE_URL:'https://api.gafus.ru/',QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME:'api.gafus.ru'}))changeEnv(j,k,v);
  }
  return j;
}
function jobMatches(a,b){return JSON.stringify(a.configuration)===JSON.stringify(b.configuration)&&
 JSON.stringify(a.template)===JSON.stringify(b.template)&&a.description===b.description;}
function patchBody(j){return {name:j.name,projectId:j.projectId,description:j.description,runImmediately:false,
 configuration:j.configuration,template:j.template};}
const desired=snapshots.map(s=>({snapshot:s,job:desiredConfig(s,e)}));
if(mode==='--preflight'){
 console.log(JSON.stringify({stage:'preflight',checked:snapshots.length,
   mutates:false,desiredImageChanges:imageChanges,
   jobsRequiringConfigurationUpdate:desired.filter(({snapshot,job})=>
     !jobMatches(snapshot.before,job)).map(({snapshot})=>snapshot.name)}));
 process.exit(0);
}
if(mode==='--verify'){
 for(const {snapshot:s,job} of desired)
   if(!jobMatches(s.before,job))throw Error('CLOUDRU_NEW_JOB_NOT_ACTIVATED_'+s.name);
 for(const path of ['/internal/gallery/jobs/claim','/internal/questions/media/jobs/claim','/internal/chat2/media/jobs/claim']){
   const response=await fetch('https://api.gafus.ru'+path,{signal:AbortSignal.timeout(10000)});
   if(response.status!==405)throw Error('V2_BACKEND_NOT_ACTIVATED_'+path+'_'+response.status);
 }
 console.log(JSON.stringify({stage:'verify',verified:desired.map(x=>x.snapshot.name),newImagesOnly:true}));process.exit(0);
}
// Do not change production infrastructure until ALL credentials, scopes, backends,
// job identities, digests, configuration fields and snapshots are validated.
const health=await fetch('https://api.gafus.ru/ready',{signal:AbortSignal.timeout(10000)});
if(!health.ok)throw Error('NEW_PRODUCTION_BACKEND_NOT_HEALTHY');
for(const path of ['/internal/gallery/jobs/claim','/internal/questions/media/jobs/claim','/internal/chat2/media/jobs/claim']){
 const status=(await fetch('https://api.gafus.ru'+path,{signal:AbortSignal.timeout(10000)})).status;
 // GET must be rejected by mounted Hono route, not 404 (old Backend).
 if(![405,503].includes(status))throw Error('NEW_PRODUCTION_BACKEND_ROUTE_MISSING_'+path+'_'+status);
}
const pending=desired.filter(({snapshot:s,job})=>!jobMatches(s.before,job));
if(pending.length===0){
  console.log(JSON.stringify({stage:'sync',updated:[],verified:desired.length,
    imagesRebuilt:false,changed:false}));
  process.exit(0);
}
const file=process.env.RUNNER_TEMP??'/tmp';
const stamp=`${file}/gafus-cloudru-job-sync-${e.RELEASE_SHA}.json`;
mkdirSync(file,{recursive:true});
writeFileSync(stamp,JSON.stringify({projectIds:Object.values(CLOUDRU_PROJECTS).map(x=>x.projectId),
  snapshots:snapshots.map(s=>s.before),releaseSha:e.RELEASE_SHA}),{mode:0o600,flag:'wx'});
chmodSync(stamp,0o600);
console.log('CLOUDRU_ROLLBACK_SNAPSHOT_SAVED_RUNNER_ONLY');
const changed=[];
try{
 for(const {snapshot:s,job} of desired){
  const current=await client.get(s.project,s.projectId,s.name,s.iamVersion);
  if(!jobMatches(current,s.before))throw Error('CLOUDRU_CONCURRENT_EDIT_'+s.name);
  if(jobMatches(current,job))continue;
  // PATCH only existing job; runImmediately always false; preserve resources,
  // timeouts, concurrency, volumes, unrelated env and secret references.
  await client.patch(s.project,s.projectId,s.name,s.iamVersion,patchBody(job));
  changed.push({snapshot:s,job});
  let applied=false;
  for(let attempt=0;attempt<12;attempt++){
    const after=await client.get(s.project,s.projectId,s.name,s.iamVersion);
    if(after?.name!==s.name||after?.projectId!==s.projectId)throw Error('CLOUDRU_POSTPATCH_IDENTITY_'+s.name);
    if(jobMatches(after,job)&&after.status==='ready'){applied=true;break;}
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
  if(!applied)throw Error('CLOUDRU_POSTPATCH_VERIFICATION_'+s.name);
 }
 console.log(JSON.stringify({stage:'sync',updated:changed.map(x=>x.snapshot.name),verified:desired.length,imagesRebuilt:false}));
}catch(err){
 console.error('CLOUDRU_SYNC_FAILED_SAFE_ROLLBACK_ATTEMPT');
 for(const {snapshot:s,job} of changed.reverse()){
  try{const now=await client.get(s.project,s.projectId,s.name,s.iamVersion);
   if(jobMatches(now,job))await client.patch(s.project,s.projectId,s.name,s.iamVersion,patchBody(s.before));
  }catch{console.error('CLOUDRU_ROLLBACK_INCOMPLETE_'+s.name);}
 }
 throw err;
}
