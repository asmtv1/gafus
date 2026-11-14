import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createUptraceAckGateway} from './uptrace-ack-gateway.mjs';
const DSN='SYNTHETIC_NONPROD_DSN_VALID_ONLY_123';
const TOKEN='SYNTHETIC_LOCAL_ACK_GATEWAY_SHARED_SECRET_123';
const headers={
 'x-gafus-ack-gateway-token':TOKEN,
 'content-type':'application/x-protobuf',
};
async function harness(t,fetchImpl){
 const {server,state}=createUptraceAckGateway({dsn:DSN,internalToken:TOKEN,
  upstream:'http://127.0.0.1:55242',fetchImpl});
 await new Promise((done,reject)=>{
  server.once('error',reject);server.listen(0,'127.0.0.1',done);
 });
 t.after(()=>new Promise(done=>server.close(done)));
 return {base:'http://127.0.0.1:'+server.address().port,state};
}
test('never 2xx-acknowledge Uptrace 401/403, expose local auth blockage',async t=>{
 let status=401;
 const sent=[];
 const {base,state}=await harness(t,async(url,init)=>{
  sent.push({url,headers:init.headers,body:Buffer.from(init.body),redirect:init.redirect});
  return status===200?new Response(null,{status:204}):new Response('',{status});
 });
 const otlp=async()=>fetch(base+'/v1/logs',{
  method:'POST',headers,body:Buffer.from([0x0a,0x00]),
 });
 assert.equal((await otlp()).status,503);
 assert.equal((await fetch(base+'/healthz')).status,503);
 assert.match(await (await fetch(base+'/metrics')).text(),
  /gafus_uptrace_ack_gateway_auth_blocked 1/);
 assert.equal(sent[0].url,'http://127.0.0.1:55242/v1/logs');
 assert.deepEqual(sent[0].body,Buffer.from([0x0a,0x00]));
 assert.equal(sent[0].headers['uptrace-dsn'],DSN);
 assert.equal(sent[0].headers['x-gafus-ack-gateway-token'],undefined);
 assert.equal(sent[0].redirect,'error');
 status=403;
 assert.equal((await otlp()).status,503);
 assert.equal(state.authBlocked,true);
 status=200;
 assert.equal((await otlp()).status,204);
 assert.equal((await fetch(base+'/healthz')).status,200);
 assert.match(await (await fetch(base+'/metrics')).text(),
  /gafus_uptrace_ack_gateway_auth_blocked 0/);
 assert.equal(state.accepted,1);
});
test('bounded upstream and client errors always cause RETRYABLE 503',async t=>{
 const codes=[429,500,400,503,404,302];
 let status=429;
 const {base}=await harness(t,async()=>new Response('',{status}));
 for(const code of codes){
  status=code;
  const response=await fetch(base+'/v1/traces',{
   method:'POST',headers,body:Buffer.from([0x08,0x02]),
  });
  assert.equal(response.status,503,'Upstream '+code+' must NOT ACK or cause Alloy permanent loss');
 }
});
test('a rogue or missing local secret never gets 401/403 from gateway',async t=>{
 let used=false;
 const {base}=await harness(t,async()=>{used=true;return new Response('',{status:200});});
 for(const candidate of [undefined,'WRONG_TOKEN_000000000000000000000000']){
  const outgoing={...headers};
  if(candidate)outgoing['x-gafus-ack-gateway-token']=candidate;
  else delete outgoing['x-gafus-ack-gateway-token'];
  const response=await fetch(base+'/v1/logs',{
   method:'POST',headers:outgoing,body:'{}',
  });
  assert.equal(response.status,503);
 }
 assert.equal(used,false);
 assert.equal((await fetch(base+'/unknown',{method:'POST'})).status,404);
});
test('Prometheus compression/version headers are strictly allowlisted',async t=>{
 let seen=null;
 const {base}=await harness(t,async(url,init)=>{
  seen={url,headers:init.headers,raw:Buffer.from(init.body)};
  return new Response(null,{status:204});
 });
 const bytes=Buffer.from([0xff,0x06,0x00,0x23]);
 const response=await fetch(base+'/api/v1/prometheus/write',{
  method:'POST',headers:{
   ...headers,
   'content-encoding':'snappy',
   'x-prometheus-remote-write-version':'0.1.0',
   'authorization':'Bearer PRIVATE_NOT_FOR_UPTRACE',
   'cookie':'session=PRIVATE',
  },body:bytes,
 });
 assert.equal(response.status,204);
 assert.equal(seen.url,'http://127.0.0.1:55242/api/v1/prometheus/write');
 assert.deepEqual(seen.raw,bytes);
 assert.equal(seen.headers['x-prometheus-remote-write-version'],'0.1.0');
 assert.equal(seen.headers['content-encoding'],'snappy');
 assert.equal(seen.headers['authorization'],undefined);
 assert.equal(seen.headers['cookie'],undefined);
});
test('network failure, bad MIME, oversized body and invalid client never ACK',async t=>{
 let used=0;
 const {base}=await harness(t,async()=>{used++;throw Error('Synthetic network outage');});
 for(const body of [Buffer.from([0x1]),Buffer.alloc(8*1024*1024+1,0x31)]){
  const response=await fetch(base+'/v1/logs',{method:'POST',headers,body});
  assert.equal(response.status,503);
 }
 const unsupported=await fetch(base+'/v1/logs',{
  method:'POST',headers:{...headers,'content-type':'text/plain'},body:'hello',
 });
 assert.equal(unsupported.status,503);
 assert.equal(used,1);
});
test('invalid runtime or unsafe upstream is refused before opening a server',()=>{
 assert.throws(()=>createUptraceAckGateway({dsn:DSN,internalToken:'short'}),/ACK_GATEWAY_INVALID_CONFIGURATION/);
 assert.throws(()=>createUptraceAckGateway({
  dsn:DSN,internalToken:TOKEN,upstream:'http://api.uptrace.dev',
 }),/ACK_GATEWAY_UPSTREAM_NOT_ALLOWLISTED/);
});

test('partial 200, HTML 200 and unknown protobuf ACK remain retryable',async t=>{
 let reply=new Response(JSON.stringify({partialSuccess:{rejectedLogRecords:1}}),
  {status:200,headers:{'content-type':'application/json'}});
 const {base,state}=await harness(t,async()=>reply);
 const send=()=>fetch(base+'/v1/logs',{
  method:'POST',headers,body:Buffer.from([0x08,0x01]),
 });
 assert.equal((await send()).status,503);
 assert.equal(state.unhealthy,true);
 reply=new Response(JSON.stringify({partialSuccess:{
  rejectedLogRecords:0,rejectedDataPoints:1,
 }}),{status:200,headers:{'content-type':'application/json'}});
 assert.equal((await send()).status,503);
 reply=new Response('<html>login</html>',{status:200,headers:{'content-type':'text/html'}});
 assert.equal((await send()).status,503);
 reply=new Response(Buffer.from([0x12,0x03,0x08,0x01]),{
  status:200,headers:{'content-type':'application/x-protobuf'},
 });
 assert.equal((await send()).status,503);
 reply=new Response('{}',{status:200,headers:{'content-type':'application/json'}});
 assert.equal((await send()).status,200);
 assert.equal(state.unhealthy,false);
 assert.equal(state.accepted,1);
});

test('liveness is distinct from upstream readiness so auth outage does not restart the gateway',async t=>{
 const {base}=await harness(t,async()=>new Response('',{status:401}));
 assert.equal((await fetch(base+'/livez')).status,200);
 assert.equal((await fetch(base+'/healthz')).status,503);
 const result=await fetch(base+'/v1/logs',{
  method:'POST',headers,body:Buffer.from([0x08,0x01]),
 });
 assert.equal(result.status,503);
 assert.equal((await fetch(base+'/livez')).status,200);
 assert.equal((await fetch(base+'/healthz')).status,503);
});

test('upstream response is truly streamed and capped at 8KiB, regardless of Content-Length',async t=>{
 let declared=false;
 const {base,state}=await harness(t,async()=>{
  const payload=new Uint8Array(9000).fill(0x78);
  return new Response(payload,{status:200,
   headers:declared?{'content-length':'9000','content-type':'application/json'}:
    {'content-type':'application/json'}});
 });
 const send=()=>fetch(base+'/v1/logs',{
  method:'POST',headers,body:Buffer.from([0x08,0x01]),
 });
 assert.equal((await send()).status,503);
 declared=true;
 assert.equal((await send()).status,503);
 assert.equal(state.accepted,0);
 assert.equal(state.unhealthy,true);
});

test('unknown partialSuccess fields, error strings and even empty HTML 2xx fail closed',async t=>{
 let reply=new Response(JSON.stringify({partialSuccess:{errorMessage:'synthetic data rejected'}}),
  {status:200,headers:{'content-type':'application/json'}});
 const {base,state}=await harness(t,async()=>reply);
 const send=()=>fetch(base+'/v1/logs',{
  method:'POST',headers,body:Buffer.from([0x08,0x01]),
 });
 assert.equal((await send()).status,503);
 reply=new Response(JSON.stringify({partialSuccess:{unknownField:1}}),
  {status:200,headers:{'content-type':'application/json'}});
 assert.equal((await send()).status,503);
 reply=new Response(null,{status:200,headers:{'content-type':'text/html'}});
 assert.equal((await send()).status,503);
 assert.equal(state.accepted,0);
});
