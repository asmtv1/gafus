#!/usr/bin/env node
/** Isolated real-SQL Vitest V8 coverage of explicitly enumerated payment/Worker sources. */
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {measureRiskCoverage,verifyRiskCoverageToolchain} from '../../tests/support/coverage-risk-report.mjs';
const root=resolve(import.meta.dirname,'../..');
const [domain,reportArg]=process.argv.slice(2);
const script={payment:'scripts/qa/payment-archqa-isolated-pg.sh',worker:'scripts/qa/media-cdn-purge-isolated-pg.sh'}[domain];
if(!script || !reportArg || !reportArg.startsWith('/') || reportArg.includes('..') ||
  !/^\.qa\/testing\/qa-[a-zA-Z0-9-]+\/tasks\/[a-f0-9]{20}\/tests\.json$/.test(reportArg.startsWith(root+'/')?reportArg.slice(root.length+1):'')) {
  console.error('COVERAGE_RISK_DENIED_UNOWNED_REPORT_OR_DOMAIN');process.exit(2);
}
const taskDir=dirname(reportArg),coverageDir=join(taskDir,'coverage');
mkdirSync(coverageDir,{recursive:true,mode:0o700});
const env={...process.env,GAFUS_TEST_REPORT_PATH:reportArg,GAFUS_QA_COVERAGE_DIR:coverageDir};
// Do not allow a direct invocation to leak connected real providers or external DBs.
for(const key of Object.keys(env))if(/^(DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL|REDIS_URL|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|AWS_|S3_|CLOUDRU_|YOOKASSA_|APPLE_.*SECRET|UPTRACE_.*TOKEN)/.test(key))delete env[key];
const run=spawnSync('bash',[join(root,script)],{cwd:root,env,stdio:'inherit',timeout:8*60_000});
if(run.error || run.status!==0){
  console.error('COVERAGE_RISK_SQL_OR_VITEST_FAILED',String(run.error?.message||run.status));
  process.exit(run.status===2?2:run.error?2:1);
}
try{
  const baseline=JSON.parse(readFileSync(join(root,'tests/catalog/coverage-risk-baseline.json'),'utf8'));
  verifyRiskCoverageToolchain(root,domain,baseline);
  const coverage=measureRiskCoverage(root,domain,coverageDir,baseline);
  const tests=JSON.parse(readFileSync(reportArg,'utf8'));
  if(!Array.isArray(tests.testResults)||tests.testResults.length<1 ||
    tests.numFailedTests!==0||tests.numPendingTests!==0||!Number.isInteger(tests.numPassedTests)||tests.numPassedTests<5)
    throw Error('COVERAGE_RISK_TEST_RECEIPT_FAILED_OR_INCOMPLETE');
  writeFileSync(join(taskDir,'coverage-risk.json'),JSON.stringify(coverage,null,2)+'\n',{mode:0o600});
  console.log('COVERAGE_RISK_MEASURED',JSON.stringify({domain,totals:coverage.totals,sources:coverage.files.length,status:coverage.status}));
}catch(error){
  console.error('COVERAGE_RISK_INCOMPLETE',error.message);process.exitCode=2;
}
