import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parse as parseYaml} from 'yaml';
import {auditWorkflowReleaseGates} from './check-workflow-release-gates.mjs';
const originals=()=>({
 main:readFileSync('.github/workflows/ci-cd.yml','utf8'),
 manual:readFileSync('.github/workflows/gafus-uptrace-nonprod-acceptance.yml','utf8'),
 native:readFileSync('.github/workflows/gafus-sdk57-qa.yml','utf8'),
 ota:readFileSync('.github/workflows/gafus-self-hosted-ota-preview.yml','utf8'),
 single:readFileSync('.github/workflows/build-single-container.yml','utf8'),
 reusable:readFileSync('.github/workflows/production-deploy-reusable.yml','utf8'),
 deployOnly:readFileSync('.github/workflows/deploy-only.yml','utf8'),
 collector:readFileSync('.github/workflows/gafus-uptrace-collector-qa.yml','utf8'),
 symbolsS3:readFileSync('.github/workflows/gafus-private-symbols-s3-acceptance.yml','utf8'),
});
test('reviewed workflow graph contains all source, cloud and symbols gates',()=>{
 const audit=auditWorkflowReleaseGates(originals());
 assert.equal(audit.mainAdmission,'BLOCKING');
 assert.equal(audit.cloudAcceptance,'MANUAL_NONPROD_ONLY');
 assert.equal(audit.productionTelemetryEnabled,false);
});
test('a release must never bypass the nonprod/no-secret checks',()=>{
 const inputs=originals();
 inputs.main=inputs.main.replaceAll("needs.observability-contracts.result == 'success'",
   "needs.observability-contracts.result == 'skipped'");
 assert.throws(()=>auditWorkflowReleaseGates(inputs),/MAIN_PRODUCTION_BYPASS/);
});
test('PR or push can never carry Nonprod secret-bearing cloud acceptance',()=>{
 const inputs=originals();
 inputs.manual=inputs.manual.replace('  workflow_dispatch:', '  push:\n  workflow_dispatch:');
 assert.throws(()=>auditWorkflowReleaseGates(inputs),/NONPROD_AUTOMATIC_RUN_FORBIDDEN/);
});
test('missing verified binary identity prevents SDK57 symbol upload',()=>{
 const inputs=originals();
 inputs.ota=inputs.ota.replace("SYMBOLS_NATIVE_RELEASE_VERIFIED: 'true'",
   "SYMBOLS_NATIVE_RELEASE_VERIFIED: 'false'");
 assert.throws(()=>auditWorkflowReleaseGates(inputs),/OTA_UNVERIFIED_SYMBOLS/);
});
test('source map upload cannot follow an already pushed public image',()=>{
 const inputs=originals();
 inputs.main=inputs.main.replace('- name: Upload immutable private Web release maps from build-apps',
   '- name: Build and push EARLY_IMAGE_PUSH\n      - name: Upload immutable private Web release maps from build-apps');
 assert.throws(()=>auditWorkflowReleaseGates(inputs),/MAIN_MAPS_CANNOT_LEAK/);
});

test('manual single-container cannot publish before Uptrace preflight',()=>{
 const inputs=originals();
 inputs.single=inputs.single.replace(
  '- name: Enforce Uptrace release contracts even for manual image deployment',
  '- name: Enforce Uptrace checks DISABLED');
 assert.throws(()=>auditWorkflowReleaseGates(inputs),/SINGLE_MISSING_UPTRACE_GUARD/);
});
test('manual Deploy Only cannot bypass reusable production source gate',()=>{
 const inputs=originals();
 inputs.reusable=inputs.reusable.replace(
  '- name: Verify Uptrace production release contract',
  '- name: Verify Uptrace DISABLED');
 assert.throws(()=>auditWorkflowReleaseGates(inputs),/REUSABLE_MISSING_UPTRACE_GUARD/);
});
test('automated image publishing requires independent CI observability tests',()=>{
 const inputs=originals();
 inputs.main=inputs.main.replace(
  "needs.observability-contracts.result == 'success' &&",
  "needs.observability-contracts.result == 'skipped' &&");
 assert.throws(()=>auditWorkflowReleaseGates(inputs),/MAIN_IMAGE_PUBLICATION_BYPASS/);
});

test('collector fault injection cannot receive production secrets or run on push',()=>{
 const inputs=originals();
 inputs.collector=inputs.collector.replace('  workflow_dispatch:','  push:\n  workflow_dispatch:');
 assert.throws(()=>auditWorkflowReleaseGates(inputs),/COLLECTOR_QA_SOURCE_LANE_INSECURE/);
 const other=originals();
 other.collector+='\n# secrets.GHCR_TOKEN\n';
 assert.throws(()=>auditWorkflowReleaseGates(other),/COLLECTOR_QA_SOURCE_LANE_INSECURE/);
});

test('private symbols S3 acceptance cannot run on push',()=>{
 const inputs=originals();
 inputs.symbolsS3=inputs.symbolsS3.replace(
  '  workflow_dispatch:', '  push:\n  workflow_dispatch:');
 assert.throws(()=>auditWorkflowReleaseGates(inputs),/PRIVATE_S3_SMOKE_MANUAL_GATE_BYPASS/);
});
test('private symbols S3 acceptance requires the protected preview environment',()=>{
 const inputs=originals();
 inputs.symbolsS3=inputs.symbolsS3.replace(
  'environment: ota-preview', 'environment: public-unprotected');
 assert.throws(()=>auditWorkflowReleaseGates(inputs),/PRIVATE_S3_SMOKE_MANUAL_GATE_BYPASS/);
});


test('reusable SSH deployment script remains below GitHub scalar limit and byte-identical after fragmentation',()=>{
 const source=readFileSync('.github/workflows/production-deploy-reusable.yml','utf8');
 const parsed=parseYaml(source);
 const steps=parsed.jobs['deploy-production'].steps;
 const remote=steps.find(step=>step.name==='Deploy to production server');
 assert.ok(remote,'the immutable release must retain its real SSH action');
 const names=['DEPLOY_SCRIPT_1','DEPLOY_SCRIPT_1B','DEPLOY_SCRIPT_2','DEPLOY_SCRIPT_3'];
 const fragments=names.map(name=>{
  const value=remote.env[name];
  assert.equal(typeof value,'string',`missing ${name}`);
  assert.ok(value.length<16000,`${name} exceeds conservative GitHub expression size limit`);
  return value;
 });
 assert.equal(remote.with.script,
  "${{ format('{0}{1}{2}{3}', env.DEPLOY_SCRIPT_1, env.DEPLOY_SCRIPT_1B, env.DEPLOY_SCRIPT_2, env.DEPLOY_SCRIPT_3) }}");
 assert.equal(createHash('sha256').update(fragments.join(''),'utf8').digest('hex'),
  '71413998dadfff0b42ba6ef7bb07403ff1eb048bac77e9fef8f22d2bec8f3a30',
  'split must reproduce exactly the reviewed production script with signed OTA gate');
 const remoteScript=fragments.join('');
 const otaCheck=remoteScript.indexOf('MOBILE_OTA_PRODUCTION_MANIFEST_ENABLED');
 const maintenanceOpen=remoteScript.indexOf('bash \"$CUTOVER_SCRIPT\" open');
 assert(otaCheck!==-1 && maintenanceOpen!==-1 && otaCheck<maintenanceOpen,
  'signed OTA validation must succeed before lifting production maintenance');
});
