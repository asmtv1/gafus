import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const script = pathToFileURL(resolve('infra/cloudru/gallery-origin-recover.mjs')).href;
const project = '4c590727-4133-475b-a4bc-564c90a9e686';
function exercise(mode, states, confirm = '') {
  const runner = `
  const statuses=${JSON.stringify(states)}; let gets=0, posts=0;
  process.argv=['node','gallery-origin-recover.mjs',${JSON.stringify(mode)}];
  process.exit=(code)=>{throw Error('PROCESS_EXIT_'+code)};
  globalThis.setTimeout=(fn)=>queueMicrotask(fn);
  globalThis.fetch=async(url, options) => {
    if(url==='https://iam.api.cloud.ru/api/v1/auth/token') return {ok:true,json:async()=>({access_token:'fake'})};
    if(url==='https://containers.api.cloud.ru/v1/containers/gafus-gallery-origin?projectId=${project}' && options.method==='GET')
      return {ok:true,json:async()=>({name:'gafus-gallery-origin',projectId:'${project}',status:statuses[Math.min(gets++,statuses.length-1)]})};
    if(url==='https://containers.api.cloud.ru/v2/containers/gafus-gallery-origin:start?projectId=${project}' && options.method==='POST') {
      posts++;return {ok:true,body:{cancel:async()=>{}}};
    }
    throw Error('UNEXPECTED_FETCH');
  };
  try{await import(${JSON.stringify(script)})}catch(e){if(e.message!=='PROCESS_EXIT_0'){console.log('ERROR='+e.message);process.exitCode=1}}
  finally{console.log('POST_COUNT='+posts)}
  `;
  return spawnSync(process.execPath,['--input-type=module','-e',runner,'--',mode],{
    cwd:process.cwd(),encoding:'utf8',timeout:5000,
    env:{PATH:process.env.PATH,CLOUDRU_PROJECT_ID:project,CLOUDRU_KEY_ID:'test-id',CLOUDRU_KEY_SECRET:'test-secret',GAFUS_GALLERY_ORIGIN_START_CONFIRM:confirm},
  });
}
test('inspect is read-only even when suspended',()=>{
  const r=exercise('--inspect',['suspended']);
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/GALLERY_ORIGIN_INITIAL_STATUS=suspended/);
  assert.match(r.stdout,/POST_COUNT=0/);
});
test('start refuses without exact manual authorization',()=>{
  const r=exercise('--start',['suspended']);
  assert.notEqual(r.status,0);
  assert.match(r.stdout,/ERROR=GALLERY_ORIGIN_MANUAL_CONFIRM_REQUIRED/);
  assert.match(r.stdout,/POST_COUNT=0|^$/);
});
test('does not bypass a product/billing suspension',()=>{
  const r=exercise('--start',['suspended_product'],'START_SUSPENDED_GALLERY_ORIGIN_ONLY');
  assert.notEqual(r.status,0);
  assert.match(r.stdout,/POST_COUNT=0/);
  assert.match(r.stdout,/ERROR=GALLERY_ORIGIN_NOT_OPERATOR_SUSPENDED_suspended_product/);
});
test('starts only the exact suspended origin and verifies it reaches running',()=>{
  const r=exercise('--start',['suspended','running'],'START_SUSPENDED_GALLERY_ORIGIN_ONLY');
  assert.equal(r.status,0,r.stderr+r.stdout);
  assert.match(r.stdout,/GALLERY_ORIGIN_START_ACCEPTED=PASS/);
  assert.match(r.stdout,/GALLERY_ORIGIN_RUNNING=PASS/);
  assert.match(r.stdout,/POST_COUNT=1/);
});
test('running origin is not restarted',()=>{
  const r=exercise('--start',['running'],'START_SUSPENDED_GALLERY_ORIGIN_ONLY');
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/GALLERY_ORIGIN_ALREADY_RUNNING_NO_MUTATION=PASS/);
  assert.match(r.stdout,/POST_COUNT=0/);
});
