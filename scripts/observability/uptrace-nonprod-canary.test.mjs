import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runCanary} from './uptrace-nonprod-canary.mjs';
test('Nonprod canary sends exactly three bounded synthetic signals with no identifiers',async()=>{
 const bodies=[];
 const result=await runCanary({dsn:'TEST_NONPROD_DSN',fetchImpl:async(url,options)=>{
   assert.equal(new URL(url).host,'api.uptrace.dev');
   assert.equal(options.redirect,'error');
   const body=options.body;
   bodies.push(body);
   assert.doesNotMatch(body,/email|http.url|user_id|device_id|latitude|longitude|secret|phone/i);
   return new Response('{}',{status:200});
 }});
 assert.equal(result.project,9383);
 assert.equal(result.allAccepted,true);
 assert.deepEqual(Object.values(result.signals),[200,200,200]);
 assert.equal(bodies.length,3);
});
test('Canary fails closed if any signal is not accepted',async()=>{
 const result=await runCanary({dsn:'TEST_NONPROD_DSN',fetchImpl:async(url)=>{
   return new Response('',{status:url.endsWith('/v1/logs')?401:200});
 }});
 assert.equal(result.allAccepted,false);
 assert.equal(result.signalCount,2);
});
