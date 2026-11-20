#!/usr/bin/env node
// Exercises original plan/report CLI with synthetic records only.
// NEVER triggers Actions, deployments, release gates or real business tests.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { relative, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const id='qa-ci-synthetic-'+randomUUID();
const dir=join(root,'.qa/testing',id);
mkdirSync(dir,{recursive:true,mode:0o700});
const json=(p,data)=>writeFileSync(p,JSON.stringify(data,null,2)+'\n',{mode:0o600});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cmd=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
assert.equal(cmd.status,0,'GIT_HEAD_REQUIRED');
const commit=cmd.stdout.trim();
const cases=[];
const task={
  id:'qa.report-fail-closed.synthetic',scenario:null,owner:'qa/local-only',
  kind:'unit',part:'safety-contract',platform:'node',
  cwd:'.',status:'ready',resources:[],command:null,
  expectedCases:['first required case','second required case'],
  reproduction:'node scripts/qa/test-ci-fail-closed-local.mjs',
};
function makePlan(runId,sha=commit){
  const core={schema:1,profile:'ci',commit:sha,base:null,
    selection:{mode:'unfiltered',changed:[],impacted:[]},package:null,scenario:null,
    platform:null,tasks:[task],emptyReason:null};
  return {...core,fingerprint:hash(core),runId};
}
function fixture(name,mutate){
  const caseDir=join(dir,name);
  mkdirSync(caseDir,{recursive:true,mode:0o700});
  const plan=makePlan(id+'-'+name),taskDir=join(caseDir,'tasks','synthetic');
  mkdirSync(taskDir,{recursive:true,mode:0o700});
  const report=join(taskDir,'tests.json'),evidence=join(taskDir,'output.log');
  writeFileSync(evidence,'SYNTHETIC_LOCAL_RESULT_NOT_REAL_TEST\n',{mode:0o600});
  const data={success:true,numTotalTests:2,numPassedTests:2,numFailedTests:0,
    testResults:[{name:join(caseDir,'fixture-only.test.ts'),
      assertionResults:task.expectedCases.map(title=>({title,fullName:title,status:'passed'}))}]};
  json(report,data);
  const receipt={id:task.id,platform:task.platform,part:task.part,
    runId:plan.runId,commit:plan.commit,fingerprint:plan.fingerprint,attempt:1,
    status:'passed',exitCode:0,evidencePath:relative(root,evidence),
    caseEvidencePath:relative(root,report),cases:[],
    durationMs:1};
  const state={caseDir,plan,taskDir,report,evidence,data,receipt,writeReceipt:true};
  if(mutate) mutate(state);
  json(join(caseDir,'plan.json'),state.plan);
  json(report,state.data);
  if(state.writeReceipt)json(join(taskDir,'receipt.json'),state.receipt);
  return state;
}
function check(name,expected,mutate,{mustContain,attempts}={}){
  const state=fixture(name,mutate);
  const run=spawnSync(process.execPath,
    ['scripts/qa/test-system.mjs','report','--plan',join(state.caseDir,'plan.json')],
    {cwd:root,encoding:'utf8',timeout:35000,maxBuffer:1_000_000,
     env:Object.fromEntries(['PATH','HOME','LANG','LC_ALL','TZ']
       .filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]))});
  assert.equal(run.status,expected,name+':WRONG_EXIT:'+run.stdout.slice(-850)+run.stderr.slice(-850));
  const combined=run.stdout+' '+run.stderr;
  if(mustContain)assert(combined.includes(mustContain),name+':MISSING_FAILURE_REASON');
  const summaryFile=join(state.caseDir,'summary.json');
  if(existsSync(summaryFile)){
    const receipt=JSON.parse(readFileSync(summaryFile,'utf8'));
    assert.equal(receipt.code,expected,name+':SUMMARY_CODE_MISMATCH');
    if(attempts) {
      assert.deepEqual(receipt.unstableAttempts,[{id:task.id,attempt:attempts}],
        name+':RETRY_NOT_VISIBLE');
      const md=readFileSync(join(state.caseDir,'summary.md'),'utf8');
      assert.match(md,/Passed after retry \(unstable, not first-attempt green\)/);
    }
  }else {
    assert(expected===2,'SUCCESS_WITHOUT_REPORT');
  }
  cases.push({name,expectedExit:expected,actualExit:run.status,status:'passed',
    mode:'synthetic report-only, no actual CI execution'});
  console.log('QA_CI_FAIL_CLOSED_PASS',name,expected);
}
check('valid-green',0);
check('real-assertion-failure',1,s=>{s.receipt.status='failed';s.receipt.exitCode=1;s.receipt.reason='SYNTHETIC_FAILURE';});
check('required-skip-blocks',2,s=>{
  s.data.testResults[0].assertionResults[1].status='pending';
  s.data.numPassedTests=1;
});
check('missing-json-report-blocks',2,s=>{s.receipt.caseEvidencePath=null;});
check('missing-receipt-blocks',2,s=>{s.writeReceipt=false;});
check('stale-sha-receipt-blocks',2,s=>{s.receipt.commit='foreign-sha';});
check('lying-exit-code-blocks',2,s=>{s.receipt.exitCode=1;});
check('duplicate-receipt-blocks',2,s=>{
  const extra=join(s.caseDir,'tasks','duplicate');
  mkdirSync(extra,{recursive:true,mode:0o700});
  json(join(extra,'receipt.json'),s.receipt);
});
check('modified-plan-hash-blocks',2,s=>{s.plan.fingerprint='tampered-fingerprint';},
  {mustContain:'fingerprint mismatch'});
check('foreign-commit-plan-blocks',2,s=>{
  s.plan=makePlan(s.plan.runId,'a'.repeat(40));
}, {mustContain:'commit differs from checkout'});
check('retry-is-explicitly-marked',0,s=>{s.receipt.attempt=2;},{attempts:2});
const summary={schema:1,runId:id,status:'passed',expectedCases:cases.length,
  actualCases:cases.length,realGitHubRunner:false,realTestsExecuted:false,
  requiredReleaseGatesChanged:false,
  caveat:'Strict CLI report semantics on synthetic receipts; does not prove deployed CI workflow job scheduling',
  cases};
assert.equal(cases.length,11);
json(join(dir,'summary.json'),summary);
console.log('QA_CI_FAIL_CLOSED_REPORT_PASS',relative(root,join(dir,'summary.json')));
