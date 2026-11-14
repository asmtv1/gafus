import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateWatchdogState, safePublicTarget, safeWebhook, watchdog } from './external-watchdog.mjs';
import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('public targets cannot point at internal hosts or include private query',()=>{
  assert.equal(safePublicTarget('https://api.gafus.ru/health').hostname,'api.gafus.ru');
  assert.throws(()=>safePublicTarget('https://127.0.0.1:3000/health'),/TARGET_NOT_ALLOWED/);
  assert.throws(()=>safePublicTarget('https://gafus.ru/health?bearer=abc'),/TARGET_NOT_ALLOWED/);
  assert.throws(()=>safePublicTarget('http://gafus.ru/healthz'),/TARGET_NOT_ALLOWED/);
  assert.throws(()=>safeWebhook('https://attacker.example/steal'),/WEBHOOK_NOT_ALLOWED/);
});
test('one transient failure does not page; sustained failure and recovery do',()=>{
  const first=updateWatchdogState({}, {api:'HTTP_NETWORK',web:'OK',uptrace:'OK'},100);
  assert.equal(first.changes.length,0);
  const second=updateWatchdogState(first.states,{api:'HTTP_NETWORK',web:'OK',uptrace:'OK'},120100);
  assert.deepEqual(second.changes,[{service:'api',code:'HTTP_NETWORK',transition:'incident'}]);
  const third=updateWatchdogState(second.states,{api:'HTTP_NETWORK',web:'OK',uptrace:'OK'},240100);
  assert.equal(third.changes.length,0);
  const recovery=updateWatchdogState(third.states,{api:'OK',web:'OK',uptrace:'OK'},360100);
  assert.deepEqual(recovery.changes,[{service:'api',code:'OK',transition:'recovery'}]);
});
test('different degradation codes start a new confirmation window',()=>{
  const a=updateWatchdogState({}, {api:'HTTP_BAD_STATUS'},0);
  const b=updateWatchdogState(a.states,{api:'HTTP_NETWORK'},120000);
  assert.equal(b.states.api.consecutive,1);
  assert.equal(b.changes.length,0);
  assert.throws(()=>updateWatchdogState({}, {api:'SECRET_LEAK'},0),/WATCHDOG_SCHEMA/);
});

test('missing production spans remain visible but never page until ingest heartbeat is armed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gafus-watchdog-test-'));
 const viewer=join(dir,'viewer.token');
 const state=join(dir,'watchdog.json');
 try{
  await writeFile(viewer,'synthetic_test_viewer_secret_123',{mode:0o600});
  await chmod(viewer,0o600);
  const env={
   UPTRACE_VIEWER_TOKEN_FILE:viewer,GAFUS_WATCHDOG_STATE_FILE:state,
   GAFUS_WATCHDOG_API_URL:'https://api.gafus.ru/health',
   GAFUS_WATCHDOG_WEB_URL:'https://gafus.ru/healthz',
   GAFUS_WATCHDOG_DRY_RUN:'true',
  };
  const fetchImpl=async()=>new Response('ok',{status:200});
  const readUptrace=async()=>({spans:[]});
  const first=await watchdog({env,now:1800000000000,fetchImpl,readUptrace});
  const second=await watchdog({env,now:1800000120000,fetchImpl,readUptrace});
  assert.equal(first.checks.uptrace,'UPTRACE_NO_DATA');
  assert.equal(first.actionableChecks.uptrace,'OK');
  assert.equal(second.notifications,0);
  assert.equal(second.wouldNotify,0);
  const armed={...env,GAFUS_WATCHDOG_INGEST_EXPECTED:'true'};
  const armed1=await watchdog({env:armed,now:1800000240000,fetchImpl,readUptrace});
  const armed2=await watchdog({env:armed,now:1800000360000,fetchImpl,readUptrace});
  assert.equal(armed1.wouldNotify,0);
  assert.equal(armed2.wouldNotify,1);
  assert.equal(armed2.notifications,0,'dry-run must not claim a real page');
 }finally{await rm(dir,{recursive:true,force:true});}
});
