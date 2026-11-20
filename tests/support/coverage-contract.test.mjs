import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCoverage} from './coverage-contract.mjs';
import { coverageVitestArgs } from '../../scripts/qa/coverage-args.mjs';
const valid={total:{lines:{total:95,covered:40},branches:{total:102,covered:34}}, '/local/packages/core-client/src/utils/training.ts':{lines:{total:95,covered:40},branches:{total:102,covered:34}}};
test('real source and denominator are accepted',()=>assert.equal(verifyCoverage(valid,['packages/core-client/src/utils/training.ts']).valid,true));
test('empty denominator never counts as full coverage',()=>assert.equal(verifyCoverage({total:{lines:{total:0,covered:0,pct:100},branches:{total:0,covered:0,pct:100}}},['packages/core-client/src/utils/training.ts']).valid,false));
test('wrong path and zero branches invalidate',()=>{
 assert.equal(verifyCoverage(valid,['packages/core/src/utils/training.ts']).valid,false);
 assert.equal(verifyCoverage({...valid,total:{...valid.total,branches:{total:0,covered:0}}},['packages/core-client/src/utils/training.ts']).valid,false);
});
test('corrupt counters and absent source list fail',()=>{
 assert.equal(verifyCoverage({...valid,total:{lines:{total:10,covered:11},branches:valid.total.branches}},['packages/core-client/src/utils/training.ts']).valid,false);
 assert.equal(verifyCoverage(valid,[]).valid,false);
});


test('real package coverage keeps its own include/exclude rules and thresholds', () => {
  for (const folder of ['packages/csrf','packages/reengagement','packages/worker','apps/mobile']) {
    const args = coverageVitestArgs({ directory: '/tmp/qa-artifact-'+folder.replace('/','-') });
    assert(args.includes('--coverage.enabled'));
    assert(args.includes('--coverage.reporter=json'));
    assert(!args.some(arg => arg.startsWith('--coverage.include=') || arg.startsWith('--coverage.exclude=')),
      'runner must not widen instrumented source for '+folder);
  }
});
test('sharded Web coverage measures unimported sources only on first group', () => {
  const first = coverageVitestArgs({ files: ['src/a.test.ts'], web: true, index: 0, directory: '/tmp/first' });
  const next = coverageVitestArgs({ files: ['src/b.test.ts'], web: true, index: 1, directory: '/tmp/next' });
  assert(first.some(arg => arg.startsWith('--coverage.include=src/')));
  assert(!next.some(arg => arg.startsWith('--coverage.include=')));
  assert(next.some(arg => arg.startsWith('--coverage.exclude=**/*.{test,spec}')));
  assert(next.includes('--maxWorkers=1'));
  assert.throws(()=>coverageVitestArgs({}), /Missing coverage artifact directory/);
});
