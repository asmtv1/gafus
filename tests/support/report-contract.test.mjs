import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRun } from './report-contract.mjs';
const task = { id: 'training.complete.pg', platform: 'node', part: 'isolated-pg', expectedCases: ['rollback', 'concurrent'] };
const plan = { runId: 'qa-1', commit: 'sha', fingerprint: 'hash', tasks: [task] };
const receipt = { id: task.id, platform: task.platform, part: task.part,
  runId: 'qa-1', commit: 'sha', fingerprint: 'hash', attempt: 1, status: 'passed',
  evidencePath: '/tmp/qa-1/tests.json', cases: [{name:'rollback',status:'passed'},{name:'concurrent',status:'passed'}] };
test('matching complete evidence succeeds', () => assert.equal(evaluateRun(plan, [receipt]).code, 0));
test('failed assertion is status 1', () => assert.equal(evaluateRun(plan, [{ ...receipt, status: 'failed' }]).code, 1));
test('missing piece is status 2', () => assert.equal(evaluateRun(plan, []).code, 2));
test('foreign commit is status 2', () => assert.equal(evaluateRun(plan, [{ ...receipt, commit: 'wrong' }]).code, 2));
test('mandatory skipped test is status 2', () => assert.equal(evaluateRun(plan,
  [{ ...receipt, cases: [{name: 'rollback', status:'skipped'},{name: 'concurrent', status:'passed'}] }]).code, 2));
test('duplicate result is status 2', () => assert.equal(evaluateRun(plan, [receipt, receipt]).code, 2));
test('empty mandatory plan is status 2', () => assert.equal(evaluateRun({...plan,tasks:[]}, []).code, 2));
test('document-only plan is allowed', () => assert.equal(evaluateRun({...plan,tasks:[],emptyReason:'documentation-only'}, []).code, 0));
test('a passing second attempt is visibly unstable, not a clean first-try pass',()=>{
  const r=evaluateRun(plan,[{...receipt,attempt:2}]);
  assert.equal(r.code,0);
  assert.deepEqual(r.unstableAttempts,[{id:task.id,attempt:2}]);
  assert.equal(r.outcomes[0].unstable,true);
});
test('a first-attempt pass has no instability flag',()=>{
  const r=evaluateRun(plan,[receipt]);
  assert.deepEqual(r.unstableAttempts,[]);
  assert.equal(r.outcomes[0].unstable,false);
});
