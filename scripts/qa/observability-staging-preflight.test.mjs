import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateStagingPlan } from './observability-staging-preflight.mjs';
const digest=c=>'sha256:'+c.repeat(64);
const fixture=()=>({
  program:'a2-obs-rehearsal',environment:'staging',syntheticDataOnly:true,
  approval:{changeId:'A2-TEST-1234',testOnlyRecipientVerified:true},
  isolation:{postgres:'dedicated-ephemeral',redis:'dedicated-ephemeral',cloudJob:'dedicated-test',objectStorage:'dedicated-test',notificationDestination:'test-only'},
  endpoints:Object.fromEntries(['api','worker','otlpSearch','prometheus','alertWebhook','cdn'].map(k=>[k,`https://${k.toLowerCase()}.staging.example.test`])),
  images:{old:{api:digest('a'),worker:digest('b')},candidate:{api:digest('c'),worker:digest('d')}},
  canaryPercent:[10,25,50,100],
  migrations:{expandOnly:true,destructiveStatements:0,oldVersionReadCompatible:true},
  backup:{restoredAndVerified:true},
  rollback:{applicationDigest:digest('a'),flagOff:true,preserveOutboxAndDlq:true},
  acceptance:{realCloudJob360p:true,searchableOtlpAndHistoricalRecords:true,
    firingResolvedInVerifiedTestChannel:true,baselineSameTrafficAndHardware:true,
    stagedRpoRtoMeasured:true,all18ScenariosVerified:true,all33RegressionGatesGreen:true,all5ChaosGatesGreen:true},
});
test('full required evidence manifest validates without issuing actions',()=>{
  assert.deepEqual(validateStagingPlan(fixture()),{status:'READY_FOR_INDEPENDENT_VERIFICATION',errors:[]});
});
test('rejects any production endpoints, live network address or auth in URL',()=>{
  for(const url of ['https://gafus.ru','https://api.gafus.ru','https://185.239.51.125',
    'http://user:password@127.0.0.1:56244','https://api.staging.example.test/?token=x']){
    const p=fixture();p.endpoints.api=url;
    assert(validateStagingPlan(p).errors.includes('isolated_endpoint_api'),url);
  }
});
test('cannot pass without verified rollback, old schema, alert receipt and staged outcomes',()=>{
  const p=fixture();
  p.migrations.destructiveStatements=1;
  p.rollback.flagOff=false;
  p.acceptance.realCloudJob360p=false;
  p.acceptance.all18ScenariosVerified=false;
  p.approval.testOnlyRecipientVerified=false;
  const e=validateStagingPlan(p).errors;
  for(const name of ['expand_only_schema','application_and_flag_rollback','real_isolated_cloud_job',
    'eighteen_acceptance_scenarios','test_only_alert_recipient_verified'])assert(e.includes(name));
});
test('missing or incomplete plan returns PENDING, never claims deployment',()=>{
  assert.equal(validateStagingPlan().status,'PENDING');
  const p=fixture();delete p.images.candidate.worker;
  assert(validateStagingPlan(p).errors.includes('worker_candidate_digest'));
});

test('shipped staging template is intentionally incomplete and contains no credentials', async()=>{
  const { readFile } = await import('node:fs/promises');
  const filename = new URL('../../docs/audit/gafus-agent-2-staging-evidence-template.json',import.meta.url);
  const raw=await readFile(filename,'utf8');
  const p=JSON.parse(raw);
  const result=validateStagingPlan(p);
  assert.equal(result.status,'PENDING');
  for(const name of ['explicit_staging_approval','isolated_cloud_resources','isolated_endpoint_api',
     'real_isolated_cloud_job','staging_rpo_rto','all_33_regression_gates']){
    assert(result.errors.includes(name));
  }
  assert(!/BEGIN PRIVATE KEY|Bearer\s+[a-zA-Z0-9]+|AKIA[0-9A-Z]{16}|password.*:/i.test(raw));
});
