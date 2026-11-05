import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import {
  CLOUDRU_PRODUCTION_JOBS, CLOUDRU_PROJECTS, CLOUDRU_JOB_IMAGES, CLOUDRU_JOB_RUNTIME,
  validateProductionInventory, resolveProjectBindings, imageRepository,
} from './production-job-inventory.mjs';
import { imageReferencesForSha, platformDigest, preflightJobs, applyJobs, rollbackJobs } from './production-job-release-core.mjs';

const sha='a'.repeat(40), digest='sha256:'+'b'.repeat(64);
const env=Object.fromEntries(Object.values(CLOUDRU_PROJECTS).flatMap(p=>[
  [p.projectIdEnv,p.projectId],[p.keyIdEnv,'test-id'],[p.keySecretEnv,'test-secret'],
]));
const images=imageReferencesForSha(sha,()=>digest);
function jobState(entry) {
 const contract=CLOUDRU_JOB_RUNTIME[entry.imageRole];
 const exact={...contract.exact,...(entry.imageRole==='feed-worker'
   ? {FEED_WORKER_TYPE:'video'} : {})};
 const env=[{name:'SECRET_REF',valueFrom:{secretKeyRef:'s'}},
   ...contract.required.map(name=>({name,value:'synthetic-test-value'})),
   ...Object.entries(exact).map(([name,value])=>({name,value}))];
 return {name:entry.name,projectId:CLOUDRU_PROJECTS[entry.project].projectId,
  status:'ready', runImmediately:false, configuration:{privileged:false,concurrency:{max:2}},
  template:{timeout:550,maxRetries:7,command:['node','job.js'],containers:[{
   name:entry.name,image:imageRepository(entry)+'@sha256:'+'c'.repeat(64),
   resources:{cpu:'2',memory:'8192Mi'},env,
  }]}};
}
function mock(states=new Map(CLOUDRU_PRODUCTION_JOBS.map(x=>[x.name,jobState(x)]))) {
 const calls=[];
 const list=async(scope)=>[...states.values()].filter(x=>x.projectId===CLOUDRU_PROJECTS[scope].projectId).map(x=>({name:x.name}));
 const get=async(_scope,_id,name)=>structuredClone(states.get(name));
 const patch=async(_scope,_id,name,payload)=>{
   calls.push({name,payload});
   const original=states.get(name);
   states.set(name,{...original,template:structuredClone(payload.template)});
 };
 return {states,calls,list,get,patch};
}
test('inventory exactly matches dispatcher names, projects, image roles, no phantom job',()=>{
 const dispatcher=readFileSync('packages/worker/src/cloudru-media-dispatcher.ts','utf8');
 const declared=new Set([...dispatcher.matchAll(/"(gafus-(?:feed-video|chat-video)(?:-2)?)"/g)].map(x=>x[1]));
 assert.deepEqual(new Set(CLOUDRU_PRODUCTION_JOBS.map(x=>x.name)),declared);
 assert.equal(CLOUDRU_PRODUCTION_JOBS.length,4);
 assert.equal(new Set(CLOUDRU_PRODUCTION_JOBS.map(x=>x.name)).size,4);
 assert.equal(new Set(CLOUDRU_PRODUCTION_JOBS.map(x=>x.imageRole)).size,2);
 assert.equal(Object.keys(CLOUDRU_JOB_IMAGES).length,2);
 assert(!declared.has('gafus-questions-photo-2'));
 assert(CLOUDRU_PRODUCTION_JOBS.filter(x=>x.name.startsWith('gafus-chat-')).every(x=>x.iamVersion==='v2'));
 assert.deepEqual(Object.keys(resolveProjectBindings(env)).sort(),['chat2','primary']);
 assert.throws(()=>validateProductionInventory([...CLOUDRU_PRODUCTION_JOBS,CLOUDRU_PRODUCTION_JOBS[0]]),/DUPLICATE/);
 for(const name of ['gafus-questions-photo','gafus-chat-photo','gafus-feed-photo','gafus-feed-photo-2'])
  assert.throws(()=>validateProductionInventory([...CLOUDRU_PRODUCTION_JOBS,
    {name,project:'primary',imageRole:'feed-worker',iamVersion:'v1'}]),/RETIRED_CLOUDRU_PHOTO_JOB/);
});
test('scoped project IDs and credentials are mandatory',()=>{
 assert.throws(()=>resolveProjectBindings({...env,CHAT2_CLOUDRU_PROJECT_ID:env.CLOUDRU_PROJECT_ID}),/PROJECT_MISMATCH_CHAT2/);
 assert.throws(()=>resolveProjectBindings({...env,CHAT2_CLOUDRU_KEY_SECRET:''}),/CREDENTIALS_MISSING_chat2/);
 assert.equal(imageRepository(CLOUDRU_PRODUCTION_JOBS.find(x=>x.name==='gafus-chat-video')),'gafus-chat2-20261028.cr.cloud.ru/gafus-chat-video');
});
test('tags resolve only to valid linux/amd64 immutable manifest digests',()=>{
 assert.equal(platformDigest([{Descriptor:{digest,platform:{os:'linux',architecture:'amd64'}}}]),digest);
 assert.throws(()=>platformDigest([{Descriptor:{digest,platform:{os:'linux',architecture:'arm64'}}}]),/AMBIGUOUS/);
 assert.throws(()=>platformDigest([{Descriptor:{digest,platform:{os:'linux',architecture:'amd64'}}},{Descriptor:{digest,platform:{os:'linux',architecture:'amd64'}}}]),/AMBIGUOUS/);
 assert.throws(()=>imageReferencesForSha('latest',()=>digest),/INVALID/);
 assert.throws(()=>imageReferencesForSha(sha,()=> 'not-a-digest'),/DIGEST/);
 assert(Object.values(images).every(x=>x.endsWith('@'+digest)));
});
test('all four video jobs preflight BEFORE any patches; preserves full existing settings',async()=>{
 const m=mock();
 const snapshots=await preflightJobs({...m,images});
 assert.equal(snapshots.length,4);
 assert.deepEqual(new Set(snapshots.map(x=>x.projectId)),new Set(Object.values(CLOUDRU_PROJECTS).map(x=>x.projectId)));
 const originals=new Map([...m.states].map(([name,job])=>[name,structuredClone(job)]));
 const updated=await applyJobs(snapshots,m);
 assert.equal(updated.length,4);
 assert.equal(m.calls.length,4);
 assert(m.calls.every(x=>x.payload.runImmediately===false));
 for(const [name,job] of m.states) {
  const old=originals.get(name), expected=CLOUDRU_PRODUCTION_JOBS.find(x=>x.name===name);
  assert.equal(job.template.containers[0].image,images[expected.imageRole]);
  const template=structuredClone(job.template), prior=structuredClone(old.template);
  delete template.containers[0].image; delete prior.containers[0].image;
  assert.deepEqual(template,prior);
  assert.deepEqual(job.configuration,old.configuration);
  assert.equal(job.runImmediately,old.runImmediately);
 }
 assert.equal((await applyJobs(await preflightJobs({...m,images}),m)).length,0,'idempotent release');
});
test('missing, duplicate, wrong-project, wrong-role and drift always fail closed',async()=>{
 for(const scenario of ['missing','duplicate','project','image','tag','autorun','runtime']) {
  const m=mock(); const target='gafus-chat-video-2';
  if(scenario==='missing')m.states.delete(target);
  if(scenario==='project')m.states.get(target).projectId=CLOUDRU_PROJECTS.primary.projectId;
  if(scenario==='image')m.states.get(target).template.containers[0].image='gafus.cr.cloud.ru/wrong@'+digest;
  if(scenario==='tag')m.states.get(target).template.containers[0].image=imageRepository(CLOUDRU_PRODUCTION_JOBS.find(x=>x.name===target))+':mutable';
  if(scenario==='autorun')m.states.get(target).runImmediately=true;
  if(scenario==='runtime')m.states.get(target).template.containers[0].env.find(x=>x.name==='CHAT2_JOB_KIND').value='invalid';
  if(scenario==='duplicate') {
   const originalList=m.list;
   m.list=async(...args)=>[...await originalList(...args),{name:target}];
  }
  await assert.rejects(preflightJobs({...m,images}),/MISSING|DUPLICATE|PROJECT|ROLE|DIGEST|AUTORUN|RUNTIME_ENV/);
  assert.equal(m.calls.length,0);
 }
 const m=mock(), snapshots=await preflightJobs({...m,images});
 m.states.get(snapshots[0].name).template.timeout=1;
 await assert.rejects(applyJobs(snapshots,m),/CHANGED_SINCE_PREFLIGHT/);
 assert.equal(m.calls.length,0);
});
test('offline four-video-job plan and unauthorized apply never reach Cloud.ru',()=>{
 const run=(mode)=>spawnSync(process.execPath,['infra/cloudru/production-job-release.mjs',mode],{
  encoding:'utf8',env:{...process.env,GITHUB_REF:'refs/heads/develop',GITHUB_EVENT_NAME:'push',CLOUDRU_PROD_DEPLOY_CONFIRM:''},timeout:8000});
 const plan=run('--plan');assert.equal(plan.status,0,plan.stderr);
 const parsed=JSON.parse(plan.stdout);assert.equal(parsed.targets.length,4);assert.equal(parsed.mutates,false);
 assert.equal(parsed.targets.filter(x=>x.targetImage.includes('7f8d4325')).length,0);
 assert.equal(parsed.targets.filter(x=>x.targetImage.includes('652b3ce4')).length,0);
 const feed=parsed.targets.filter(x=>/^gafus-feed-video(-2)?$/.test(x.name));
 assert.equal(feed.length,2,'one shared Feed image must cover only the video Jobs');
 const pinned='gafus.cr.cloud.ru/gafus-feed-worker@sha256:cbf25f7f60e8f33ff261c6eeeab39f3f89412fc561340cc7f10ad903b5e16a02';
 assert(feed.every(x=>x.targetImage===pinned),'CI must use exactly the deployed, immutable Feed digest');

 const blocked=run('--apply');assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/INVALID_EXISTING_JOB_RELEASE_MODE/);
});
test('automatic main CI reconciles four active video Jobs; manual control also available',()=>{
 const ci=readFileSync('.github/workflows/ci-cd.yml','utf8');
 const manual=readFileSync('.github/workflows/deploy-only.yml','utf8');
 const infra=readFileSync('.github/workflows/infrastructure-jobs.yml','utf8');
 const shared=readFileSync('.github/workflows/production-job-release-reusable.yml','utf8');
 assert(ci.includes('production-job-release-reusable.yml'));
 assert(ci.includes('cloudru-jobs-preflight:'));
 assert(ci.includes('cloudru-jobs-sync:'));
 assert(ci.includes('cloudru-jobs-verify:'));
 assert(ci.includes('mode: sync'));
 assert(!manual.includes('production-job-release-reusable.yml'));
 assert(infra.includes('UPDATE_4_ACTIVE_VIDEO_JOBS'));
 assert(infra.includes('production-job-release-reusable.yml'));
 assert(infra.includes('mode: sync'));
 assert(infra.includes('mode: verify'));
 assert(shared.includes('production-job-release.mjs "--$PHASE"'));
 assert(shared.includes('preflight|sync|cutover|verify'));
 const script=readFileSync('infra/cloudru/production-job-release.mjs','utf8');
 assert(script.includes('NEW_BACKEND_MUST_BE_DEPLOYED_BEFORE_JOBS'));
 assert(script.includes('CLOUDRU_ROLLBACK_SNAPSHOT_SAVED_RUNNER_ONLY'));
 assert(!script.includes('docker build'));
});

test('read-only preflight rejects unsafe temporary backends and non-ready Jobs',async()=>{
 const m=mock();
 const target='gafus-chat-video';
 const list=m.states.get(target).template.containers[0].env;
 list.push({name:'CHAT2_INTERNAL_BASE_URL',value:'https://stale.trycloudflare.com'});
 await assert.rejects(preflightJobs({...m}),/CLOUDRU_JOB_TEMPORARY_BACKEND/);
 assert.equal(m.calls.length,0);
 list.pop();
 m.states.get(target).status='not_ready';
 await assert.rejects(preflightJobs({...m}),/CLOUDRU_JOB_NOT_READY/);
 const n=mock(),snapshots=await preflightJobs({...n});
 assert.equal(snapshots.length,4);
 assert(snapshots.every(s=>s.before.template.containers[0].image===s.targetImage));
 assert.equal(n.calls.length,0);
 for(const job of n.states.values())delete job.runImmediately;
 assert.equal((await preflightJobs({...n,readOnly:true})).length,4);
 await assert.rejects(preflightJobs({...n,images}),/AUTORUN_UNSAFE/);
});

test('retired photo Jobs cannot enter even a read-only release plan',async()=>{
 for(const name of ['gafus-questions-photo','gafus-chat-photo','gafus-feed-photo','gafus-gallery-process','gafus-gallery-process-2']){
   assert.throws(()=>validateProductionInventory([...CLOUDRU_PRODUCTION_JOBS,
     {name,project:'primary',imageRole:'feed-worker',iamVersion:'v1'}]),/RETIRED_CLOUDRU_PHOTO_JOB/);
 }
});

test('first main accepts only the four missing Chat2 bootstrap fields before cutover',async()=>{
 const m=mock();
 const names=['gafus-chat-video','gafus-chat-video-2'];
 const allow=new Set(['CHAT2_S3_ACCESS_KEY_ID','CHAT2_S3_SECRET_ACCESS_KEY',
   'CHAT2_INTERNAL_BASE_URL','CHAT2_INTERNAL_HMAC_SECRET']);
 for(const name of names){
  const c=m.states.get(name).template.containers[0];
  c.env=c.env.filter(e=>!allow.has(e.name));
 }
 await assert.rejects(preflightJobs({...m,readOnly:true}),/CLOUDRU_JOB_RUNTIME_ENV_MISSING_gafus-chat-video_CHAT2/);
 const snapshots=await preflightJobs({...m,readOnly:true,allowChat2MissingRuntime:true});
 assert.equal(snapshots.length,4);
 assert.equal(m.calls.length,0);
 const tampered=mock();
 const c=tampered.states.get('gafus-chat-video').template.containers[0];
 c.env=c.env.filter(e=>e.name!=='CHAT2_JOB_WORK_ROOT');
 await assert.rejects(preflightJobs({...tampered,readOnly:true,allowChat2MissingRuntime:true}),/CLOUDRU_JOB_RUNTIME_ENV_MISSING/);
});

test('dormant Chat2 Jobs are accepted only by bootstrap, then explicitly activated',async()=>{
 const m=mock();
 const names=['gafus-chat-video','gafus-chat-video-2'];
 for(const name of names){
  const env=m.states.get(name).template.containers[0].env;
  env.find(e=>e.name==='CHAT2_JOB_ENABLED').value='false';
 }
 await assert.rejects(preflightJobs({...m,readOnly:true}),/CLOUDRU_JOB_RUNTIME_ENV_MISMATCH_gafus-chat-video_CHAT2_JOB_ENABLED/);
 assert.equal((await preflightJobs({...m,readOnly:true,allowChat2MissingRuntime:true})).length,4);
 await assert.rejects(preflightJobs({...m,images}),/CLOUDRU_JOB_RUNTIME_ENV_MISMATCH_gafus-chat-video_CHAT2_JOB_ENABLED/);
 assert.equal(m.calls.length,0,'bootstrap must never PATCH production Jobs');
 const source=readFileSync('infra/cloudru/production-job-release.mjs','utf8');
 assert(source.includes("changeEnv(j,'CHAT2_JOB_ENABLED','true')"),
   'sync must activate dormant Chat2 Jobs after Backend deployment');
});

test('partial publish error restores previous immutable digest without touching settings',async()=>{
 const m=mock();
 const snapshots=await preflightJobs({...m,images});
 const originalImages=new Map([...m.states].map(([name,j])=>[name,j.template.containers[0].image]));
 let patches=0;
 const patch=async(...args)=>{
  if (++patches===3) throw Error('SYNTHETIC_CLOUDRU_PARTIAL_FAILURE');
  return m.patch(...args);
 };
 await assert.rejects(applyJobs(snapshots,{...m,patch}),/SYNTHETIC_CLOUDRU_PARTIAL_FAILURE/);
 await rollbackJobs(snapshots,m);
 for(const [name,j] of m.states) assert.equal(j.template.containers[0].image,originalImages.get(name));
 assert.equal(m.calls.length,4); // two updates, two image-only rollbacks
});
