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
   ? {FEED_WORKER_TYPE:entry.name.includes('-video')?'video':'photo'} : {})};
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
 const declared=new Set([...dispatcher.matchAll(/"(gafus-(?:gallery-process|feed-photo|feed-video|questions-photo|chat-photo|chat-video)(?:-2)?)"/g)].map(x=>x[1]));
 assert.deepEqual(new Set(CLOUDRU_PRODUCTION_JOBS.map(x=>x.name)),declared);
 assert.equal(CLOUDRU_PRODUCTION_JOBS.length,11);
 assert.equal(new Set(CLOUDRU_PRODUCTION_JOBS.map(x=>x.name)).size,11);
 assert.equal(new Set(CLOUDRU_PRODUCTION_JOBS.map(x=>x.imageRole)).size,5);
 assert.equal(Object.keys(CLOUDRU_JOB_IMAGES).length,5);
 assert(!declared.has('gafus-questions-photo-2'));
 assert.equal(CLOUDRU_PRODUCTION_JOBS.find(x=>x.name==='gafus-questions-photo').iamVersion,'v2');
 assert(CLOUDRU_PRODUCTION_JOBS.filter(x=>x.name.startsWith('gafus-chat-')).every(x=>x.iamVersion==='v2'));
 assert.deepEqual(Object.keys(resolveProjectBindings(env)).sort(),['chat2','primary']);
 assert.throws(()=>validateProductionInventory([...CLOUDRU_PRODUCTION_JOBS,CLOUDRU_PRODUCTION_JOBS[0]]),/DUPLICATE/);
 assert.throws(()=>validateProductionInventory([{name:'gafus-questions-photo-2',project:'primary',imageRole:'questions-photo',iamVersion:'v2'}]),/PHANTOM/);
});
test('scoped project IDs and credentials are mandatory',()=>{
 assert.throws(()=>resolveProjectBindings({...env,CHAT2_CLOUDRU_PROJECT_ID:env.CLOUDRU_PROJECT_ID}),/PROJECT_MISMATCH_CHAT2/);
 assert.throws(()=>resolveProjectBindings({...env,CHAT2_CLOUDRU_KEY_SECRET:''}),/CREDENTIALS_MISSING_chat2/);
 assert.equal(imageRepository(CLOUDRU_PRODUCTION_JOBS[7]),'gafus-chat2-20261028.cr.cloud.ru/gafus-chat-photo');
 assert.equal(imageRepository(CLOUDRU_PRODUCTION_JOBS[6]),'gafus.cr.cloud.ru/gafus-questions-worker');
});
test('tags resolve only to valid linux/amd64 immutable manifest digests',()=>{
 assert.equal(platformDigest([{Descriptor:{digest,platform:{os:'linux',architecture:'amd64'}}}]),digest);
 assert.throws(()=>platformDigest([{Descriptor:{digest,platform:{os:'linux',architecture:'arm64'}}}]),/AMBIGUOUS/);
 assert.throws(()=>platformDigest([{Descriptor:{digest,platform:{os:'linux',architecture:'amd64'}}},{Descriptor:{digest,platform:{os:'linux',architecture:'amd64'}}}]),/AMBIGUOUS/);
 assert.throws(()=>imageReferencesForSha('latest',()=>digest),/INVALID/);
 assert.throws(()=>imageReferencesForSha(sha,()=> 'not-a-digest'),/DIGEST/);
 assert(Object.values(images).every(x=>x.endsWith('@'+digest)));
});
test('all eleven live jobs preflight BEFORE any patches; preserves full existing settings',async()=>{
 const m=mock();
 const snapshots=await preflightJobs({...m,images});
 assert.equal(snapshots.length,11);
 assert.deepEqual(new Set(snapshots.map(x=>x.projectId)),new Set(Object.values(CLOUDRU_PROJECTS).map(x=>x.projectId)));
 const originals=new Map([...m.states].map(([name,job])=>[name,structuredClone(job)]));
 const updated=await applyJobs(snapshots,m);
 assert.equal(updated.length,11);
 assert.equal(m.calls.length,11);
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
  const m=mock(); const target=CLOUDRU_PRODUCTION_JOBS[9].name;
  if(scenario==='missing')m.states.delete(target);
  if(scenario==='project')m.states.get(target).projectId=CLOUDRU_PROJECTS.primary.projectId;
  if(scenario==='image')m.states.get(target).template.containers[0].image='gafus.cr.cloud.ru/wrong@'+digest;
  if(scenario==='tag')m.states.get(target).template.containers[0].image=imageRepository(CLOUDRU_PRODUCTION_JOBS[9])+':mutable';
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
test('dry-run is offline and unauthorized apply cannot access Cloud.ru',()=>{
 const run=(mode)=>spawnSync(process.execPath,['infra/cloudru/production-job-release.mjs',mode],{
  encoding:'utf8',env:{...process.env,GITHUB_REF:'refs/heads/develop',GITHUB_EVENT_NAME:'push',CLOUDRU_PROD_DEPLOY_CONFIRM:''},timeout:8000});
 const plan=run('--plan');assert.equal(plan.status,0,plan.stderr);
 const parsed=JSON.parse(plan.stdout);assert.equal(parsed.targets.length,11);assert.equal(parsed.mutates,false);
 assert.equal(parsed.targets.filter(x=>x.targetImage.includes('7f8d4325')).length,2);
 assert.equal(parsed.targets.filter(x=>x.targetImage.includes('652b3ce4')).length,0);
 const feed=parsed.targets.filter(x=>/^gafus-feed-(photo|video)(-2)?$/.test(x.name));
 assert.equal(feed.length,4,'one shared Feed image must cover the four existing Jobs');
 const pinned='gafus.cr.cloud.ru/gafus-feed-worker@sha256:0fdca7bea758c2469d639f3f9b3e3a78dfa71bcb787ab4218426e407027f9176';
 assert(feed.every(x=>x.targetImage===pinned),'CI must use exactly the deployed, immutable Feed digest');

 const blocked=run('--apply');assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/INVALID_EXISTING_JOB_RELEASE_MODE/);
});
test('CI and Deploy Only switch all new media Jobs after first Backend deploy',()=>{
 const ci=readFileSync('.github/workflows/ci-cd.yml','utf8');
 const manual=readFileSync('.github/workflows/deploy-only.yml','utf8');
 const shared=readFileSync('.github/workflows/production-job-release-reusable.yml','utf8');
 for(const f of [ci,manual])assert(f.includes('production-job-release-reusable.yml'));
 assert(ci.includes('needs: [security, build-apps, build-images, cloudru-jobs-preflight]'));
 assert(manual.includes('needs: [validate-release, cloudru-jobs-preflight]'));
 assert(shared.includes('production-job-release.mjs "--$PHASE"'));
 assert(shared.includes('preflight|cutover|verify'));
 assert(ci.indexOf('  deploy-production:')<ci.indexOf('  cloudru-jobs-cutover:'));
 assert(ci.indexOf('  cloudru-jobs-cutover:')<ci.indexOf('  cloudru-media-activate:'));
 assert(ci.indexOf('  cloudru-media-activate:')<ci.indexOf('  cloudru-jobs-verify:'));
 assert(manual.indexOf('  deploy:')<manual.indexOf('  cloudru-jobs-cutover:'));
 assert(manual.indexOf('  cloudru-jobs-cutover:')<manual.indexOf('  cloudru-media-activate:'));
 for(const f of [ci,manual,shared]) {
  assert(!/cloudru-build-media-images:|cloudru-jobs-update:|cloudru-prepare-media:/.test(f));
  assert(!/publish-cloudru-image\.sh|gafus\.cr\.cloud\.ru\/gafus-/.test(f));
 }
 const script=readFileSync('infra/cloudru/production-job-release.mjs','utf8');
 assert(script.includes('NEW_BACKEND_MUST_BE_DEPLOYED_BEFORE_JOBS'));
 assert(script.includes('CLOUDRU_ROLLBACK_SNAPSHOT_SAVED_RUNNER_ONLY'));
 assert(!script.includes('docker build'));
 const originRelease=readFileSync('infra/cloudru/production-media-release.mjs','utf8');
 assert(originRelease.includes('const resources = [...base.services];'));
 assert(!originRelease.includes('items: base.jobs'));
});
test('read-only verification rejects temporary backends and non-ready Jobs',async()=>{
 const m=mock();
 const target='gafus-questions-photo';
 m.states.get(target).template.containers[0].env.push({name:'QUESTIONS_V2_INTERNAL_BASE_URL',value:'https://stale.trycloudflare.com'});
 await assert.rejects(preflightJobs({...m}),/CLOUDRU_JOB_TEMPORARY_BACKEND/);
 assert.equal(m.calls.length,0);
 m.states.get(target).template.containers[0].env.pop();
 m.states.get(target).status='not_ready';
 await assert.rejects(preflightJobs({...m}),/CLOUDRU_JOB_NOT_READY/);
 assert.equal(m.calls.length,0);
 const n=mock();const snapshot=await preflightJobs({...n});
 assert.equal(snapshot.length,11);
 assert(snapshot.every(s=>s.before.template.containers[0].image===s.targetImage));
 assert.equal(n.calls.length,0);
 for(const job of n.states.values()) delete job.runImmediately;
 assert.equal((await preflightJobs({...n,readOnly:true})).length,11,'Cloud.ru GET omits runImmediately');
 await assert.rejects(preflightJobs({...n,images}),/AUTORUN_UNSAFE/,'mutation path stays stricter');
});

test('two-phase release accepts deliberately dormant Questions only in read-only mode',async()=>{
 const m=mock();
 const job=m.states.get('gafus-questions-photo');
 const env=job.template.containers[0].env;
 const set=(name,value)=>{const e=env.find(x=>x.name===name);if(e)e.value=value;else env.push({name,value});};
 set('QUESTIONS_V2_JOB_ENABLED','false');
 set('QUESTIONS_V2_INTERNAL_BASE_URL','https://api.gafus.ru/');
 set('QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME','api.gafus.ru');
 set('QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED','false');
 assert.equal((await preflightJobs({...m,readOnly:true})).length,11);
 assert.equal(m.calls.length,0);
 await assert.rejects(preflightJobs({...m,images}),/CLOUDRU_JOB_RUNTIME_ENV_MISMATCH/);
 set('QUESTIONS_V2_INTERNAL_BASE_URL','https://expired.trycloudflare.com/');
 await assert.rejects(preflightJobs({...m,readOnly:true}),/CLOUDRU_QUESTIONS_DORMANT_BACKEND_HOST_MISMATCH/);
 set('QUESTIONS_V2_INTERNAL_BASE_URL','https://api.gafus.ru/');
 set('QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED','true');
 await assert.rejects(preflightJobs({...m,readOnly:true}),/CLOUDRU_QUESTIONS_DORMANT_VERIFICATION_MUST_BE_FALSE/);
 assert.equal(m.calls.length,0);
});

test('first main accepts only the four missing Chat2 bootstrap fields before cutover',async()=>{
 const m=mock();
 const names=['gafus-chat-photo','gafus-chat-photo-2','gafus-chat-video','gafus-chat-video-2'];
 const allow=new Set(['CHAT2_S3_ACCESS_KEY_ID','CHAT2_S3_SECRET_ACCESS_KEY',
   'CHAT2_INTERNAL_BASE_URL','CHAT2_INTERNAL_HMAC_SECRET']);
 for(const name of names){
  const c=m.states.get(name).template.containers[0];
  c.env=c.env.filter(e=>!allow.has(e.name));
 }
 await assert.rejects(preflightJobs({...m,readOnly:true}),/CLOUDRU_JOB_RUNTIME_ENV_MISSING_gafus-chat-photo_CHAT2/);
 const snapshots=await preflightJobs({...m,readOnly:true,allowChat2MissingRuntime:true});
 assert.equal(snapshots.length,11);
 assert.equal(m.calls.length,0);
 const tampered=mock();
 const c=tampered.states.get('gafus-chat-photo').template.containers[0];
 c.env=c.env.filter(e=>e.name!=='CHAT2_JOB_WORK_ROOT');
 await assert.rejects(preflightJobs({...tampered,readOnly:true,allowChat2MissingRuntime:true}),/CLOUDRU_JOB_RUNTIME_ENV_MISSING/);
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
