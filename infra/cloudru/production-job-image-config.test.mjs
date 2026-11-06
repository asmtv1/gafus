import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {CLOUDRU_PRODUCTION_JOBS,imageRepository} from './production-job-inventory.mjs';
import {configuredImage, IMAGE_OVERRIDE_ENV, imagePlan} from './production-job-image-config.mjs';

const sha = 'a'.repeat(64);
const ref = entry => imageRepository(entry) + '@sha256:' + sha;

test('four active video Jobs resolve two declared image-role overrides without creating Jobs', () => {
 const overrides = {};
 for(const job of CLOUDRU_PRODUCTION_JOBS){
   overrides[IMAGE_OVERRIDE_ENV[job.imageRole]] = ref(job);
 }
 const plan=imagePlan(overrides);
 assert.equal(plan.length,4);
 assert.equal(new Set(plan.map(x=>x.job.name)).size,4);
 assert(plan.every(x=>x.targetImage===ref(x.job)));
 assert.equal(plan.filter(x=>x.job.imageRole==='feed-worker').length,2);
 assert.equal(plan.filter(x=>x.job.imageRole==='chat-video').length,2);
});

test('production requires the configured Feed VIDEO pin (existing GitHub production Variables)', () => {
 const roles=['feed-worker'];
 const enforced={CLOUDRU_WORKER_PINS_REQUIRED:'true'};
 for(const role of roles){
   const job=CLOUDRU_PRODUCTION_JOBS.find(x=>x.imageRole===role);
   assert.throws(()=>configuredImage(job,enforced),/REQUIRED_CLOUDRU_IMAGE_PIN_MISSING/);
   const config={...enforced,[IMAGE_OVERRIDE_ENV[role]]:ref(job)};
   assert.equal(configuredImage(job,config),ref(job));
 }
 const chat=CLOUDRU_PRODUCTION_JOBS.find(x=>x.imageRole==='chat-video');
 assert.equal(configuredImage(chat,{}),imageRepository(chat)+'@sha256:ed9171f5d91c07642125aad4a740aa289d52188c53b864725e85c8f56f011fc6');
 assert.throws(()=>configuredImage(chat,enforced),/REQUIRED_CLOUDRU_IMAGE_PIN_MISSING_CLOUDRU_CHAT_VIDEO_IMAGE/);
});

test('invalid registry, mutable tag, malformed digest, and cross-role references fail closed',()=>{
 for(const job of CLOUDRU_PRODUCTION_JOBS){
   for(const value of [
    'latest',
    imageRepository(job)+':latest',
    'evil.example.com/worker@sha256:'+sha,
    imageRepository(job)+'@sha256:'+'z'.repeat(64),
    imageRepository(job)+'@sha256:'+'f'.repeat(63)
   ]){
    assert.throws(()=>configuredImage(job,{[IMAGE_OVERRIDE_ENV[job.imageRole]]:value}),
      /INVALID_CLOUDRU_IMAGE_OVERRIDE/);
   }
   assert.equal(configuredImage(job,{[IMAGE_OVERRIDE_ENV[job.imageRole]]:'sha256:'+sha}),ref(job));
 }
});

test('offline CLI plan honors edited image refs, and rejects missing required production pins',()=>{
 const names=[...new Set(CLOUDRU_PRODUCTION_JOBS.map(x=>x.imageRole))];
 const env={...process.env,CLOUDRU_WORKER_PINS_REQUIRED:'true'};
 for(const role of names){
   const job=CLOUDRU_PRODUCTION_JOBS.find(x=>x.imageRole===role);
   env[IMAGE_OVERRIDE_ENV[role]]=ref(job);
 }
 const run=spawnSync(process.execPath,['infra/cloudru/production-job-release.mjs','--plan'],
   {encoding:'utf8',env});
 assert.equal(run.status,0,run.stderr);
 const plan=JSON.parse(run.stdout);
 assert.equal(plan.mutates,false);
 assert.equal(plan.buildsImages,false);
 assert.equal(plan.provisionsJobs,false);
 assert.equal(plan.targets.length,4);
 assert(plan.targets.every(t=>t.targetImage.includes('@sha256:'+sha)));
 delete env.CLOUDRU_FEED_WORKER_IMAGE;
 const missing=spawnSync(process.execPath,['infra/cloudru/production-job-release.mjs','--plan'],
   {encoding:'utf8',env});
 assert.notEqual(missing.status,0);
 assert.match(missing.stderr,/REQUIRED_CLOUDRU_IMAGE_PIN_MISSING_CLOUDRU_FEED_WORKER_IMAGE/);
});
