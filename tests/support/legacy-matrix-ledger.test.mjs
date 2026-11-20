import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  root, discoverLegacyRegression, discoverLegacyFaults,
  discoverAcceptance, parseLegacyResults,
} from '../../scripts/qa/legacy-matrix-ledger.mjs';

const source = name => readFileSync(join(root,name),'utf8');
const expected = discoverLegacyRegression(source('scripts/qa/architecture-final-regression.sh'));

test('exact 33 original architecture stage IDs remain unique and distinguishable',()=>{
  assert.equal(expected.length,33);
  assert.equal(expected.filter(x=>x.startsWith('test-')).length,25);
  assert(expected.includes('web'));
  assert(expected.includes('architecture'));
  assert(expected.includes('whitespace'));
  assert(!expected.includes('no-such-phase'));
});

test('actual chaos script contains ten registered cases, distinct from original five-stage baseline',()=>{
  const cases=discoverLegacyFaults(source('scripts/qa/architecture-chaos-local.sh'));
  assert.equal(cases.length,10);
  assert(cases.some(x=>x.id==='training-atomic-pg'));
  assert(cases.some(x=>x.id==='backup-restore-pg'));
  assert(cases.every(x=>x.script.startsWith('scripts/qa/')&&x.script.endsWith('.sh')));
});

test('all 18 acceptance rows have an owner and an original user-provided architecture source',()=>{
  const rows=discoverAcceptance(
    source('docs/audit/gafus-agent-1-architecture-20261111.md'),
    source('docs/audit/gafus-agent-2-observability-20261111.md'),
    source('docs/audit/gafus-agent-3-reliability-20261111.md'),
  );
  assert.deepEqual(rows.map(x=>x.id),Array.from({length:18},(_,i)=>i+1));
  assert.equal(rows.filter(x=>x.owner==='agent-1').length,4);
  assert.equal(rows.filter(x=>x.owner==='agent-2').length,2);
  assert.equal(rows.filter(x=>x.owner==='agent-3').length,12);
  assert(rows.every(x=>x.requirement.length>20&&x.status==='pending-full-acceptance'));
});

test('missing historical result is not a PASS for the current candidate',()=>{
  const out=parseLegacyResults('architecture\tPASS\nworkspace-graph\tFAIL exit=1\n',expected);
  assert.equal(out.length,33);
  assert.equal(out.filter(x=>x.status==='historical-pass').length,1);
  assert.equal(out.filter(x=>x.status==='historical-fail').length,1);
  assert.equal(out.filter(x=>x.status==='not-executed').length,31);
});

test('duplicates, fabricated stages or unrecognized statuses fail closed',()=>{
  assert.throws(()=>parseLegacyResults('architecture\tPASS\narchitecture\tPASS\n',expected),/DUPLICATE_LEGACY_RESULT/);
  assert.throws(()=>parseLegacyResults('fabricated-stage\tPASS\n',expected),/UNEXPECTED_OR_UNMAPPED/);
  assert.throws(()=>parseLegacyResults('architecture\tSKIP\n',expected),/UNKNOWN_LEGACY_RESULT/);
});

test('all ten independently named chaos results retain source IDs; missing is not PASS',()=>{
  const names=discoverLegacyFaults(source('scripts/qa/architecture-chaos-local.sh')).map(x=>x.id);
  const statuses=parseLegacyResults(names.slice(0,9).map(name=>name+'\tPASS').join('\n')+'\n',names);
  assert.equal(statuses.filter(x=>x.status==='historical-pass').length,9);
  assert.equal(statuses.filter(x=>x.status==='not-executed').length,1);
  assert.throws(()=>parseLegacyResults(
    names.map(name=>name+'\tPASS').join('\n')+'\n'+names[0]+'\tPASS\n',names),
    /DUPLICATE_LEGACY_RESULT/);
  assert.throws(()=>parseLegacyResults('no-such-fault\tPASS\n',names),
    /UNEXPECTED_OR_UNMAPPED/);
});


test('legacy child clears inherited report variables before invoking nested tests', () => {
  const source = readFileSync(join(root, 'scripts/qa/run-legacy-matrix.mjs'), 'utf8');
  assert.match(source, /delete childEnv\.GAFUS_TEST_REPORT_PATH;/);
  assert.match(source, /delete childEnv\.VITEST_REPORT_PATH;/);
  assert.match(source, /env:childEnv/);
  assert.match(source, /writeFileSync\(report,.*flag:'wx'/);
});
