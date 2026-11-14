import { test } from 'node:test';
import assert from 'node:assert/strict';
import {MOBILE_ALIASES,compareMobileSnapshots,verifyParityHistory} from './monitoring-parity.mjs';
const values=Object.fromEntries(MOBILE_ALIASES.map((name,i)=>[name,i<5?1:75]));
const time='2026-11-13T00:00:00.000Z';
const pair=(t,a=values,b=values)=>({
  yandex:{source:'yandex',time:t,values:a},
  uptrace:{source:'uptrace',time:t,values:b},
});
test('8 alias comparison is exact for probes and tolerant within 2% for gauges',()=>{
  const p=pair(time,values,{...values,gafus_ram_percent:76});
  assert.equal(compareMobileSnapshots(p.yandex,p.uptrace).passed,true);
  const fail=pair(time,values,{...values,gafus_api_up:0});
  assert.equal(compareMobileSnapshots(fail.yandex,fail.uptrace).passed,false);
});
test('absence of either source cannot pass as zero',()=>{
  const p=pair(time,values,{...values,gafus_ram_percent:null});
  assert.equal(compareMobileSnapshots(p.yandex,p.uptrace).passed,false);
  const invalid=pair(time,values,{...values,gafus_web_up:0.9});
  assert.throws(()=>compareMobileSnapshots(invalid.yandex,invalid.uptrace),/PARITY_PROBE_INVALID/);
});
test('14-day gate requires real coverage and no stale/gapped samples',()=>{
  const now=Date.parse('2026-11-14T00:00:00Z');
  assert.deepEqual(verifyParityHistory([],{now}).reason,'NO_EVIDENCE');
  assert.equal(verifyParityHistory([pair(time)],{now}).reason,'INSUFFICIENT_DAYS');
  const start=Date.parse('2026-10-31T00:00:00Z');
  const samples=Array.from({length:57},(_,i)=>pair(new Date(start+i*6*3600000).toISOString()));
  assert.equal(verifyParityHistory(samples,{now:Date.parse(samples.at(-1).yandex.time)}).passed,true);
  samples.splice(2,3);
  assert.equal(verifyParityHistory(samples,{now:Date.parse(samples.at(-1).yandex.time)}).reason,'GAP');
});

test('history refuses future-dated, duplicate and fabricated 14-day readiness',()=>{
  const start=Date.parse('2026-10-31T00:00:00Z');
  const samples=Array.from({length:57},(_,i)=>pair(new Date(start+i*6*3600000).toISOString()));
  const last=Date.parse(samples.at(-1).yandex.time);
  assert.equal(verifyParityHistory(samples,{now:last}).passed,true);
  assert.equal(verifyParityHistory(samples,{now:start}).reason,'FUTURE_EVIDENCE');
  assert.equal(verifyParityHistory([...samples,samples.at(-1)],{now:last}).reason,'DUPLICATE_TIME');
  assert.throws(()=>verifyParityHistory(samples,{now:last,minDays:0}),/PARITY_HISTORY_INVALID/);
  assert.throws(()=>verifyParityHistory(samples,{now:last,maxGapHours:100}),/PARITY_HISTORY_INVALID/);
  assert.throws(()=>compareMobileSnapshots(
    {...samples[0].yandex,time:'2026-10-31T00:00:00'},samples[0].uptrace
  ),/PARITY_SNAPSHOT_INVALID/);
});
