/** Explicit, bounded synthetic browser-error delivery probe.
 * Never contacts a server without --execute AND GAFUS_WEB_PROBE_APPROVED=yes.
 * Does not simulate real user behavior or verify the Worker -> Uptrace readback. */
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const serviceOrigins=Object.freeze({
 'gafus-web':'https://gafus.ru',
 'gafus-admin-panel':'https://adminka.gafus.ru',
 'gafus-trainer-panel':'https://trainer-panel.gafus.ru',
 'gafus-bull-board':'https://queues.gafus.ru',
});
const kinds=Object.freeze([
 ['react_error','WEB_RENDER_ERROR'],
 ['js_handled','WEB_JS_ERROR'],
 ['promise_rejection','WEB_UNHANDLED_REJECTION'],
 ['network_failure','WEB_RESOURCE_LOAD'],
]);
const sha=/^[a-f0-9]{40}$/i;
const version=/^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const headers=origin=>({Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'});
const fail=(code)=>{throw Error(code);};
export function makeProbeEvents({service,build,appVersion}, now=()=>new Date()) {
 if(!Object.hasOwn(serviceOrigins,service)||!sha.test(build)||!version.test(appVersion))
  fail('WEB_PROBE_RELEASE_INVALID');
 const session=randomUUID();
 return kinds.map(([kind,errorCode])=>({
  schemaVersion:1,eventId:randomUUID(),appStartId:session,platform:'web',
  kind,severity:'ERROR',occurredAt:now().toISOString(),appVersion,build,
  runtime:build,channel:'web',updateId:'embedded',errorCode,
  stack:'at SyntheticUptraceProbe (bundle:11:4)',
 }));
}
export async function probeBrowserErrors({service,build,appVersion,execute=false,approved=false,fetchImpl=fetch}) {
 const events=makeProbeEvents({service,build,appVersion});
 if(!execute || !approved)fail('WEB_PROBE_EXPLICIT_APPROVAL_REQUIRED');
 const origin=serviceOrigins[service];
 const endpoint=origin+'/api/v1/telemetry/web';
 let grant;
 try {
  grant=await fetchImpl(endpoint+'/session',{method:'POST',headers:headers(origin),
   body:JSON.stringify({appVersion,build}),redirect:'error',signal:AbortSignal.timeout(8000)});
 }catch{fail('WEB_PROBE_SESSION_NETWORK_FAILURE');}
 if(grant.status!==201)fail('WEB_PROBE_SESSION_HTTP_'+grant.status);
 let authorization;
 try{
  const answer=await grant.json();
  if(typeof answer.token!=='string'||!/^[a-zA-Z0-9_-]{43}$/.test(answer.token)||answer.maxEvents<4)
   fail('WEB_PROBE_SESSION_INVALID');
  authorization=answer.token;
 }catch{fail('WEB_PROBE_SESSION_INVALID');}
 let upload;
 try{
  upload=await fetchImpl(endpoint,{method:'POST',headers:{...headers(origin),Authorization:'Bearer '+authorization},
   body:JSON.stringify({schemaVersion:1,events}),redirect:'error',signal:AbortSignal.timeout(8000)});
 }catch{fail('WEB_PROBE_BATCH_NETWORK_FAILURE');}
 if(upload.status!==200)fail('WEB_PROBE_BATCH_HTTP_'+upload.status);
 let reply;
 try{reply=await upload.json();}catch{fail('WEB_PROBE_ACK_INVALID');}
 const accepted=reply?.accepted;
 if(!Array.isArray(accepted)||accepted.length!==events.length||
    !events.every(event=>accepted.includes(event.eventId)))fail('WEB_PROBE_ACK_INCOMPLETE');
 return Object.freeze({service,build:build.slice(0,12),accepted:events.length,
  kinds:events.map(event=>event.kind),durableAck:true});
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const args=process.argv.slice(2),values={};let execute=false;
 for(let i=0;i<args.length;i++){
  const a=args[i];
  if(a==='--execute'){execute=true;continue;}
  if(!['--service','--build','--app-version'].includes(a)||!args[i+1]||args[i+1].startsWith('--')||a in values)
   fail('WEB_PROBE_ARGUMENT_INVALID');
  values[a]=args[++i];
 }
 probeBrowserErrors({service:values['--service'],build:values['--build'],appVersion:values['--app-version'],
  execute,approved:process.env.GAFUS_WEB_PROBE_APPROVED==='yes'})
  .then(result=>console.log(JSON.stringify(result)))
  .catch(error=>{console.error(error.message);process.exitCode=2;});
}
