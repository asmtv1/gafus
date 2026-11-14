#!/usr/bin/env node
/**
 * Hermetic queue survival test: simulate a rejected upstream, crash ONLY the
 * newly spawned localhost Alloy process, restart with same private data volume,
 * observe the OLD one-shot OTLP trace+log delivered exactly to a fake server.
 * No real Uptrace/production token, service or account can be accessed.
 */
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createUptraceAckGateway} from './uptrace-ack-gateway.mjs';
const failureCode=process.argv[2]===undefined?503:Number(process.argv[2]);
if(![401,403,429,503].includes(failureCode))throw Error('RECOVERY_UNSUPPORTED_REJECTION');
const authFailure=[401,403].includes(failureCode);
const shieldMode=process.argv[3]==='--shield';
if(shieldMode&&!authFailure)throw Error('RECOVERY_SHIELD_ONLY_AUTH_TESTS');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const TRACE_MARKER='gafus.alloy.recovery.trace';
const LOG_MARKER='GAFUS_ALLOY_PERSISTENT_QUEUE_RESTART_TEST';
const httpUrl='http://127.0.0.1:54318';
const httpUi='127.0.0.1:52999';
const otlpUpstream=55242,metricUpstream=55243;
function signalPayload() {
 const traceId=randomBytes(16).toString('hex'),spanId=randomBytes(8).toString('hex');
 const t=(BigInt(Date.now())*1000000n).toString();
 const resource={attributes:[{key:'service.name',value:{stringValue:'gafus-alloy-recovery-e2e'}}]};
 return {
  trace:{resourceSpans:[{resource,scopeSpans:[{scope:{name:'recovery-test'},
   spans:[{name:TRACE_MARKER,traceId,spanId,kind:1,startTimeUnixNano:t,
    endTimeUnixNano:(BigInt(t)+1000000n).toString()}]}]}]},
  log:{resourceLogs:[{resource,scopeLogs:[{scope:{name:'recovery-test'},
   logRecords:[{timeUnixNano:t,traceId,spanId,severityNumber:17,
    body:{stringValue:LOG_MARKER}}]}]}]},
 };
}
function startServer(port,handler) {
 return new Promise((resolve,reject)=>{
  const server=createServer(handler);
  server.once('error',reject);
  server.listen(port,'127.0.0.1',()=>resolve(server));
 });
}
function closeServer(server) {
 return new Promise(done=>server.close(()=>done()));
}
async function stop(child,signal='SIGTERM'){
 if(!child || child.exitCode!==null || child.signalCode!==null)return;
 child.kill(signal);
 await Promise.race([new Promise(r=>child.once('exit',r)),sleep(9000)]);
 if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
}
async function inject(endpoint,payload){
 for(let attempts=0;attempts<50;attempts++){
  try{
   const r=await fetch(httpUrl+endpoint,{
    method:'POST',headers:{'content-type':'application/json'},redirect:'error',
    signal:AbortSignal.timeout(1500),body:JSON.stringify(payload),
   });
   if(r.ok)return;
  }catch{}
  await sleep(250);
 }
 throw Error('RECOVERY_LOCAL_RECEIVER_NOT_READY');
}
async function run(){
 const scope=await mkdtemp(join(tmpdir(),'gafus-alloy-queue-'));
 const storage=join(scope,'private-storage'),file=join(scope,'canary.alloy');
 const source=await readFile(resolve(
  'ci-cd/observability/uptrace/'+(shieldMode?'alloy.nonprod-ack-gateway.alloy':'alloy.nonprod-isolated.alloy')
 ),'utf8');
 let config=shieldMode?source:source.replace(
  'endpoint = "https://api.uptrace.dev"',
  'endpoint = "http://127.0.0.1:'+otlpUpstream+'"'
 ).replace(
  'url = "https://api.uptrace.dev/api/v1/prometheus/write"',
  'url = "http://127.0.0.1:'+metricUpstream+'/api/v1/prometheus/write"'
 );
 if((!shieldMode&&config===source)||
    (shieldMode&&!config.includes('127.0.0.1:54319'))||
    config.includes('api.uptrace.dev')||config.includes('monitoring.api.cloud.yandex'))
  throw Error('RECOVERY_FAKE_CLOUD_REWRITE_INCOMPLETE');
 await writeFile(file,config,{mode:0o600});
 const internalToken='SYNTHETIC_ACK_GATEWAY_SHARED_SECRET_123456789';
 const env={...process.env,GAFUS_NONPROD_UPTRACE_DSN:'SYNTHETIC_QUEUE_TEST_ONLY',
  GAFUS_NONPROD_ACK_GATEWAY_TOKEN:internalToken};
 let accepts=false;
 const deliveries=new Set();
 let rejects=0;
 const fakeOtlp=await startServer(otlpUpstream,(req,res)=>{
  const chunks=[];req.on('data',chunk=>chunks.push(chunk));
  req.on('end',()=>{
   const bytes=Buffer.concat(chunks);
   const body=(req.headers['content-encoding']==='gzip'?gunzipSync(bytes):bytes).toString('latin1');
   if(!accepts){rejects++;res.writeHead(failureCode,{'retry-after':'1'});res.end('retry');return;}
   if(req.url==='/v1/traces'&&body.includes(TRACE_MARKER))deliveries.add('trace');
   if(req.url==='/v1/logs'&&body.includes(LOG_MARKER))deliveries.add('log');
   res.writeHead(200,{'content-type':'application/json'});res.end('{}');
  });
 });
 const fakeMetrics=await startServer(metricUpstream,(req,res)=>{
  req.resume();res.writeHead(accepts?204:503);res.end();
 });
 const exporter=await startServer(59241,(req,res)=>{
  res.writeHead(200,{'content-type':'text/plain;version=0.0.4'});
  res.end('gafus_nonprod_alloy_probe 1\n');
 });
 let gateway=null;
 if(shieldMode){
   gateway=createUptraceAckGateway({
    dsn:'SYNTHETIC_QUEUE_TEST_ONLY',internalToken,
    upstream:'http://127.0.0.1:'+otlpUpstream,
   });
   await new Promise((done,reject)=>{
    gateway.server.once('error',reject);
    gateway.server.listen(54319,'127.0.0.1',done);
   });
 }
 let alloy=null,startedOnce=false,failed=false;
 const runAlloy=()=>spawn('alloy',['run','--disable-reporting',
  '--stability.level=public-preview','--server.http.listen-addr='+httpUi,
  '--storage.path='+storage,file],{stdio:['ignore','pipe','pipe'],env});
 try{
  const validate=spawn('alloy',['validate','--stability.level=public-preview',file],{
   stdio:['ignore','pipe','pipe'],env,
  });
  const status=await new Promise(resolve=>validate.on('exit',code=>resolve(code)));
  if(status!==0)throw Error('RECOVERY_CONFIG_INVALID');
  alloy=runAlloy();alloy.stdout.resume();alloy.stderr.resume();
  const {trace,log}=signalPayload();
  await inject('/v1/traces',trace);
  // A 600-KiB HTTP body exceeds the 512-KiB OTLP receiver limit. Even if
  // it contains no valid OTLP, it must be rejected BEFORE reaching exporter.
  const tooLarge=structuredClone(log);
  tooLarge.resourceLogs[0].scopeLogs[0].logRecords[0].body.stringValue='X'.repeat(600*1024);
  const oversized=await fetch(httpUrl+'/v1/logs',{
   method:'POST',headers:{'content-type':'application/json'},
   signal:AbortSignal.timeout(3000),body:JSON.stringify(tooLarge),
  });
  const feedback=(await oversized.text()).slice(0,250);
  // OTel collector maps resource-exhausted/invalid-argument to JSON/HTTP
  // 400 rather than the traditional 413. The actual size error must be
  // explicit and never acknowledged as 2xx.
  if(oversized.ok||!([400,413].includes(oversized.status))||
     !/request body too large/i.test(feedback))
    throw Error('RECOVERY_INGRESS_SIZE_LIMIT_FAILED_'+oversized.status);
  await inject('/v1/logs',log);
  // Verify an actual failed upstream send before forcefully terminating Alloy.
  for(let i=0;i<30&&!rejects;i++)await sleep(350);
  if(!rejects)throw Error('RECOVERY_NO_RETRYABLE_UPSTREAM_FAILURE');
  await sleep(1200);
  await stop(alloy,'SIGKILL'); // only our private spawned process
  alloy=null;startedOnce=true;
  const state=await stat(storage);
  if(!state.isDirectory())throw Error('RECOVERY_STORAGE_MISSING');
  accepts=true;
  alloy=runAlloy();alloy.stdout.resume();alloy.stderr.resume();
  for(let i=0;i<(authFailure&&!shieldMode?80:90)&&deliveries.size<2;i++)await sleep(350);
  const restored=deliveries.has('trace')&&deliveries.has('log');
  console.log(JSON.stringify({scope:'localhost-only',vendorNetwork:'mocked',
   test:shieldMode?'AUTH_SHIELD_DURABLE_REPLAY':
    authFailure?'OTLP_AUTH_FAILURE_OBSERVATION':'durable OTLP queue recovery',
   rejectedStatus:failureCode,firstRunUpstreamRejected:rejects>0,
   alloyRestarted:startedOnce,oversizedIngressRejected:true,
   traceRestored:deliveries.has('trace'),logRestored:deliveries.has('log'),
   ...(authFailure&&!shieldMode?{
     observedLoss:!restored,
     productionCutoverReady:false,
     reason:'AUTH_ERRORS_REQUIRE_MANUAL_REPAIR_AND_EXTERNAL_WATCHDOG',
   }:{
     pass:restored,
     ...(shieldMode?{
       gatewayAuthRecovered:gateway.state.authBlocked===false,
       remainingUnhealthy:gateway.state.unhealthy,
     }:{}),
   })}));
  if((!authFailure||shieldMode)&&!restored)process.exitCode=3;
 }catch(err){
  failed=true;console.error(String(err.message).startsWith('RECOVERY_')?err.message:'RECOVERY_TEST_FAILED');
  process.exitCode=4;
 }finally{
  await stop(alloy);
  await Promise.all([
   closeServer(fakeOtlp),closeServer(fakeMetrics),closeServer(exporter),
   ...(gateway?[closeServer(gateway.server)]:[]),
  ]);
  if(scope.startsWith(join(tmpdir(),'gafus-alloy-queue-')))
   await rm(scope,{recursive:true,force:true});
 }
}
await run();
