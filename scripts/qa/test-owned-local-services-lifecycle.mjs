#!/usr/bin/env node
// Opt-in isolated QA: two PG18+Redis pairs, concurrent state isolation,
// targeted SIGTERM, failed startup and verified owned-resource cleanup.
// No Docker, production URLs or existing local service PIDs are ever touched.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, lstatSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const id='qa-local-lifecycle-'+randomUUID();
const outputDir=join(root,'.qa/testing',id);
mkdirSync(outputDir,{recursive:true,mode:0o700});
const script=join(root,'scripts/qa/owned-local-services-lifecycle.sh');
const env=Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL','TZ'].filter(k=>process.env[k]!==undefined)
  .map(k=>[k,process.env[k]]));
const processes=[];
const cases=[];
const now=()=>Date.now();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function run(cmd,args,ms=5000) {
  const result=spawnSync(cmd,args,{cwd:root,env,encoding:'utf8',timeout:ms});
  assert.equal(result.status,0,
    'QA_PROBE_COMMAND_FAILED:'+cmd+':'+(result.stderr||result.stdout||result.error||''));
  return result.stdout.trim();
}
async function portFree(port){
  return await new Promise(resolve=>{
    const s=net.createServer();
    s.once('error',()=>resolve(false));
    s.listen({host:'127.0.0.1',port,exclusive:true},()=>{
      s.close(()=>resolve(true));
    });
  });
}
function start(extra={}) {
  const child=spawn('/bin/bash',[script],{cwd:root,env:{...env,...extra},stdio:['ignore','pipe','pipe']});
  const info={child,out:'',err:'',exit:null,ready:null,allocated:null};
  processes.push(info);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>{
    info.out+=chunk;
    for(const line of info.out.split('\n')){
      const allocated=/^QA_OWNED_ALLOCATED run=(\S+) pg=(\d+) redis=(\d+)$/.exec(line);
      const ready=/^QA_OWNED_READY run=(\S+) pg=(\d+) redis=(\d+) redis_pid=(\d+)$/.exec(line);
      if(allocated)info.allocated={directory:allocated[1],pg:Number(allocated[2]),redis:Number(allocated[3])};
      if(ready)info.ready={directory:ready[1],pg:Number(ready[2]),redis:Number(ready[3]),
        redisPid:Number(ready[4])};
    }
  });
  child.stderr.on('data',chunk=>{info.err+=chunk;});
  info.finished=new Promise(resolve=>{
    child.once('error',err=>{info.err+=String(err);info.exit={code:null,signal:'error'};resolve(info.exit);});
    child.once('exit',(code,signal)=>{info.exit={code,signal};resolve(info.exit);});
  });
  return info;
}
async function until(check,ms,label) {
  const limit=now()+ms;
  while(now()<limit) {
    const found=check();
    if(found) return found;
    await sleep(100);
  }
  throw Error('QA_TIMEOUT:'+label);
}
async function ready(info){
  await until(()=>info.ready||info.exit,60000,'ready');
  assert(info.ready, 'QA_SERVICE_EXIT_BEFORE_READY:'+info.err+info.out.slice(-450));
  assert.equal(info.ready.directory,info.allocated.directory);
  assert.equal(info.ready.pg,info.allocated.pg);
  assert.equal(info.ready.redis,info.allocated.redis);
  assert(info.ready.pg!==info.ready.redis,'PORT_COLLISION');
  assert(info.child.pid>1,'OWNED_WRAPPER_PID_REQUIRED');
  assert.equal(run('/opt/homebrew/opt/postgresql@18/bin/psql',
    ['-X','-h','127.0.0.1','-p',String(info.ready.pg),'-U','qa_local_only','-d','postgres',
      '-Atc',"select current_setting('server_version_num')::integer >= 180000"]), 't');
  assert.equal(run('/opt/homebrew/bin/redis-cli',
    ['-h','127.0.0.1','-p',String(info.ready.redis),'ping']),'PONG');
  return info.ready;
}
async function cleaned(info,expectedCode) {
  const result=await Promise.race([info.finished,sleep(35000).then(()=>{throw Error('QA_CLEANUP_TIMEOUT');})]);
  assert.equal(result.signal,null,'WRAPPER_TERMINATED_WITHOUT_TRAP');
  assert.equal(result.code,expectedCode,'WRONG_EXIT:'+info.out+info.err);
  assert.match(info.out,/QA_OWNED_CLEANED pg=\d+ redis=\d+ exit=\d+/,'CLEANUP_NOT_PROVED');
  assert.doesNotMatch(info.out+info.err,/QA_OWNED_CLEANUP_INCOMPLETE/);
  const owned=info.ready||info.allocated;
  assert(owned,'OWNED_IDENTITY_NOT_RECORDED');
  assert(owned.directory.startsWith('/tmp/gafus-qa-local-lifecycle.'));
  assert.equal(existsSync(owned.directory),false,'OWNED_QA_DIRECTORY_LEAK');
  assert(await portFree(owned.pg),'OWNED_PG_LISTENER_STILL_ACTIVE');
  assert(await portFree(owned.redis),'OWNED_REDIS_LISTENER_STILL_ACTIVE');
  return owned;
}
/**
 * Recovery is owned by the outer QA supervisor, not the SIGKILLed shell.
 * Only act on resources from the exact ready receipt and verified PG
 * postmaster.pid / Redis INFO process_id. No name-based process sweeps.
 */
async function recoverVerifiedOrphan(info) {
  const owned=info.ready;
  assert(owned && info.allocated?.directory===owned.directory,
    'HARD_KILL_RECOVERY_REQUIRES_EXACT_READY_IDENTITY');
  assert(/^\/tmp\/gafus-qa-local-lifecycle\.[A-Za-z0-9]+$/.test(owned.directory),
    'UNEXPECTED_QA_DIRECTORY');
  assert(existsSync(owned.directory),'OWNED_QA_DIRECTORY_MISSING');
  const st=lstatSync(owned.directory);
  assert(st.isDirectory() && !st.isSymbolicLink(),'QA_DIRECTORY_NOT_A_REAL_DIRECTORY');
  const pidFile=join(owned.directory,'pg','postmaster.pid');
  assert(existsSync(pidFile),'POSTMASTER_PIDFILE_MISSING');
  const meta=readFileSync(pidFile,'utf8').trimEnd().split('\n');
  assert(Number.isInteger(Number(meta[0])) && Number(meta[0])>1,
    'OWNED_POSTMASTER_PID_MISSING');
  assert.equal(meta[1],join(owned.directory,'pg'),'OWNED_POSTGRES_DIRECTORY_MISMATCH');
  assert.equal(Number(meta[3]),owned.pg,'OWNED_POSTGRES_PORT_MISMATCH');
  const redisInfo=run('/opt/homebrew/bin/redis-cli',
    ['-h','127.0.0.1','-p',String(owned.redis),'INFO','server']);
  const redisProcessId=/^process_id:(\d+)\r?$/m.exec(redisInfo)?.[1];
  assert.equal(Number(redisProcessId),owned.redisPid,'OWNED_REDIS_PID_MISMATCH');
  const pgStop=spawnSync('/opt/homebrew/opt/postgresql@18/bin/pg_ctl',
    ['-D',join(owned.directory,'pg'),'-m','immediate','-w','stop'],
    {cwd:root,env,encoding:'utf8',timeout:20000});
  assert.equal(pgStop.status,0,'OWNED_PG_STOP_FAILED:'+String(pgStop.stderr||pgStop.error));
  const redisShutdown=spawnSync('/opt/homebrew/bin/redis-cli',
    ['-h','127.0.0.1','-p',String(owned.redis),'SHUTDOWN','NOSAVE'],
    {cwd:root,env,encoding:'utf8',timeout:15000});
  assert.equal(redisShutdown.status,0,
    'OWNED_REDIS_SHUTDOWN_FAILED:'+String(redisShutdown.stderr||redisShutdown.error));
  await until(asyncNever=>false,0,'not-used').catch(()=>{}); // no-op removed below
  for(let n=0;n<100;n++){
    if(await portFree(owned.pg) && await portFree(owned.redis))break;
    await sleep(100);
  }
  assert(await portFree(owned.pg),'HARD_KILL_PG_PORT_STILL_BOUND');
  assert(await portFree(owned.redis),'HARD_KILL_REDIS_PORT_STILL_BOUND');
  rmSync(owned.directory,{recursive:true,force:false});
  assert(!existsSync(owned.directory),'HARD_KILL_OWNED_DIRECTORY_REMAINS');
  return owned;
}
function addCase(name,values){cases.push({name,status:'passed',...values});console.log('QA_PASS',name);}
async function main(){
  const [a,b]=[start(),start()];
  const [pA,pB]=await Promise.all([ready(a),ready(b)]);
  assert(new Set([pA.pg,pA.redis,pB.pg,pB.redis]).size===4,'PARALLEL_PORT_ISOLATION');
  assert.notEqual(pA.directory,pB.directory);
  const sql=port=>['-X','-h','127.0.0.1','-p',String(port),'-U','qa_local_only','-d','postgres','-Atc'];
  run('/opt/homebrew/opt/postgresql@18/bin/psql',
    [...sql(pA.pg),'CREATE TABLE qa_owned_probe (marker TEXT); INSERT INTO qa_owned_probe VALUES (\'ONLY_A\')']);
  assert.equal(run('/opt/homebrew/opt/postgresql@18/bin/psql',
    [...sql(pA.pg),'SELECT marker FROM qa_owned_probe']),'ONLY_A');
  assert.equal(run('/opt/homebrew/opt/postgresql@18/bin/psql',
    [...sql(pB.pg),"SELECT to_regclass('public.qa_owned_probe') IS NULL"]),'t');
  run('/opt/homebrew/bin/redis-cli',['-h','127.0.0.1','-p',String(pA.redis),'SET','qa-owned','ONLY_A']);
  assert.equal(run('/opt/homebrew/bin/redis-cli',
    ['-h','127.0.0.1','-p',String(pA.redis),'GET','qa-owned']),'ONLY_A');
  assert.equal(run('/opt/homebrew/bin/redis-cli',
    ['-h','127.0.0.1','-p',String(pB.redis),'GET','qa-owned']), '');
  addCase('two concurrent private databases and Redis instances are isolated',
    {pgA:pA.pg,pgB:pB.pg,redisA:pA.redis,redisB:pB.redis});
  assert.equal(a.child.kill('SIGTERM'),true,'SIGNAL_A_FAILED');
  await cleaned(a,2);
  assert.equal(run('/opt/homebrew/opt/postgresql@18/bin/psql',
    [...sql(pB.pg),'SELECT 42']),'42');
  assert.equal(run('/opt/homebrew/bin/redis-cli',
    ['-h','127.0.0.1','-p',String(pB.redis),'ping']),'PONG');
  addCase('canceling owner A frees only A while B remains healthy', {owner:"A",pg:pA.pg,redis:pA.redis});
  assert.equal(b.child.kill('SIGTERM'),true,'SIGNAL_B_FAILED');
  await cleaned(b,2);
  addCase('owner B is also cleaned with no local process or listener', {pg:pB.pg,redis:pB.redis});
  const fail=start({GAFUS_QA_FAIL_AFTER_START:'1'});
  await until(()=>fail.allocated||fail.exit,50000,'failure-allocated');
  await cleaned(fail,3);
  assert.match(fail.err,/QA_SYNTHETIC_STARTUP_FAILURE/);
  addCase('failed startup returns a failure and leaves no resources',
    {pg:fail.allocated.pg,redis:fail.allocated.redis});
  const killed=start();
  const hard=await ready(killed);
  assert.equal(killed.child.kill('SIGKILL'),true,'HARD_KILL_OWNED_WRAPPER_FAILED');
  const killedResult=await Promise.race([
    killed.finished,sleep(12000).then(()=>{throw Error('HARD_KILL_WRAPPER_EXIT_TIMEOUT');}),
  ]);
  assert.equal(killedResult.signal,'SIGKILL','WRAPPER_WAS_NOT_HARD_KILLED');
  assert(existsSync(hard.directory),'HARD_KILL_EXPECTS_ORPHANED_DATA');
  const actualRedisPid=killed.ready.redisPid;
  try {
    killed.ready.redisPid=actualRedisPid+1;
    await assert.rejects(recoverVerifiedOrphan(killed),/OWNED_REDIS_PID_MISMATCH/);
  } finally { killed.ready.redisPid=actualRedisPid; }
  assert.equal(run('/opt/homebrew/bin/redis-cli',
    ['-h','127.0.0.1','-p',String(hard.redis),'PING']),'PONG');
  addCase('supervisor refuses a forged Redis PID without stopping it',
    {redis:hard.redis});
  const actualPgPort=killed.ready.pg;
  try {
    killed.ready.pg=actualPgPort+1;
    await assert.rejects(recoverVerifiedOrphan(killed),/OWNED_POSTGRES_PORT_MISMATCH/);
  } finally { killed.ready.pg=actualPgPort; }
  assert.equal(run('/opt/homebrew/opt/postgresql@18/bin/psql',
    ['-X','-h','127.0.0.1','-p',String(hard.pg),'-U','qa_local_only',
      '-d','postgres','-Atc','select 1']), '1');
  addCase('supervisor refuses a forged PostgreSQL port without stopping it',
    {pg:hard.pg});
  const verified=await recoverVerifiedOrphan(killed);
  addCase('supervised SIGKILL recovery cleans only verified owned PostgreSQL and Redis',
    {pg:verified.pg,redis:verified.redis,redisPid:verified.redisPid});
  const summary={schema:1,runId:id,advisory:true,
    status:'passed',checksExpected:7,checksPassed:cases.length,
    resourcesDeleted:true,realPostgres18:true,realRedis:true,signals:['SIGTERM','SIGKILL_WRAPPER_SUPERVISOR_CLEANUP'],
    caveat:'SIGKILL of shell wrapper recovered by its live outer supervisor; no claim for supervisor SIGKILL, power loss or Docker Compose.',
    cases};
  assert.equal(cases.length,7);
  writeFileSync(join(outputDir,'summary.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});
  console.log('QA_LOCAL_LIFECYCLE_REPORT_PASS',join(outputDir,'summary.json'));
}
try{await main();}catch(e){
  console.error('QA_LOCAL_LIFECYCLE_FAILED',e.stack||String(e));
  writeFileSync(join(outputDir,'failure.json'),JSON.stringify({status:'failed',error:String(e)})+'\n',{mode:0o600});
  process.exitCode=1;
}finally{
  for(const p of processes) {
    if(p.exit===null) {
      p.child.kill('SIGTERM');
      await Promise.race([p.finished,sleep(30000)]);
    }
  }
}
