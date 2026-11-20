import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyFaultReport} from './fault-report.mjs';
const root='/project';
const file=root+'/packages/worker/src/media-cdn-purge-worker.real-pg.test.ts';
const task={id:'worker.failures.pg',kind:'faults',expectedCases:['SQL retry after timeout','no double submit after checkpoint']};
function fixture(){return {numFailedTests:0,numPendingTests:0,numPassedTests:2,
 testResults:[{name:file,assertionResults:[{fullName:'Worker SQL retry after timeout',status:'passed'},
 {fullName:'Worker no double submit after checkpoint',status:'passed'}]}]};}
test('named fault cases require exact source files, count and zero failed/skipped assertions',()=>{
 const v=verifyFaultReport(fixture(),task,root);
 assert.deepEqual(v.namedCases,task.expectedCases.map(name=>({name,status:'passed'})));
 assert.equal(v.validatedFiles,1);assert.equal(v.validatedAssertions,2);
});
test('fault receipt fails closed on absent/skipped/failing/duplicate/foreign results',()=>{
 for(const mutate of [
  x=>x.numPendingTests=1,x=>x.numFailedTests=1,x=>x.numPassedTests=0,
  x=>x.testResults[0].name='/other/file.ts',
  x=>x.testResults[0].assertionResults[1].status='skipped',
  x=>x.testResults[0].assertionResults[1].status='failed',
  x=>x.testResults[0].assertionResults[1].fullName=x.testResults[0].assertionResults[0].fullName,
  x=>x.testResults.push(x.testResults[0]),
 ]){const r=fixture();mutate(r);assert.throws(()=>verifyFaultReport(r,task,root));}
});
