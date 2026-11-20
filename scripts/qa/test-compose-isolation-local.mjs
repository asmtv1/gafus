#!/usr/bin/env node
// Opt-in disposable Docker Compose QA, exact owned identities only.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {connect} from 'node:net';

const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const ids=['qa-'+randomUUID(),'qa-'+randomUUID()];
const reportDir=join(root,'.qa/testing','compose-isolation-'+randomUUID());
mkdirSync(reportDir,{recursive:true,mode:0o700});
const checks=[];
const started=new Map();
function command(bin,args,env={},timeout=120000){
 const r=spawnSync(bin,args,{cwd:root,env:{...process.env,...env},encoding:'utf8',timeout,maxBuffer:1_000_000});
 assert.equal(r.status,0,bin+' exit='+r.status+' '+String(r.stderr||r.error).slice(-600));
 return r.stdout.trim();
}
function start(id){
 command(process.execPath,['scripts/qa/test-env.mjs','up',id],{},180000);
 const base=join(root,'.qa/testing',id);
 const meta=JSON.parse(readFileSync(join(base,'compose.json'),'utf8'));
 assert.equal(meta.runId,id);assert.equal(meta.project,'qa-gafus-'+id.slice(3).toLowerCase());
 assert.equal(meta.state,'running');
 const vars=Object.fromEntries(readFileSync(join(base,'compose.env'),'utf8')
   .trim().split('\n').map(line=>line.split('=')));
 for(const key of ['QA_PG_USER','QA_PG_DB','QA_PG_PASSWORD','QA_REDIS_PASSWORD'])
   assert(vars[key]?.length>8,key+' is missing');
 const data={...meta,vars};
 started.set(id,data);
 return data;
}
function stop(id){
 command(process.execPath,['scripts/qa/test-env.mjs','down',id],{},180000);
 const meta=JSON.parse(readFileSync(join(root,'.qa/testing',id,'compose.json'),'utf8'));
 assert.equal(meta.state,'stopped');
}
function pg(x,sql){
 return command('/opt/homebrew/opt/postgresql@15/bin/psql',[
 '-X','-h','127.0.0.1','-p',String(x.pgPort),'-U',x.vars.QA_PG_USER,
 '-d',x.vars.QA_PG_DB,'-v','ON_ERROR_STOP=1','-Atc',sql,
 ],{PGPASSWORD:x.vars.QA_PG_PASSWORD},15000);
}
function redis(x,...args){
 return command('/opt/homebrew/bin/redis-cli',[
 '-h','127.0.0.1','-p',String(x.redisPort),'--raw',...args,
 ],{REDISCLI_AUTH:x.vars.QA_REDIS_PASSWORD},15000);
}
function pass(name){checks.push({name,status:'passed'});console.log('COMPOSE_QA_PASS',name);}
function portRefused(port){
 return new Promise(resolve=>{
  const s=connect({host:'127.0.0.1',port});s.setTimeout(1200);
  s.once('connect',()=>{s.destroy();resolve(false);});
  s.once('error',e=>{s.destroy();resolve(e.code==='ECONNREFUSED');});
  s.once('timeout',()=>{s.destroy();resolve(false);});
 });
}
async function freed(port){
 for(let n=0;n<30;n++){
  if(await portRefused(port))return true;
  await new Promise(r=>setTimeout(r,150));
 }
 return false;
}
async function main(){
 let failure=null;
 try{
  assert.match(command('docker',['info','--format','{{.ServerVersion}}'],{},8000),/^\d+\.\d+/);
  const a=start(ids[0]);const b=start(ids[1]);
  for(const key of ['project','pgPort','redisPort'])assert.notEqual(a[key],b[key]);
  for(const key of ['QA_PG_DB','QA_PG_PASSWORD','QA_REDIS_PASSWORD'])assert.notEqual(a.vars[key],b.vars[key]);
  pass('two-owned-compose-projects-with-independent-ports-and-credentials');
  assert.equal(pg(a,'SELECT current_database()'),a.vars.QA_PG_DB);
  assert.equal(pg(b,'SELECT current_database()'),b.vars.QA_PG_DB);
  pg(a,"CREATE TABLE qa_test_isolation (marker TEXT NOT NULL); INSERT INTO qa_test_isolation VALUES ('a');");
  pg(b,"CREATE TABLE qa_test_isolation (marker TEXT NOT NULL); INSERT INTO qa_test_isolation VALUES ('b');");
  assert.equal(pg(a,'SELECT marker FROM qa_test_isolation'),'a');
  assert.equal(pg(b,'SELECT marker FROM qa_test_isolation'),'b');
  pass('postgres15-fresh-databases-and-data-isolated');
  assert.equal(redis(a,'SET','qa_local_marker','a'),'OK');
  assert.equal(redis(b,'SET','qa_local_marker','b'),'OK');
  assert.equal(redis(a,'GET','qa_local_marker'),'a');
  assert.equal(redis(b,'GET','qa_local_marker'),'b');
  pass('redis7-independent-keyspaces-and-auth');
  stop(ids[0]);
  assert(await freed(a.pgPort),'FIRST_PG_LISTENER_STILL_BOUND');
  assert(await freed(a.redisPort),'FIRST_REDIS_LISTENER_STILL_BOUND');
  assert.equal(pg(b,'SELECT marker FROM qa_test_isolation'),'b');
  assert.equal(redis(b,'GET','qa_local_marker'),'b');
  pass('targeted-stop-of-a-preserves-b');
  stop(ids[1]);
  assert(await freed(b.pgPort),'SECOND_PG_LISTENER_STILL_BOUND');
  assert(await freed(b.redisPort),'SECOND_REDIS_LISTENER_STILL_BOUND');
  pass('stop-of-b-liberates-all-four-owned-ports');
  assert.equal(checks.length,5);
 }catch(e){failure=e;}
 finally{
  for(const id of ids){
   if(!started.has(id))continue;
   const path=join(root,'.qa/testing',id,'compose.json');
   try{
    if(existsSync(path)&&JSON.parse(readFileSync(path,'utf8')).state==='running')stop(id);
   }catch(e){failure=new Error('OWNED_CLEANUP_FAILED:'+e.message);}
  }
  const servicesDown=ids.filter(id=>started.has(id)).every(id=>{
   const path=join(root,'.qa/testing',id,'compose.json');
   return existsSync(path)&&JSON.parse(readFileSync(path,'utf8')).state==='stopped';
  });
  if(!servicesDown)failure=new Error('OWNED_COMPOSE_SERVICES_NOT_STOPPED');
  const summary={schema:1,runId:reportDir.split('/').at(-1),
   status:failure?'failed':'passed',checksPassed:checks.length,checksExpected:5,
   engine:'postgres:15.15-alpine+redis:7.4.2-alpine',projects:ids,
   servicesDown,checks,
   caveat:'Only local Compose isolation, no CI cancellation/physical device/provider claims.'};
  writeFileSync(join(reportDir,'summary.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});
  console.log('COMPOSE_QA_SUMMARY',JSON.stringify({
   status:summary.status,checksPassed:summary.checksPassed,
   checksExpected:summary.checksExpected,servicesDown,receipt:join(reportDir,'summary.json')}));
 }
 if(failure)throw failure;
}
main().catch(e=>{console.error('COMPOSE_QA_ERROR',e.stack||String(e));process.exitCode=2;});
