import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {inspectMaestroFlow} from './mobile-maestro-flow.mjs';

/** Device-free evidence contract. A static native check may NEVER stand in for
 * a signed QA binary, physical-device JUnit, or a running OTA revision.
 */
export function verifyMobilePreflightEvidence(raw,root=resolve(import.meta.dirname,'../..')) {
  if (!raw || raw.schema!==1 || raw.kind!=='maestro-native-preflight' ||
      raw.status!=='incomplete' || raw.realNativeTestStatus!=='incomplete') {
    throw Error('NATIVE_PREFLIGHT_RECEIPT_MUST_BE_INCOMPLETE');
  }
  if(raw.deviceTestsExecuted!==false || raw.qaBinariesVerified!==false ||
     raw.otaRevisionsVerified!==false)throw Error('NATIVE_PREFLIGHT_FORGED_DEVICE_EVIDENCE');
  if(raw.expectedPackage!=='ru.gafus.app' || raw.configuredAndroidPackage!==raw.expectedPackage ||
     raw.configuredIosBundle!==raw.expectedPackage ||
     raw.appIdAndRuntime?.sameNativeAppId!==true)throw Error('NATIVE_PREFLIGHT_APP_ID_DRIFT');
  if(!Array.isArray(raw.staticFlowResults) || raw.staticFlowResults.length!==3 ||
      new Set(raw.staticFlowResults.map(x=>x.kind)).size!==3 ||
      !['login','android-ota','ios-ota'].every(kind=>raw.staticFlowResults.some(x=>x.kind===kind &&
        x.staticOnly===true && !x.error && x.appId==='ru.gafus.app' && /^[a-f0-9]{64}$/.test(x.sha256)))){
    throw Error('NATIVE_PREFLIGHT_FLOW_VALIDATION_NOT_PROVEN');
  }
  // Re-read the real flow bytes and RN testIDs. Do not accept a forged SHA
  // that merely happens to be 64 hex digits, or a modified flow after run.
  const expectedFlows={
    login:'tests/e2e/mobile/flows/common/login.yaml',
    'android-ota':'tests/e2e/mobile/flows/android/mandatory-ota.yaml',
    'ios-ota':'tests/e2e/mobile/flows/ios/mandatory-ota.yaml',
  };
  for(const [kind,file] of Object.entries(expectedFlows)){
    const entry=raw.staticFlowResults.find(f=>f.kind===kind&&f.file===file);
    if(!entry)throw Error('NATIVE_PREFLIGHT_EXPECTED_FLOW_MISSING:'+kind);
    const source=readFileSync(join(root,file),'utf8');
    if(entry.sha256!==createHash('sha256').update(source).digest('hex'))
      throw Error('NATIVE_PREFLIGHT_FLOW_DIGEST_CHANGED:'+kind);
    inspectMaestroFlow(source,{kind});
  }
  const sourceIds={
    'username-input':'apps/mobile/app/(auth)/login.tsx',
    'password-input':'apps/mobile/app/(auth)/login.tsx',
    'login-button':'apps/mobile/app/(auth)/login.tsx',
    'required-ota-screen':'apps/mobile/src/shared/components/RequiredOtaUpdateGate.tsx',
  };
  for(const [id,file] of Object.entries(sourceIds)){
    if(!readFileSync(join(root,file),'utf8').includes(`testID="${id}"`))
      throw Error('NATIVE_PREFLIGHT_SOURCE_TEST_ID_REMOVED:'+id);
  }
  const android=raw.platforms?.android;
  if(!android || !Array.isArray(android.deviceIds) ||
    !Array.isArray(android.emulatorIds) ||
    !Array.isArray(android.physicalDeviceIds) ||
    !Array.isArray(android.unclassifiedDeviceIds) ||
    typeof android.physicalDeviceConnected!=='boolean' ||
    typeof android.connected!=='boolean')throw Error('NATIVE_PREFLIGHT_ANDROID_DEVICE_REPORT_MISSING');
  const combined=[...android.emulatorIds,...android.physicalDeviceIds,
    ...android.unclassifiedDeviceIds];
  if(android.deviceIds.length!==combined.length ||
     new Set(combined).size!==combined.length ||
     new Set(android.deviceIds).size!==android.deviceIds.length ||
     combined.some(id=>!android.deviceIds.includes(id)) ||
     android.physicalDeviceConnected!==(android.physicalDeviceIds.length>0) ||
     android.connected!==(android.deviceIds.length>0) ||
     android.physicalDeviceIds.some(id=>/^emulator-\d+$/.test(id))) {
    throw Error('NATIVE_PREFLIGHT_ANDROID_DEVICE_CLASSIFICATION_INVALID');
  }
  if(!android.physicalDeviceConnected &&
    !raw.incompleteReasons?.includes('physical-android-not-connected'))
    throw Error('NATIVE_PREFLIGHT_MISSING_PHYSICAL_ANDROID_RESTRICTION');
  if(!Array.isArray(raw.incompleteReasons)||raw.incompleteReasons.length===0 ||
     !raw.incompleteReasons.includes('isolated-signed-qa-builds-not-verified') ||
     !raw.incompleteReasons.includes('on-device-runtime-revision-and-junit-not-verified') ||
     !Array.isArray(raw.invalidReasons)||raw.invalidReasons.length!==0 ||
     !Array.isArray(raw.missingSourceTestIds)||raw.missingSourceTestIds.length!==0 ||
     !Array.isArray(raw.missingFlows)||raw.missingFlows.length!==0){
    throw Error('NATIVE_PREFLIGHT_MISSING_OR_INCONSISTENT_PREREQUISITES');
  }
  const cli=raw.cli||{};
  if(cli.helpOnly!==true || cli.dryRunMode!=='static-yaml-and-cli-help')
    throw Error('NATIVE_PREFLIGHT_MUST_NOT_CLAIM_DEVICE_EXECUTION');
  const toolsReady=raw.binaryPrerequisites?.javaEffective===true &&
    raw.binaryPrerequisites?.maestroCLI===true &&
    raw.binaryPrerequisites?.maestroTestHelpValid===true &&
    cli.testHelpValidated===true && typeof cli.version==='string' && cli.version.length>0;
  return {status:'incomplete',staticFlowCount:3,toolsReady,
    physicalAndroidCount:android.physicalDeviceIds.length,
    androidEmulatorCount:android.emulatorIds.length,
    incompleteReasons:raw.incompleteReasons.slice(),maestroVersion:cli.version||null,
    javaMajor:raw.binaryPrerequisites?.javaMajor??null};
}
