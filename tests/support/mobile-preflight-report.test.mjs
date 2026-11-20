import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {inspectMaestroFlow} from './mobile-maestro-flow.mjs';
import {verifyMobilePreflightEvidence} from './mobile-preflight-report.mjs';
const root=resolve(import.meta.dirname,'../..');
// Pure contract fixture, NEVER a real device or native execution receipt.
function sample() {
 const flows=[['login','common/login.yaml'],['android-ota','android/mandatory-ota.yaml'],['ios-ota','ios/mandatory-ota.yaml']];
 return {schema:1,kind:'maestro-native-preflight',status:'incomplete',realNativeTestStatus:'incomplete',
   deviceTestsExecuted:false,qaBinariesVerified:false,otaRevisionsVerified:false,
   expectedPackage:'ru.gafus.app',configuredAndroidPackage:'ru.gafus.app',configuredIosBundle:'ru.gafus.app',
   appIdAndRuntime:{sameNativeAppId:true},
   platforms:{android:{
     deviceIds:['emulator-5554'],emulatorIds:['emulator-5554'],
     physicalDeviceIds:[],unclassifiedDeviceIds:[],
     connected:true,physicalDeviceConnected:false,
   }},
   cli:{helpOnly:true,dryRunMode:'static-yaml-and-cli-help',version:'fixture-only',testHelpValidated:true},
   binaryPrerequisites:{javaEffective:true,javaMajor:17,maestroCLI:true,maestroTestHelpValid:true},
   staticFlowResults:flows.map(([kind,p])=>{
     const file='tests/e2e/mobile/flows/'+p,source=readFileSync(resolve(root,file),'utf8');
     return {file,...inspectMaestroFlow(source,{kind}),sha256:createHash('sha256').update(source).digest('hex')};
   }),
   incompleteReasons:['physical-android-not-connected','physical-ios-not-connected','isolated-signed-qa-builds-not-verified','on-device-runtime-revision-and-junit-not-verified'],
   invalidReasons:[],missingSourceTestIds:[],missingFlows:[],
 };
}
test('static Maestro tools and three flow receipts stay incomplete, never a native PASS',()=>{
 const r=verifyMobilePreflightEvidence(sample());
 assert.equal(r.status,'incomplete');assert.equal(r.staticFlowCount,3);
 assert.equal(r.toolsReady,true);assert.equal(r.maestroVersion,'fixture-only');
 assert.equal(r.physicalAndroidCount,0);assert.equal(r.androidEmulatorCount,1);
});
test('missing proof, forged PASS, altered flow and unexpected failure are rejected',()=>{
 for(const mutate of [
  x=>x.status='passed',x=>x.realNativeTestStatus='passed',
  x=>x.deviceTestsExecuted=true,x=>x.qaBinariesVerified=true,
  x=>x.otaRevisionsVerified=true,x=>x.staticFlowResults.pop(),
  x=>x.staticFlowResults[0].sha256='wrong',
  x=>x.staticFlowResults[0].error='bad',
  x=>x.incompleteReasons=[],x=>x.invalidReasons=['unexpected'],
  x=>x.appIdAndRuntime.sameNativeAppId=false,
  x=>x.cli.helpOnly=false,
  x=>x.platforms.android.physicalDeviceConnected=true,
  x=>x.platforms.android.physicalDeviceIds=['emulator-5554'],
  x=>x.platforms.android.deviceIds=[],
  x=>x.incompleteReasons=x.incompleteReasons.filter(y=>y!=='physical-android-not-connected'),
 ]){const r=sample();mutate(r);assert.throws(()=>verifyMobilePreflightEvidence(r));}
});
