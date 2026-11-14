import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyMetricReadback,verifySpanAndLogReadback} from './uptrace-nonprod-acceptance.mjs';
test('readback requires fresh actual metric value instead of stale/empty series',()=>{
 const now=1_794_593_000_000;
 const value=(time,n)=>({status:'success',data:{result:[{value:[time,n]}]}});
 assert.equal(verifyMetricReadback(value(now/1000,'1'),now,now-1_000),true);
 assert.equal(verifyMetricReadback(value((now+750)/1000,'1'),now),true);
 assert.equal(verifyMetricReadback(value((now+90_000)/1000,'1'),now),false);
 assert.equal(verifyMetricReadback(value((now-60_000)/1000,'1'),now,now),false);
 assert.equal(verifyMetricReadback(value((now-3600_000)/1000,'1'),now),false);
 assert.equal(verifyMetricReadback(value(now/1000,'0'),now),false);
 assert.equal(verifyMetricReadback({status:'success',data:{result:[]}},now),false);
});
test('must read both a named trace and synthetic log from Uptrace',()=>{
 const trace='a'.repeat(32);
 assert.deepEqual(verifySpanAndLogReadback({spans:[]},trace),{trace:false,log:false});
 assert.deepEqual(verifySpanAndLogReadback({spans:[
  {traceId:trace,name:'gafus.nonprod.canary.trace'},
  {traceId:trace,name:'GAFUS_NONPROD_SYNTHETIC_ERROR'},
 ]},trace),{trace:true,log:true});
 assert.deepEqual(verifySpanAndLogReadback({spans:[
  {traceId:'b'.repeat(32),name:'gafus.nonprod.canary.trace'},
  {traceId:'b'.repeat(32),name:'GAFUS_NONPROD_SYNTHETIC_ERROR'},
 ]},trace),{trace:false,log:false});
 assert.deepEqual(verifySpanAndLogReadback({spans:[{traceId:trace,name:'gafus.nonprod.canary.trace'}]},trace),
  {trace:true,log:false});
});
