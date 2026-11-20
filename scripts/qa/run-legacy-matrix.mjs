#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { discoverLegacyRegression, discoverLegacyFaults, parseLegacyResults } from './legacy-matrix-ledger.mjs';

const root = resolve(import.meta.dirname, '../..');
async function main() {
  const mode = process.argv[2];
  const report = process.env.GAFUS_TEST_REPORT_PATH;
  if (!['regression','faults'].includes(mode) || !report || resolve(report) !== report ||
      !report.startsWith(join(root,'.qa/testing')+'/') || !report.endsWith('/tests.json')) {
    throw Error('Expected a test-system output path and a registered legacy suite');
  }
  const script = mode === 'regression' ? 'architecture-final-regression.sh' : 'architecture-chaos-local.sh';
  const source = readFileSync(join(root,'scripts/qa',script),'utf8');
  const expected = mode === 'regression' ? discoverLegacyRegression(source) :
    discoverLegacyFaults(source).map(({id})=>id);
  const runId = 'matrix-'+randomBytes(8).toString('hex');
  const artifactDir = join(dirname(report),'legacy');
  // The test-system owns its top-level tests.json receipt. Nested Vitest
  // processes must use their own output paths (or stdout), never inherit the
  // outer report location: doing so erases filename evidence and later makes
  // writeFileSync(..., { flag: 'wx' }) reject a legitimate successful run.
  const childEnv = {...process.env, GAFUS_LEGACY_QA_OUTPUT_ROOT:artifactDir};
  delete childEnv.GAFUS_TEST_REPORT_PATH;
  delete childEnv.VITEST_REPORT_PATH;
  const child = spawn('bash',[join(root,'scripts/qa',script),runId],{
    cwd:root, stdio:'inherit', detached:true, env:childEnv,
  });
  const cancel = () => {
    if (child.pid) {
      try { process.kill(-child.pid,'SIGTERM'); } catch (error) {
        if (error.code !== 'ESRCH') console.error(error.message);
      }
    }
  };
  process.once('SIGINT',cancel);
  process.once('SIGTERM',cancel);
  const exit = await new Promise((done) => {
    child.once('error',()=>done(null));
    child.once('close',done);
  });
  process.removeListener('SIGINT',cancel);
  process.removeListener('SIGTERM',cancel);
  const file = join(artifactDir,runId,mode === 'regression'?'results.tsv':'chaos-results.tsv');
  if (exit === null || !existsSync(file)) throw Error('Legacy runner did not produce a result');
  const body = readFileSync(file,'utf8');
  const cases = parseLegacyResults(body,expected).map(({id,status}) => ({
    title:id, fullName:id,
    status:status === 'historical-pass' ? 'passed' : status === 'historical-fail' ? 'failed' : 'skipped',
  }));
  writeFileSync(report,JSON.stringify({testResults:[{name:script,assertionResults:cases}]},null,2)+'\n',{flag:'wx'});
  if (exit === 2 || exit === 126 || exit === 127) return 2;
  if (cases.some((test)=>test.status === 'failed')) return 1;
  return exit === 0 && cases.every((test)=>test.status === 'passed') ? 0 : 2;
}

main().then((code)=>{process.exitCode=code;}).catch((error)=>{
  console.error('LEGACY_MATRIX_INCOMPLETE: '+error.message);
  process.exitCode=2;
});
