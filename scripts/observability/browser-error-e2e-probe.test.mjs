import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeProbeEvents,probeBrowserErrors,serviceOrigins} from './browser-error-e2e-probe.mjs';
const release={service:'gafus-web',appVersion:'1.7.3',build:'a'.repeat(40)};
test('synthetic browser categories are bounded, immutable and anonymous',()=>{
 const events=makeProbeEvents(release);
 assert.deepEqual(events.map(x=>x.kind),['react_error','js_handled','promise_rejection','network_failure']);
 assert.equal(new Set(events.map(x=>x.eventId)).size,4);
 for(const event of events){assert.equal(event.build,release.build);assert.equal(event.platform,'web');
  assert(!/secret|device|user|@|https?:\/\//i.test(JSON.stringify(event)));}
});
test('probe refuses unknown services, bad release and implicit production writes',async()=>{
 let called=0;const fake=()=>{called++;throw Error('SHOULD_NOT_EXECUTE')};
 await assert.rejects(probeBrowserErrors({...release,fetchImpl:fake}),/WEB_PROBE_EXPLICIT_APPROVAL_REQUIRED/);
 await assert.rejects(probeBrowserErrors({...release,execute:true,fetchImpl:fake}),/WEB_PROBE_EXPLICIT_APPROVAL_REQUIRED/);
 assert.equal(called,0);
 assert.throws(()=>makeProbeEvents({...release,service:'evil'}),/WEB_PROBE_RELEASE_INVALID/);
 assert.throws(()=>makeProbeEvents({...release,build:'release-latest'}),/WEB_PROBE_RELEASE_INVALID/);
 assert.equal(Object.keys(serviceOrigins).length,4);
});
test('probe checks same-origin session and all four durable event acknowledgements',async()=>{
 let count=0;let submitted=[];
 const fake=async (url,init)=>{
  count++;assert(url.startsWith('https://gafus.ru/api/v1/telemetry/web'));
  assert.equal(init.headers.Origin,'https://gafus.ru');
  assert.equal(init.headers['Sec-Fetch-Site'],'same-origin');
  assert.equal(init.redirect,'error');
  if(count===1) {
   assert(url.endsWith('/session'));
   return {status:201,json:async()=>({token:'b'.repeat(43),maxEvents:50})};
  }
  assert.equal(init.headers.Authorization,'Bearer '+'b'.repeat(43));
  submitted=JSON.parse(init.body).events;
  return {status:200,json:async()=>({accepted:submitted.map(e=>e.eventId),newlyInserted:4})};
 };
 const result=await probeBrowserErrors({...release,execute:true,approved:true,fetchImpl:fake});
 assert.equal(count,2);assert.equal(result.accepted,4);assert.equal(result.durableAck,true);
});
test('missing or partial ACK fails closed',async()=>{
 let count=0;
 const fake=async ()=>++count===1
  ?{status:201,json:async()=>({token:'x'.repeat(43),maxEvents:50})}
  :{status:200,json:async()=>({accepted:[]})};
 await assert.rejects(probeBrowserErrors({...release,execute:true,approved:true,fetchImpl:fake}),
  /WEB_PROBE_ACK_INCOMPLETE/);
});
