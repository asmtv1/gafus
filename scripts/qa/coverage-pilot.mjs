#!/usr/bin/env node
/** A measured, fail-closed coverage pilot for the canonical training state implementation. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCoverage } from '../../tests/support/coverage-contract.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output=join(root,'.qa/testing/coverage-pilot-core-client');mkdirSync(output,{recursive:true});
const command=['--filter','@gafus/core-client','exec','vitest','run','--config','vitest.config.ts','src/utils/training.canonical.test.ts','--coverage','--coverage.include=src/utils/training.ts','--coverage.reporter=json-summary','--coverage.reporter=json','--coverage.reporter=lcov','--coverage.reportsDirectory='+output];
const result=spawnSync('pnpm',command,{cwd:root,stdio:'inherit',timeout:180000});
if(result.status!==0){console.error('COVERAGE_PILOT_TEST_FAILED');process.exit(1);}
const path=join(output,'coverage-summary.json');
if(!existsSync(path)){console.error('COVERAGE_PILOT_INCOMPLETE: missing coverage JSON');process.exit(2);}
const summary=JSON.parse(readFileSync(path,'utf8'));
const verdict=verifyCoverage(summary,['packages/core-client/src/utils/training.ts']);
if(!verdict.valid){console.error('COVERAGE_PILOT_INCOMPLETE:',verdict.errors.join('; '));process.exit(2);}
const sha=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim();
const receipt={commit:sha,owner:'@gafus/core-client',testedSource:'packages/core-client/src/utils/training.ts',
  tests:'src/utils/training.canonical.test.ts',lines:verdict.totals.lines,branches:verdict.totals.branches,files:{istanbulJson:join(output,'coverage-final.json'),lcov:join(output,'lcov.info')}};
writeFileSync(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log('COVERAGE_PILOT_MEASURED',JSON.stringify({lines:receipt.lines,branches:receipt.branches}));
