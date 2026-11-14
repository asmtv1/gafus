#!/usr/bin/env node
/**
 * Source-only release contracts: no SDK, network, GitHub API, cloud credentials,
 * Docker or database necessary. Checks admission edges, not only isolated steps.
 */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const paths={
 main:'.github/workflows/ci-cd.yml',
 manual:'.github/workflows/gafus-uptrace-nonprod-acceptance.yml',
 native:'.github/workflows/gafus-sdk57-qa.yml',
 ota:'.github/workflows/gafus-self-hosted-ota-preview.yml',
 single:'.github/workflows/build-single-container.yml',
 reusable:'.github/workflows/production-deploy-reusable.yml',
 deployOnly:'.github/workflows/deploy-only.yml',
 collector:'.github/workflows/gafus-uptrace-collector-qa.yml',
 symbolsS3:'.github/workflows/gafus-private-symbols-s3-acceptance.yml',
};
function must(condition,code){if(!condition)throw Error('UPTRACE_WORKFLOW_'+code);}
const position=(s,needle,code)=>{
 const idx=s.indexOf(needle);
 must(idx>=0,code);
 return idx;
};
export function auditWorkflowReleaseGates(workflows){
 for(const key of Object.keys(paths))must(typeof workflows[key]==='string'&&
  workflows[key].length>300,'SOURCE_MISSING_'+key.toUpperCase());
 const {main,manual,native,ota,single,reusable,deployOnly,collector,symbolsS3}=workflows;
 must(main.includes('  observability-contracts:')&&
  main.includes('needs: prepare-deps')&&
  main.includes('node --test scripts/observability/*.test.mjs')&&
  main.includes('node scripts/observability/check-workflow-release-gates.mjs'),
  'MAIN_SOURCE_GATES_MISSING');
 must(/needs: \[security, observability-contracts, build-apps, build-images,/.test(main)&&
  main.includes("needs.observability-contracts.result == 'success'"),
  'MAIN_PRODUCTION_BYPASS');
 const compile=position(main,'- name: Build, test, typecheck apps','MAIN_COMPILE_MISSING');
 const dry=position(main,'- name: Verify the three sealed private Vite source-map manifests','MAIN_PRIVATE_MAP_DRY_RUN_MISSING');
 const pack=position(main,'- name: Pack and verify SHA-scoped public Vite release artifacts','MAIN_PUBLIC_DIST_PACKAGE_MISSING');
 const privateUpload=position(main,'- name: Upload immutable private Web release maps from build-apps (approved only)','MAIN_PRIVATE_MAP_UPLOAD_MISSING');
 const restore=position(main,'- name: Restore and verify exact public Vite dist from build-apps','MAIN_PUBLIC_DIST_RESTORE_MISSING');
 const push=position(main,'- name: Build and push','MAIN_DOCKER_PUSH_MISSING');
 must(compile<dry&&dry<pack&&pack<privateUpload&&privateUpload<restore&&restore<push&&
  main.includes("GAFUS_PRIVATE_MAPS_ENABLED: 'true'")&&
  main.includes('node scripts/qa/vite-release-dist-artifacts.mjs pack')&&
  main.includes('node scripts/qa/vite-release-dist-artifacts.mjs restore')&&
  main.includes('node scripts/observability/upload-private-web-sourcemaps.mjs --directory "$private_dir"')&&
  main.includes("vars.GAFUS_WEB_SYMBOLS_PRODUCTION_APPROVED == 'true'")&&
  main.includes('GAFUS_WEB_SYMBOLS_VERIFIED_BUILD:')&&
  main.includes('GAFUS_WEB_SYMBOLS_EXECUTE:')&&
  main.includes('GAFUS_WEB_SYMBOLS_PRODUCTION_APPROVED:'),
  'MAIN_MAPS_CANNOT_LEAK');
 // Check the actual publishing job, not a literal historical order of needs.
 // Main publication now waits for all blocking gates, while a PR builds with
 // `push: false` and never receives release credentials.
 const imageJob = main.split('  build-images:')[1]?.split('  release-images-manifest:')[0] ?? '';
 must(imageJob.includes('observability-contracts') &&
  imageJob.includes("needs.observability-contracts.result == 'success'") &&
  imageJob.includes("needs.security.result == 'success'") &&
  imageJob.includes("needs.build-apps.result == 'success'") &&
  imageJob.includes("needs.cloudru-media-contracts.result == 'success'") &&
  imageJob.includes("needs.cutover-preflight.result == 'success'") &&
  imageJob.includes("push: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}"),
  'MAIN_IMAGE_PUBLICATION_BYPASS');
 must(!main.includes('GAFUS_TELEMETRY_PRODUCTION_APPROVED: true')&&
  !main.includes("GAFUS_UPTRACE_LOGS_ENABLED: 'true'"),
  'MAIN_UNAPPROVED_PRODUCTION_ENABLE');

 must(/^on:\s*\n\s*workflow_dispatch:/m.test(manual)&&
  !/^\s+(push|pull_request|schedule|workflow_call):/m.test(manual),
  'NONPROD_AUTOMATIC_RUN_FORBIDDEN');
 must(manual.includes('environment: gafus-uptrace-nonprod')&&
  manual.includes("vars.GAFUS_UPTRACE_NONPROD_CI_APPROVED")&&
  manual.includes("gafus-uptrace-nonprod-9383")&&
  manual.includes("GAFUS_OBSERVABILITY_PROJECT_ID: '9383'")&&
  manual.includes("GAFUS_TELEMETRY_PRODUCTION_APPROVED: 'false'")&&
  manual.includes("node scripts/observability/uptrace-nonprod-acceptance.mjs")&&
  manual.includes("git merge-base --is-ancestor")&&
  manual.includes('persist-credentials: false')&&
  manual.includes("test -z \"$(git status --porcelain)\""),
  'NONPROD_NOT_ISOLATED');

 must(native.includes("SYMBOLS_UPLOAD_EXECUTE: '0'")&&
  native.includes("GAFUS_TELEMETRY_INGEST_ENABLED: 'false'")&&
  native.includes('prepare-sdk57-private-symbols.test.mjs')&&
  native.includes('uptrace-ack-gateway.test.mjs'),
  'SDK57_SOURCE_LANE_INSECURE');

 const fingerprint=position(ota,'- name: Compare native source fingerprint','OTA_FINGERPRINT_MISSING');
 const prepared=position(ota,'- name: Prepare and verify SDK57 private maps','OTA_SYMBOL_ARCHIVE_MISSING');
 const uploaded=position(ota,'- name: Upload SDK57 maps to immutable private S3','OTA_SYMBOL_UPLOAD_MISSING');
 const ready=position(ota,'- name: Register verified signed preview release as READY','OTA_REGISTER_MISSING');
 must(fingerprint<prepared&&prepared<uploaded&&uploaded<ready&&
  ota.includes("vars.GAFUS_SYMBOLS_PREVIEW_APPROVED == 'true'")&&
  ota.includes("SYMBOLS_NATIVE_RELEASE_VERIFIED: 'true'")&&
  ota.includes("GAFUS_SYMBOLS_PREVIEW_APPROVED: 'true'")&&
  ota.includes("SYMBOLS_UPLOAD_EXECUTE: '1'")&&
  ota.includes('IMMUTABLE_PRIVATE_SYMBOLS_VERIFIED')&&
  ota.includes('SYMBOLS_S3_BUCKET:')&&
  ota.includes('SYMBOLS_S3_ACCESS_KEY:'),
  'OTA_UNVERIFIED_SYMBOLS');
 const reusableGate=position(reusable,
   '- name: Verify Uptrace release contract and unmodified legacy monitoring',
   'REUSABLE_MISSING_UPTRACE_GUARD');
 const sshCutover=position(reusable,
   '- name: Deploy to production server',
   'REUSABLE_MISSING_SSH_DEPLOY');
 must(reusableGate<sshCutover&&
   reusable.includes('node scripts/observability/check-workflow-release-gates.mjs'),
   'REUSABLE_DEPLOYMENT_BYPASS');
 const singleGate=position(single,
   '- name: Enforce Uptrace release contracts even for manual image deployment',
   'SINGLE_MISSING_UPTRACE_GUARD');
 const singleMap=position(single,
   '- name: Upload approved private source maps before manual image publish',
   'SINGLE_PRIVATE_MAP_MISSING');
 const singlePush=position(single,
   '- name: Build and publish only selected image',
   'SINGLE_IMAGE_PUSH_MISSING');
 must(singleGate<singleMap&&singleMap<singlePush&&
   single.includes("GAFUS_PRIVATE_MAPS_ENABLED: 'true'")&&
   single.includes("vars.GAFUS_WEB_SYMBOLS_PRODUCTION_APPROVED == 'true'")&&
   single.includes('test -z "$(find "$public_dist"'),
   'SINGLE_IMAGE_PUBLICATION_BYPASS');
 must(deployOnly.includes('uses: ./.github/workflows/production-deploy-reusable.yml'),
   'DEPLOY_ONLY_REUSABLE_GATE_BYPASS');
 must(/^on:\s*\n\s*workflow_dispatch:/m.test(collector)&&
   !/^\s+(push|pull_request|schedule|workflow_call):/m.test(collector)&&
   collector.includes('runs-on: macos-15')&&
   collector.includes('brew install grafana-alloy')&&
   collector.includes('uptrace-alloy-queue-restart.mjs 401 --shield')&&
   collector.includes('uptrace-alloy-queue-restart.mjs 403 --shield')&&
   collector.includes('uptrace-alloy-queue-restart.mjs 429')&&
   collector.includes('uptrace-alloy-queue-restart.mjs 503')&&
   !collector.includes('secrets.')&&
   collector.includes("GAFUS_TELEMETRY_PRODUCTION_APPROVED: 'false'"),
   'COLLECTOR_QA_SOURCE_LANE_INSECURE');

 must(/^on:\s*\n\s*workflow_dispatch:/m.test(symbolsS3)&&
   !/^\s+(push|pull_request|schedule|workflow_call):/m.test(symbolsS3)&&
   symbolsS3.includes('environment: ota-preview')&&
   symbolsS3.includes('persist-credentials: false')&&
   symbolsS3.includes('git merge-base --is-ancestor')&&
   symbolsS3.includes("GAFUS_TELEMETRY_PRODUCTION_APPROVED: 'false'")&&
   symbolsS3.includes('GAFUS_SYMBOLS_PROBE_ALLOWED')&&
   symbolsS3.includes('gafus-symbols-private-only')&&
   symbolsS3.includes('check-private-symbols-s3.test.mjs')&&
   symbolsS3.includes('check-private-symbols-s3.mjs')&&
   symbolsS3.includes('SYMBOLS_S3_ACCESS_KEY:')&&
   symbolsS3.includes('SYMBOLS_S3_SECRET_KEY:')&&
   !symbolsS3.includes('GAFUS_TELEMETRY_PRODUCTION_APPROVED: true'),
   'PRIVATE_S3_SMOKE_MANUAL_GATE_BYPASS');

 return {mainAdmission:'BLOCKING',cloudAcceptance:'MANUAL_NONPROD_ONLY',
  webSourceMaps:'PRIVATE_SEALED_UPLOAD_OPT_IN',
  sdk57NativeSymbols:'VERIFIED_OTA_PREVIEW_OPT_IN',
  automaticImagePublish:'BLOCKED_ON_OBSERVABILITY',
  manualImagePublish:'BLOCKED_ON_OBSERVABILITY',
  manualDeployOnly:'BLOCKED_BY_REUSABLE_GATE',
  collectorFaultInjection:'MANUAL_OFFLINE_NO_SECRETS',
  privateS3Acceptance:'MANUAL_PROTECTED_BUT_NOT_YET_RUN',
  productionTelemetryEnabled:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 try{
  const inputs=Object.fromEntries(Object.entries(paths).map(([key,path])=>
    [key,readFileSync(path,'utf8')]));
  console.log(JSON.stringify(auditWorkflowReleaseGates(inputs)));
 }catch{
  console.error('UPTRACE_WORKFLOW_RELEASE_GATES_FAILED');
  process.exitCode=4;
 }
}
