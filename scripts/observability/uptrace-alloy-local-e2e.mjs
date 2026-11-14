#!/usr/bin/env node
/**
 * Isolated, automatically cleaned-up Grafana Alloy Nonprod end-to-end test.
 * No production credentials, no production targets, no public listening ports.
 * Exercises file-backed OTLP queue and Prometheus WAL through Cloud project 9383.
 */
import {spawn} from 'node:child_process';
import {createServer,connect} from 'node:net';
import {createServer as createHttpServer} from 'node:http';
import {mkdtemp,readFile,rm,stat,lstat} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {readCanaryDsn} from './uptrace-nonprod-canary.mjs';
import {createUptraceAckGateway} from './uptrace-ack-gateway.mjs';
import {readViewerToken,fetchReadOnlyJson,makeReadUrl} from './uptrace-read.mjs';
const shielded=process.argv[2]==='--shield';
if(process.argv.length>(shielded?3:2))throw Error('UNSUPPORTED_ALLOY_E2E_ARGUMENT');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const ALLOY_PORT=54318,SCRAPE_PORT=59241,UI_PORT=52999;
const PROJECT='9383';
const METRIC='gafus_nonprod_alloy_probe';
const endpoints=[ALLOY_PORT,SCRAPE_PORT,UI_PORT,...(shielded?[54319]:[])];
function makeId(n){return randomBytes(n).toString('hex');}
async function unusedPort(port){
 return new Promise(resolve=>{
  const sock=connect({host:'127.0.0.1',port});
  sock.setTimeout(900);
  sock.once('connect',()=>{sock.destroy();resolve(false);});
  sock.once('error',e=>{sock.destroy();resolve(e.code==='ECONNREFUSED');});
  sock.once('timeout',()=>{sock.destroy();resolve(false);});
 });
}
function data(traceId,spanId,time){
 const resource={attributes:[
  {key:'service.name',value:{stringValue:'gafus-nonprod-alloy-e2e'}},
  {key:'deployment.environment.name',value:{stringValue:'preview'}},
 ]};
 const unix=(BigInt(time)*1000000n).toString();
 return {
  trace:{resourceSpans:[{resource,scopeSpans:[{scope:{name:'gafus.alloy.e2e'},
    spans:[{name:'gafus.nonprod.alloy.e2e.trace',traceId,spanId,kind:1,
      startTimeUnixNano:unix,endTimeUnixNano:(BigInt(unix)+3000000n).toString(),
      status:{code:1}}]}]}]},
  log:{resourceLogs:[{resource,scopeLogs:[{scope:{name:'gafus.alloy.e2e'},
    logRecords:[{timeUnixNano:unix,traceId,spanId,severityNumber:17,
      body:{stringValue:'GAFUS_NONPROD_ALLOY_SYNTHETIC_LOG'}}]}]}]},
 };
}
async function stop(child){
 if(!child||child.exitCode!==null)return;
 child.kill('SIGTERM');
 await Promise.race([
  new Promise(resolve=>child.once('exit',resolve)),
  pause(7500),
 ]);
 if(child.exitCode===null)child.kill('SIGKILL');
}
async function waitForIngest(body,traceId){
 for(let i=0;i<35;i++){
  try {
   const response=await fetch('http://127.0.0.1:'+ALLOY_PORT+'/v1/traces',{
    method:'POST',headers:{'content-type':'application/json'},
    redirect:'error',signal:AbortSignal.timeout(1800),body:JSON.stringify(body),
   });
   if(response.ok)return;
  }catch{}
  await pause(450);
 }
 throw Error('ALLOY_LOCAL_OTLP_NEVER_READY');
}
async function cloudReadback(viewer,traceId,startedAt) {
 const state={trace:false,log:false,metric:false};
 for(let i=0;i<32;i++){
  try{
   const spans=await fetchReadOnlyJson(
    makeReadUrl('spans',PROJECT,Date.now(),5),viewer);
   const rows=(spans.spans??[]).filter(x=>x.traceId===traceId);
   const text=JSON.stringify(rows);
   state.trace ||= text.includes('gafus.nonprod.alloy.e2e.trace');
   state.log ||= text.includes('GAFUS_NONPROD_ALLOY_SYNTHETIC_LOG');
   const url=new URL('https://api.uptrace.dev/api/prometheus/'+PROJECT+'/api/v1/query');
   url.searchParams.set('query',METRIC);
   const obj=await fetchReadOnlyJson(url,viewer);
   state.metric ||= (obj.data?.result??[]).some(x=>
     Number(x.value?.[1])===1 && Number(x.value?.[0])*1000>=startedAt-5_000);
  }catch{}
  if(state.trace&&state.log&&state.metric)return state;
  await pause(1250);
 }
 return state;
}
async function run(){
 if(endpoints.some(p=>!Number.isInteger(p)))throw Error('PORT_INVALID');
 for(const port of endpoints)
  if(!(await unusedPort(port)))throw Error('ALLOY_LOCAL_PORT_IN_USE');
 const dsn=await readCanaryDsn();
 const viewer=await readViewerToken(join(homedir(),'.config/gafus-observability/uptrace-read.token'));
 const root=await mkdtemp(join(tmpdir(),'gafus-alloy-nonprod-'));
 const storage=join(root,'data');
 const config=resolve('ci-cd/observability/uptrace/'+
  (shielded?'alloy.nonprod-ack-gateway.alloy':'alloy.nonprod-isolated.alloy'));
 const startAt=Date.now();
 const traceId=makeId(16),spanId=makeId(8);
 const {trace,log}=data(traceId,spanId,startAt);
 let child=null;
 let gateway=null;
 let internalToken;
 if(shielded){
  const privateFile=join(homedir(),'.config/gafus-observability/uptrace-nonprod-ack-gateway.token');
  const st=await lstat(privateFile);
  if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077)!==0)
   throw Error('ALLOY_GATEWAY_PRIVATE_TOKEN_REQUIRED');
  internalToken=(await readFile(privateFile,'utf8')).trim();
  gateway=createUptraceAckGateway({dsn,internalToken});
 }
 let logTail='';
 const http=createHttpServer((req,res)=>{
  if(req.method!=='GET'||req.url!=='/metrics'){
   res.writeHead(404,{'content-type':'text/plain'});res.end('Not Found');return;
  }
  res.writeHead(200,{'content-type':'text/plain;version=0.0.4'});
  res.end('# TYPE '+METRIC+' gauge\n'+METRIC+' 1\n');
 });
 try{
  await new Promise((done,reject)=>{
   http.once('error',reject);
   http.listen(SCRAPE_PORT,'127.0.0.1',done);
  });
  if(shielded){
   await new Promise((done,reject)=>{
    gateway.server.once('error',reject);
    gateway.server.listen(54319,'127.0.0.1',done);
   });
  }
  child=spawn('alloy',['run','--disable-reporting',
   '--stability.level=public-preview',
   '--server.http.listen-addr=127.0.0.1:'+UI_PORT,
   '--storage.path='+storage,config],{
    env:{...process.env,GAFUS_NONPROD_UPTRACE_DSN:dsn,
     ...(shielded?{GAFUS_NONPROD_ACK_GATEWAY_TOKEN:internalToken}:{})},
    stdio:['ignore','pipe','pipe'],
  });
  child.stdout.on('data',chunk=>{logTail=(logTail+chunk.toString()).slice(-3500);});
  child.stderr.on('data',chunk=>{logTail=(logTail+chunk.toString()).slice(-3500);});
  await waitForIngest(trace,traceId);
  const response=await fetch('http://127.0.0.1:'+ALLOY_PORT+'/v1/logs',{
   method:'POST',headers:{'content-type':'application/json'},redirect:'error',
   signal:AbortSignal.timeout(3000),body:JSON.stringify(log),
  });
  if(!response.ok)throw Error('ALLOY_LOCAL_LOG_NOT_ACCEPTED');
  const cloud=await cloudReadback(viewer,traceId,startAt);
  const st=await stat(storage);
  const out={project:9383,collector:'grafana-alloy',
    portBinding:'127.0.0.1',localOtlpAccepted:true,
    localLogAccepted:true,storageDirectoryCreated:st.isDirectory(),
    cloudReadback:cloud,shielded,
    ...(shielded?{
     gatewayUp:!gateway.state.unhealthy,
     gatewayAccepted:gateway.state.accepted,
     gatewayAuthBlocked:gateway.state.authBlocked,
    }:{}),
    fullPass:Object.values(cloud).every(Boolean)&&
     (!shielded||(!gateway.state.unhealthy&&gateway.state.accepted>=2))};
  console.log(JSON.stringify(out));
  if(!out.fullPass)process.exitCode=3;
 }catch(error){
  const safe=String(error.message).startsWith('ALLOY_LOCAL_')?error.message:'ISOLATED_ALLOY_RUNTIME_ERROR';
  console.error(safe);
  process.exitCode=4;
 }finally{
  await stop(child);
  await new Promise(done=>http.close(()=>done()));
  if(gateway)await new Promise(done=>gateway.server.close(()=>done()));
  if(root.startsWith(join(tmpdir(),'gafus-alloy-nonprod-')))
   await rm(root,{recursive:true,force:true});
 }
}
await run();
