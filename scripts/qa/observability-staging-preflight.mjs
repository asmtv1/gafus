#!/usr/bin/env node
/** Read-only staging plan verifier. This file NEVER deploys or calls endpoints.
 * Synthetic testing can be executed separately only after an actual approval.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const CANARY_STEPS=[10,25,50,100];
const sha256=value=>typeof value==='string'&&/^sha256:[0-9a-f]{64}$/.test(value);
const safeHost=url=>{
  try {
    const parsed=new URL(url);
    if(parsed.username||parsed.password||parsed.search||parsed.hash)return false;
    if(!['https:','http:'].includes(parsed.protocol))return false;
    const name=parsed.hostname.toLowerCase();
    // Only reserved staging hostnames or loopback; never public root, live IPs
    // or an arbitrary hostname supplied by a test file.
    return name==='localhost'||name==='127.0.0.1'||
      name.endsWith('.test')||name.endsWith('.internal');
  }catch{return false;}
};
export function validateStagingPlan(data){
  const p=data??{};const errors=[];
  const require=(truth,name)=>{if(!truth)errors.push(name);};
  require(p.program==='a2-obs-rehearsal','program');
  require(p.environment==='staging','environment_staging');
  require(p.syntheticDataOnly===true,'synthetic_data_only');
  require(typeof p.approval?.changeId==='string'&&/^A2-[A-Z0-9-]{4,40}$/.test(p.approval.changeId),'explicit_staging_approval');
  require(p.approval?.testOnlyRecipientVerified===true,'test_only_alert_recipient_verified');
  require(p.isolation?.postgres==='dedicated-ephemeral'&&p.isolation?.redis==='dedicated-ephemeral','isolated_postgres_redis');
  require(p.isolation?.cloudJob==='dedicated-test'&&p.isolation?.objectStorage==='dedicated-test','isolated_cloud_resources');
  require(p.isolation?.notificationDestination==='test-only','notification_only_test');
  for(const field of ['api','worker','otlpSearch','prometheus','alertWebhook','cdn'])
    require(safeHost(p.endpoints?.[field]),`isolated_endpoint_${field}`);
  for(const app of ['api','worker']){
    require(sha256(p.images?.old?.[app]),`${app}_old_digest`);
    require(sha256(p.images?.candidate?.[app]),`${app}_candidate_digest`);
    require(p.images?.old?.[app]!==p.images?.candidate?.[app],`${app}_two_versions`);
  }
  require(Array.isArray(p.canaryPercent)&&p.canaryPercent.join(',')===CANARY_STEPS.join(','),'canary_10_25_50_100');
  require(p.migrations?.expandOnly===true&&p.migrations?.destructiveStatements===0,'expand_only_schema');
  require(p.migrations?.oldVersionReadCompatible===true,'schema_old_version_compatible');
  require(p.backup?.restoredAndVerified===true,'verified_restorable_backup');
  require(p.rollback?.applicationDigest===p.images?.old?.api&&p.rollback?.flagOff===true,'application_and_flag_rollback');
  require(p.rollback?.preserveOutboxAndDlq===true,'no_destructive_data_rollback');
  require(p.acceptance?.realCloudJob360p===true,'real_isolated_cloud_job');
  require(p.acceptance?.searchableOtlpAndHistoricalRecords===true,'searchable_traces_and_history');
  require(p.acceptance?.firingResolvedInVerifiedTestChannel===true,'alert_delivery_receipt');
  require(p.acceptance?.baselineSameTrafficAndHardware===true,'matched_load_baseline');
  require(p.acceptance?.stagedRpoRtoMeasured===true,'staging_rpo_rto');
  require(p.acceptance?.all18ScenariosVerified===true,'eighteen_acceptance_scenarios');
  require(p.acceptance?.all33RegressionGatesGreen===true,'all_33_regression_gates');
  require(p.acceptance?.all5ChaosGatesGreen===true,'all_five_chaos_gates');
  return {status:errors.length===0?'READY_FOR_INDEPENDENT_VERIFICATION':'PENDING',errors};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const filename=process.argv[2];
  const input=filename?JSON.parse(await readFile(filename,'utf8')):{};
  const result=validateStagingPlan(input);
  console.log(JSON.stringify({runPrefix:'a2-obs-',scope:'local read-only evidence manifest; no browser, SSH or deploy',...result},null,2));
  if(result.errors.length)process.exitCode=2;
}
