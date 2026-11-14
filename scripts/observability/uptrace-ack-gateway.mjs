#!/usr/bin/env node
/**
 * GAFUS nonprod-only LOCAL Uptrace ACK gateway.
 *
 * Durable replay belongs to Alloy's file-storage queue / Prometheus WAL.
 * This gateway acknowledges ONLY Uptrace-confirmed exports. Crucially, Uptrace
 * 401/403 and any unrecognised upstream failure become retryable HTTP 503,
 * avoiding OTLP exporter's otherwise permanent/drop-on-auth behavior.
 *
 * This service is an UNDEPLOYED preview candidate. Never expose to the Internet,
 * never send its private internal token to Uptrace or client/mobile bundles.
 */
import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const ENDPOINT='https://api.uptrace.dev';
const ALLOWED=new Set(['/v1/logs','/v1/traces','/v1/metrics','/api/v1/prometheus/write']);
const LOCAL_HEADER='x-gafus-ack-gateway-token';
const MAX_BODY=8*1024*1024;
const MAX_RESPONSE=8*1024;
const FAIL_BODY='upstream acknowledgement not confirmed';
const secretPattern=/^[A-Za-z0-9_-]{32,128}$/;

function validInternalAuth(provided,expected){
 if(typeof provided!=='string'||typeof expected!=='string'||provided.length!==expected.length)return false;
 const l=Buffer.from(provided),r=Buffer.from(expected);
 return l.length===r.length&&timingSafeEqual(l,r);
}
function err503(res){
 res.writeHead(503,{'content-type':'text/plain','cache-control':'no-store'});
 res.end(FAIL_BODY);
}
function collectedMetrics(state){
 return [
  '# HELP gafus_uptrace_ack_gateway_up Last upstream export succeeded or no failure occurred',
  '# TYPE gafus_uptrace_ack_gateway_up gauge',
  'gafus_uptrace_ack_gateway_up '+(state.unhealthy?0:1),
  '# TYPE gafus_uptrace_ack_gateway_auth_blocked gauge',
  'gafus_uptrace_ack_gateway_auth_blocked '+(state.authBlocked?1:0),
  '# TYPE gafus_uptrace_ack_gateway_success_total counter',
  'gafus_uptrace_ack_gateway_success_total '+state.accepted,
  '# TYPE gafus_uptrace_ack_gateway_rejected_total counter',
  'gafus_uptrace_ack_gateway_rejected_total '+state.rejected,
  '# TYPE gafus_uptrace_ack_gateway_inflight gauge',
  'gafus_uptrace_ack_gateway_inflight '+state.inflight,
  '',
 ].join('\n');
}
async function readBoundedResponse(response){
 const declared=response.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_RESPONSE))
  throw Error('UPSTREAM_RESPONSE_TOO_LARGE');
 if(!response.body)return Buffer.alloc(0);
 const reader=response.body.getReader();
 const chunks=[];
 let length=0;
 let finished=false;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done){finished=true;break;}
   length+=value.byteLength;
   if(length>MAX_RESPONSE)throw Error('UPSTREAM_RESPONSE_TOO_LARGE');
   chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks,length);
 }finally{
  if(!finished)await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}
async function readBoundedBody(request){
 const declared=request.headers['content-length'];
 if(typeof declared==='string'&&(!/^\d{1,8}$/.test(declared)||Number(declared)>MAX_BODY))
   throw Error('REQUEST_BODY_TOO_LARGE');
 let length=0;
 const chunks=[];
 for await(const chunk of request){
  length+=chunk.length;
  if(length>MAX_BODY)throw Error('REQUEST_BODY_TOO_LARGE');
  chunks.push(chunk);
 }
 if(!length)throw Error('REQUEST_BODY_EMPTY');
 return Buffer.concat(chunks,length);
}
export function createUptraceAckGateway({
  dsn,internalToken,fetchImpl=fetch,
  upstream=ENDPOINT,maxInflight=8,
}={}){
 if(!dsn||dsn.length<12||dsn.length>4096||/[\r\n\x00-\x1f]/.test(dsn)||
    !secretPattern.test(internalToken??'')||
    !Number.isSafeInteger(maxInflight)||maxInflight<1||maxInflight>32)
   throw Error('ACK_GATEWAY_INVALID_CONFIGURATION');
 // The only non-cloud target is dependency-injected for hermetic tests.
 // Runtime CLI below always pins the real official Uptrace Cloud host.
 if(!/^https:\/\/api\.uptrace\.dev$/.test(upstream) &&
    !/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(upstream))
   throw Error('ACK_GATEWAY_UPSTREAM_NOT_ALLOWLISTED');
 const state={unhealthy:true,authBlocked:false,accepted:0,rejected:0,inflight:0};
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if((req.url==='/livez'||req.url==='/healthz'||req.url==='/metrics')&&req.method==='GET'){
   if(req.url==='/livez'){
    res.writeHead(200,{'content-type':'text/plain'});res.end('alive');
   }else if(req.url==='/healthz'){
    const status=state.unhealthy?503:200;
    res.writeHead(status,{'content-type':'text/plain'});res.end(state.unhealthy?'blocked':'ok');
   }else{
    res.writeHead(200,{'content-type':'text/plain; version=0.0.4'});
    res.end(collectedMetrics(state));
   }
   return;
  }
  if(req.method!=='POST'||!ALLOWED.has(req.url??'')){
   res.writeHead(404,{'content-type':'text/plain'});res.end('not found');return;
  }
  if(!validInternalAuth(req.headers[LOCAL_HEADER],internalToken)||state.inflight>=maxInflight){
   state.rejected++;err503(res);return;
  }
  state.inflight++;
  try{
   const body=await readBoundedBody(req);
   const contentType=req.headers['content-type'];
   if(typeof contentType!=='string'||
     !/^(application\/(x-protobuf|json)|application\/vnd\.google\.protobuf)(?:\s*;.*)?$/i.test(contentType))
     throw Error('UNSUPPORTED_CONTENT_TYPE');
   const headers={
    'content-type':contentType,
    'uptrace-dsn':dsn,
   };
   const contentEncoding=req.headers['content-encoding'];
   if(typeof contentEncoding==='string'){
    if(!['snappy','gzip','identity'].includes(contentEncoding.toLowerCase()))
     throw Error('UNSUPPORTED_CONTENT_ENCODING');
    headers['content-encoding']=contentEncoding;
   }
   if(req.url==='/api/v1/prometheus/write'){
    const wireVersion=req.headers['x-prometheus-remote-write-version'];
    if(typeof wireVersion==='string'&&/^0\.\d+\.\d+$/.test(wireVersion))
      headers['x-prometheus-remote-write-version']=wireVersion;
   }
   const response=await fetchImpl(upstream+req.url,{
    method:'POST',headers,body,redirect:'error',signal:AbortSignal.timeout(5000),
   });
   if(!response.ok){
    void response.body?.cancel();
    state.unhealthy=true;
    if(response.status===401||response.status===403)state.authBlocked=true;
    state.rejected++;err503(res);return;
   }
   // A success is confirmed by Uptrace, not merely a local queue write.
   // Forward upstream's OTLP response unchanged so Alloy can interpret
   // partialSuccess. Do not incorrectly ACK malformed or oversized bodies.
   // Read at most 8 KiB even if upstream lies about Content-Length or streams
   // an endless 2xx body. A broken ACK must never amplify into an OOM.
   const responseBytes=await readBoundedResponse(response);
   // PartialSuccess 200 can contain rejected observations. Alloy might treat
   // these as committed, so NEVER issue a success for any partial rejection.
   // A non-empty protobuf ACK cannot be decoded without a schema: fail closed.
   const ackType=response.headers.get('content-type')?.toLowerCase().split(';')[0];
   if(ackType&&!['application/json','application/x-protobuf',
     'application/vnd.google.protobuf','application/octet-stream'].includes(ackType)){
    state.rejected++;state.unhealthy=true;err503(res);return;
   }
   if(responseBytes.length){
    if(ackType!=='application/json'){
      state.rejected++;state.unhealthy=true;err503(res);return;
    }
    let ack;
    try{ack=JSON.parse(responseBytes.toString('utf8'));}
    catch{state.rejected++;state.unhealthy=true;err503(res);return;}
    if(!ack||typeof ack!=='object'||Array.isArray(ack)||
       Object.keys(ack).some(key=>!['partialSuccess'].includes(key))){
      state.rejected++;state.unhealthy=true;err503(res);return;
    }
    const partial=ack.partialSuccess;
    if(partial!==undefined){
      if(!partial||typeof partial!=='object'||Array.isArray(partial)){
        state.rejected++;state.unhealthy=true;err503(res);return;
      }
      const allowedKeys=new Set(['rejectedLogRecords','rejectedSpans',
        'rejectedDataPoints','errorMessage']);
      const counts=['rejectedLogRecords','rejectedSpans','rejectedDataPoints']
        .map(key=>partial[key]??0)
        .map(value=>typeof value==='string'?Number(value):value);
      if(Object.keys(partial).some(key=>!allowedKeys.has(key))||
         (partial.errorMessage!==undefined&&partial.errorMessage!=='')||
         counts.some(value=>!Number.isSafeInteger(value)||value!==0)){
        state.rejected++;state.unhealthy=true;err503(res);return;
      }
    }
   }
   state.unhealthy=false;state.authBlocked=false;state.accepted++;
   const responseHeaders={'cache-control':'no-store'};
   const responseType=response.headers.get('content-type');
   if(responseType&&/^[a-z][a-z0-9+./_-]{1,80}(?:;\s*charset=[A-Za-z0-9-]+)?$/i.test(responseType))
    responseHeaders['content-type']=responseType;
   res.writeHead(response.status,responseHeaders);
   res.end(responseBytes);
  }catch{
   state.rejected++;state.unhealthy=true;err503(res);
  }finally{state.inflight--;}
 });
 return {server,state};
}
async function readOwnerOnly(path){
 const st=await lstat(path);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.size>4096||st.size<12||
    st.uid!==process.getuid())throw Error('ACK_GATEWAY_PRIVATE_FILE_REQUIRED');
 return (await readFile(path,'utf8')).trim();
}
async function main(){
 if(process.env.GAFUS_TELEMETRY_ENVIRONMENT!=='preview'||
    process.env.GAFUS_UPTRACE_ACK_GATEWAY_ENABLED!=='true')
   throw Error('ACK_GATEWAY_NONPROD_GATE_REQUIRED');
 const dir=join(homedir(),'.config/gafus-observability');
 // Containers may mount individual 0600 files rather than exposing the
 // entire host config directory. A supplied path must stay inside /run/secrets.
 const readSecret=async(name,env)=>{
  const configured=process.env[env];
  if(configured&&(!/^\/run\/secrets\/[A-Za-z0-9_.-]+$/.test(configured)))
   throw Error('ACK_GATEWAY_SECRET_PATH_NOT_ALLOWED');
  return readOwnerOnly(configured??join(dir,name));
 };
 const dsn=await readSecret('uptrace-nonprod-ingest.dsn',
  'GAFUS_UPTRACE_ACK_GATEWAY_DSN_FILE');
 const internalToken=await readSecret('uptrace-nonprod-ack-gateway.token',
  'GAFUS_UPTRACE_ACK_GATEWAY_TOKEN_FILE');
 const {server}=createUptraceAckGateway({dsn,internalToken});
 server.listen(54319,'127.0.0.1');
 process.once('SIGTERM',()=>server.close());
 process.once('SIGINT',()=>server.close());
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(()=>{console.error('ACK_GATEWAY_PREVIEW_START_BLOCKED');process.exitCode=4;});
