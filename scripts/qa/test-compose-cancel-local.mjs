#!/usr/bin/env node
// Disposable QA: SIGTERM one test-env while an independent QA Compose stack lives.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {connect} from 'node:net';

const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const bId='qa-'+randomUUID();
const dir=join(root,'.qa/testing','compose-cancel-'+randomUUID());
mkdirSync(dir,{recursive:true,mode:0o700});
const cases=[];
let aProject=null,aPorts=null,child=null;
function cmd(bin,args,env={},timeout=100000){
 const p=spawnSync(bin,args,{cwd:root,encoding:'utf8',timeout,maxBuffer:1000000,env:{...process.env,...env}});
 assert.equal(p.status,0,bin+' failed: '+String(p.stderr||p.error).slice(-650));
 return p.stdout.trim();
}
function stopB(){
 const path=join(root,'.qa/testing',bId,'compose.json');
 if(!existsSync(path))return;
 const data=JSON.parse(readFileSync(path,'utf8'));
 if(data.state==='running')
   cmd(process.execPath,['scripts/qa/test-env.mjs','down',bId]);
}
function checkPort(port){
 return new Promise(resolve=>{
  const socket=connect({host:'127.0.0.1',port});socket.setTimeout(1200);
  socket.once('connect',()=>{socket.destroy();resolve(false);});
  socket.once('error',e=>{socket.destroy();resolve(e.code==='ECONNREFUSED');});
  socket.once('timeout',()=>{socket.destroy();resolve(false);});
 });
}
async function freed(port){
 for(let i=0;i<30;i++){
  if(await checkPort(port))return true;
  await new Promise(r=>setTimeout(r,180));
 }
 return false;
}
function dockerOwnedDown(project){
 if(!project)return;
 assert(/^gafusqa[a-f0-9]{12}$/.test(project),'FOREIGN_DOCKER_PROJECT_NOT_OWNED');
 const containers=cmd('docker',['ps','-aq','--filter','label=com.docker.compose.project='+project]);
 const volumes=cmd('docker',['volume','ls','-q','--filter','label=com.docker.compose.project='+project]);
 assert.equal(containers,'','ABORTED_COMPOSE_CONTAINERS_LEFT');
 assert.equal(volumes,'','ABORTED_COMPOSE_VOLUMES_LEFT');
}
function pass(name){cases.push({name,status:'passed'});console.log('COMPOSE_CANCEL_PASS',name);}
async function main(){
 let failure=null,stdout='',stderr='',childExit=null;
 try{
  cmd('docker',['info','--format','{{.ServerVersion}}'],{},7000);
  cmd(process.execPath,['scripts/qa/test-env.mjs','up',bId],{},180000);
  const b=JSON.parse(readFileSync(join(root,'.qa/testing',bId,'compose.json'),'utf8'));
  assert.equal(b.state,'running');
  pass('separate-control-project-is-running');
  child=spawn(process.execPath,[
   'tests/support/test-env.mjs','with-functional','--',process.execPath,
   '-e',"console.log('COMPOSE_WORKLOAD_READY');setInterval(()=>{},1000);",
  ],{cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true'}});
  const exited=new Promise(resolve=>{child.once('close',(code,signal)=>{childExit={code,signal};resolve(childExit);});});
  child.stdout.on('data',data=>{stdout=(stdout+data.toString()).slice(-6000);});
  child.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-6000);});
  const deadline=Date.now()+120000;
  while(!stdout.includes('COMPOSE_WORKLOAD_READY')&&Date.now()<deadline){
   if(childExit)throw Error('WITH_FUNCTIONAL_EXITED_EARLY:'+stderr.slice(-600));
   await new Promise(r=>setTimeout(r,350));
  }
  assert(stdout.includes('COMPOSE_WORKLOAD_READY'),'CHILD_NOT_READY:'+stderr.slice(-400));
  const marker=/TEST_ENV_READY project=(gafusqa[a-f0-9]{12}) postgres=127\.0\.0\.1:(\d+) redis=127\.0\.0\.1:(\d+)/.exec(stdout);
  assert(marker,'OWNED_PROJECT_READY_RECEIPT_MISSING');
  aProject=marker[1];aPorts=[Number(marker[2]),Number(marker[3])];
  assert.notEqual(aPorts[0],b.pgPort);
  assert.notEqual(aPorts[1],b.redisPort);
  pass('real-schema-functional-child-ready-with-separated-project');
  assert.equal(child.kill('SIGTERM'),true,'SUPERVISOR_SIGTERM_REJECTED');
  let cancelTimer;
  const exit=await Promise.race([
   exited,new Promise((_,reject)=>{
    cancelTimer=setTimeout(()=>reject(Error('CANCEL_QA_SUPERVISOR_TIMEOUT')),45000);
   }),
  ]).finally(()=>clearTimeout(cancelTimer));
  assert.notEqual(exit.code,0,'CANCELLED_SUPERVISOR_CANNOT_SUCCEED');
  assert(!stderr.includes('TEST_ENV_CLEANUP_INCOMPLETE'),
    'CANCELLED_SUPERVISOR_REPORTED_CLEANUP_FAILURE');
  pass('sigterm-of-own-supervisor-results-in-nonzero-outcome');
  for(const port of aPorts)assert(await freed(port),'CANCELLED_PROJECT_PORT_NOT_FREE:'+port);
  dockerOwnedDown(aProject);
  pass('cancelled-project-ports-containers-and-volumes-removed');
  const bMeta=JSON.parse(readFileSync(join(root,'.qa/testing',bId,'compose.json'),'utf8'));
  assert.equal(bMeta.state,'running');
  const pg=cmd('/opt/homebrew/opt/postgresql@15/bin/pg_isready',
   ['-h','127.0.0.1','-p',String(bMeta.pgPort)]);
  assert.match(pg,/accepting connections/);
  pass('unrelated-owned-project-survives-cancellation');
  stopB();
  assert(await freed(b.pgPort),'B_POSTGRES_PORT_STILL_OPEN');
  assert(await freed(b.redisPort),'B_REDIS_PORT_STILL_OPEN');
  pass('control-project-exact-cleanup');
  assert.equal(cases.length,6);
 }catch(e){failure=e;}
 finally{
  if(child&&!childExit){
   try{child.kill('SIGTERM');await new Promise(r=>setTimeout(r,2500));}catch{}
  }
  if(aProject){
   try{
    const labels=['label=com.docker.compose.project='+aProject];
    if(cmd('docker',['ps','-aq','--filter',...labels]).trim())
      cmd('docker',['compose','--project-name',aProject,'--file',join(root,'tests/support/compose.yaml'),'down','--volumes','--remove-orphans']);
    dockerOwnedDown(aProject);
   }catch(e){failure=Error('EXACT_OWNED_A_CLEANUP_FAILED:'+e.message);}
  }
  try{stopB();}catch(e){failure=Error('EXACT_OWNED_B_CLEANUP_FAILED:'+e.message);}
  const summary={schema:1,runId:dir.split('/').at(-1),
   status:failure?'failed':'passed',checksExpected:6,checksPassed:cases.length,
   abortedProject:aProject,controlProject:bId,
   cases,
   caveat:'Only SIGTERM of QA supervisor, not SIGKILL, CI runner cancellation or power loss; functional db push not migration proof.'};
  writeFileSync(join(dir,'summary.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});
  console.log('COMPOSE_CANCEL_SUMMARY',JSON.stringify({
   status:summary.status,checksPassed:cases.length,receipt:join(dir,'summary.json')}));
 }
 if(failure)throw failure;
}
main().catch(e=>{console.error('COMPOSE_CANCEL_ERROR',e.stack||String(e));process.exitCode=2;});
