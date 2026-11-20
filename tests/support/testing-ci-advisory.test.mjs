import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {parse} from 'yaml';
const root=resolve(import.meta.dirname,'../..');
const load=file=>parse(readFileSync(join(root,file),'utf8'));
const workflows=load('.github/workflows/testing-reusable.yml');
const release=load('.github/workflows/ci-cd.yml');
const nightly=load('.github/workflows/testing-nightly.yml');

test('advisory test profiles do not become production release dependencies',()=>{
 const before=spawnSync('git',['show','HEAD:.github/workflows/ci-cd.yml'],{cwd:root,encoding:'utf8'});
 assert.equal(before.status,0,before.stderr);
 const base=parse(before.stdout);
 const releaseJobs=['deploy-production','deploy-only','build-images','security','build-apps'];
 for(const key of releaseJobs){
   if(!release.jobs[key] && !base.jobs[key])continue;
   assert.deepEqual(release.jobs[key]?.needs||[],base.jobs[key]?.needs||[],key+' needs changed');
 }
 for(const [job,value] of Object.entries(release.jobs)){
   if(job==='testing-advisory')continue;
   assert.ok(!String(value.needs||'').includes('testing-advisory'),job+' depends on advisory checks');
 }
 assert.ok(release.jobs['testing-advisory']);
});

test('PR and manual native/web advisory jobs have explicit nonblocking boundaries',()=>{
 const expected={
  'testing-web-e2e-advisory':['pull_request','e2e-web','full'],
  'testing-web-vite-advisory':['pull_request','web-vite','full'],
  'testing-native-preflight-advisory':['workflow_dispatch','native-preflight'],
 };
 for(const [name,guards] of Object.entries(expected)){
   const job=workflows.jobs[name];
   assert.equal(job['continue-on-error'],true,name);
   assert.equal(job.permissions?.contents,'read',name);
   for(const guard of guards)assert.ok(String(job.if).includes(guard),name+' missing '+guard);
   const execution=job.steps.find(step=>step.id==='web_e2e'||step.id==='regression'||step.id==='native_preflight');
   assert.equal(execution?.['continue-on-error'],true,name+' action not advisory');
   assert.ok(job.steps.some(step=>step.uses==='actions/upload-artifact@v4'),name+' evidence unavailable');
 }
 const observe=workflows.jobs['testing-plan-observe'];
 assert.equal(observe['continue-on-error'],true,'reusable plan job must be advisory even if installation fails');
 assert.ok(observe.steps.some(step=>step.run==='pnpm install --frozen-lockfile'));
 assert.ok(observe.steps.some(step=>step.run==='pnpm test:system:contract'));
 assert.deepEqual(nightly.jobs['test-profile-plan'].with,{profile:'full',execute:true});
});
