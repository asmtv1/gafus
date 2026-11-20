import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {inspectViteLifecycle,verifyViteLifecycle} from '../../scripts/qa/owned-vite-process.mjs';

const port=57674;
const pid=13579;
const uid=typeof process.getuid==='function'?process.getuid():501;
const parentPid=24680;
const qaCommand=`node ./node_modules/vite/bin/vite.js --config vite.account-delete-qa.config.mjs --host 127.0.0.1 --port ${port} --strictPort`;
const noProcess=null;
const live={pid,ppid:parentPid,uid,command:qaCommand};
const proof=(mode,info,listeners)=>verifyViteLifecycle({mode,pid,port,uid,parentPid,processInfo:info,listeners});

test('cleanup fails closed while exact Vite PID is still alive, even with released port',()=>{
 assert.deepEqual(proof('released',live,[]),{ok:false,reason:'QA_VITE_PID_STILL_EXISTS'});
 assert.deepEqual(proof('released',live,[pid]),{ok:false,reason:'QA_VITE_PID_STILL_EXISTS'});
});

test('cleanup fails closed when Vite PID ended but its orphan/foreign listener still owns QA port',()=>{
 assert.deepEqual(proof('released',noProcess,[pid]),{ok:false,reason:'QA_VITE_PORT_STILL_IN_USE'});
 assert.deepEqual(proof('released',noProcess,[24680]),{ok:false,reason:'QA_VITE_PORT_STILL_IN_USE'});
 assert.deepEqual(proof('released',noProcess,[]),{ok:true,reason:'PID_ABSENT_AND_PORT_FREE'});
});

test('only exact current-user Vite command may be signalled; no pnpm parent or other process',()=>{
 assert.equal(proof('owned',live,[pid]).ok,true);
 assert.equal(proof('owned',live,[]).ok,true);
 for(const bad of [
  {...live,uid:uid+1},
  {...live,ppid:parentPid+1},
  {...live,command:`node /opt/homebrew/bin/pnpm exec vite --config vite.account-delete-qa.config.mjs --host 127.0.0.1 --port ${port} --strictPort`},
  {...live,command:qaCommand.replace(`--port ${port}`,`--port ${port+1}`)},
  {...live,command:qaCommand.replace('vite.account-delete-qa.config.mjs','vite.config.mjs')},
  {...live,command:'node -e console.log(42)'},
 ])assert.equal(proof('owned',bad,[pid]).ok,false);
 assert.equal(proof('owned',live,[24680]).ok,false);
 assert.equal(proof('owned',null,[]).ok,false);
});

test('unknown, broken or partial lsof/ps diagnostics must never prove successful teardown',()=>{
 const blocked=()=>{throw new Error('probe unavailable')};
 assert.equal(inspectViteLifecycle('released',pid,port,{uid,probe:blocked}).ok,false);
 const onlyPs=(exe)=>exe.endsWith('/ps')?{status:1,stdout:''}:{status:2,stdout:'permission denied'};
 assert.equal(inspectViteLifecycle('released',pid,port,{uid,probe:onlyPs}).ok,false);
 const unreadable=(exe)=>exe.endsWith('/ps')?{status:0,stdout:'garbled'}:{status:1,stdout:''};
 assert.equal(inspectViteLifecycle('released',pid,port,{uid,probe:unreadable}).ok,false);
 assert.equal(proof('released',null,['invalid']).ok,false);
});

test('kernel-backed regression: real disposable loopback listener blocks success while alive',async()=>{
 // This test creates ONLY an in-process ephemeral socket, never launches Vite,
 // a browser, DB or a deletion. A definitely nonexistent PID ensures only the
 // actual OS TCP-port result can block the cleanup attestation.
 const server=createServer();
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 const addr=server.address();
 assert.ok(addr&&typeof addr==='object');
 try{
   const running=inspectViteLifecycle('released',95000,addr.port);
   assert.equal(running.ok,false);
   assert.equal(running.reason,'QA_VITE_PORT_STILL_IN_USE');
 }finally{
   server.close();
   await once(server,'close');
 }
 const released=inspectViteLifecycle('released',95000,addr.port);
 assert.equal(released.ok,true);
 // The kernel also reports this test's Node PID as alive despite the socket
 // being closed. It must NEVER be considered successfully reaped.
 const stillAlive=inspectViteLifecycle('released',process.pid,addr.port);
 assert.equal(stillAlive.ok,false);
 assert.equal(stillAlive.reason,'QA_VITE_PID_STILL_EXISTS');
});

test('original QA shell must exec the Vite listener and not assert success unconditionally',()=>{
 const script=readFileSync(resolve(import.meta.dirname,'../../scripts/qa/api-account-delete-web-isolated.sh'),'utf8');
 assert.match(script,/exec env GAFUS_WEB_DEV_API_MODE=mock NODE_ENV=development node \.\/node_modules\/vite\/bin\/vite\.js/);
 assert.doesNotMatch(script,/pnpm exec vite --config vite\.account-delete-qa\.config\.mjs/);
 assert.match(script,/node scripts\/qa\/owned-vite-process\.mjs owned/);
 assert.match(script,/node scripts\/qa\/owned-vite-process\.mjs released/);
 assert.match(script, /\$WEB_STOPPED\" == 1/);
 assert.match(script,/ownedViteStopped:verified/);
 assert.match(script,/vitePidAbsentVerified:verified,vitePortFreeVerified:verified/);
 assert.doesNotMatch(script,/ownedViteStopped:true/);
});
