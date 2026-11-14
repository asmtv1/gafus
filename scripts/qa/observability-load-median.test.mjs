import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareWindows } from './observability-load-median.mjs';
const run = (n, p95, p99 = p95 * 1.5) => ({
  runId: `a2-obs-test-${n}`, environment:'loopback-only',
  targets:['loopback-target-0','loopback-target-1'],
  params:{durationSeconds:12,warmupSeconds:2,rate:30,concurrency:28,burstMultiplier:3,timeoutMs:1000},
  measured:{ errors:0,capacityDropRate:0,successes:400,
    perTarget:[{successes:200},{successes:200}],p95Ms:p95,p99Ms:p99 },
});
test('three predetermined windows use median and retain all raw measurements',()=>{
  const result=compareWindows([run(1,10),run(2,40),run(3,11)],
    [run(4,12),run(5,15),run(6,13)]);
  assert.equal(result.baseline.measured.p95Ms,11);
  assert.equal(result.candidate.measured.p95Ms,13);
  assert.equal(result.comparator.changeP95Percent,18.18);
  assert.equal(result.comparator.pass,true);
  assert.deepEqual(result.aggregation.baselineP95Ms,[10,40,11]);
  assert.deepEqual(result.aggregation.candidateP95Ms,[12,15,13]);
});
test('steady p95 regression above 20 percent fails, even if every request is 200',()=>{
  const result=compareWindows([run(1,10),run(2,11),run(3,12)],
    [run(4,14),run(5,15),run(6,16)]);
  assert.equal(result.comparator.changeP95Percent,36.36);
  assert.equal(result.comparator.pass,false);
});
test('any HTTP error, unmeasured replica or drifted workload blocks a pass',()=>{
  const a=[run(1,10),run(2,11),run(3,12)];
  const b=[run(4,12),run(5,13),run(6,14)];
  b[1].measured.errors=1;
  assert.throws(()=>compareWindows(a,b),/any HTTP failure/);
  b[1].measured.errors=0;
  b[1].measured.perTarget[1].successes=0;
  assert.throws(()=>compareWindows(a,b),/false|assert/i);
  b[1].measured.perTarget[1].successes=200;
  b[1].params.durationSeconds=13;
  assert.throws(()=>compareWindows(a,b),/profiles must be identical/);
});
