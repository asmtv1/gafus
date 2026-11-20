#!/usr/bin/env node
/** Device-free native QA prerequisite check. Does not execute a Maestro flow,
 * start a simulator, install a binary, modify policies or access prod APIs.
 * Native acceptance remains INCOMPLETE until real device + signed QA receipts.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { inspectMaestroFlow } from '../../tests/support/mobile-maestro-flow.mjs';
import { classifyAdbDevices } from '../../tests/support/mobile-adb-device-classifier.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const userHome=homedir();
const canonicalJdk='/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home';
const androidStudioJdk='/Applications/Android Studio.app/Contents/jbr/Contents/Home';
const jdkCandidates=[process.env.JAVA_HOME,canonicalJdk,androidStudioJdk].filter(Boolean);
const javaHome=jdkCandidates.find(p=>existsSync(join(p,'bin/java')));
const maestroBinDir=join(userHome,'.maestro/bin');
const toolEnv={...process.env,
  ...(javaHome?{JAVA_HOME:javaHome}:{}),
  PATH:[...(javaHome?[join(javaHome,'bin')]:[]),maestroBinDir,process.env.PATH||''].join(':'),
  MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED:'true',
};
const cmd=(program,args=[],timeout=20000,env=toolEnv)=>
  spawnSync(program,args,{cwd:root,env,encoding:'utf8',timeout,maxBuffer:1_000_000});
const compact=(result,max=200)=>String(result?.stdout||result?.stderr||'').trim().slice(0,max);

const javaInherited=cmd('java',['-version'],10000,process.env);
const javaEffective=cmd('java',['-version']);
const javaText=String(javaEffective.stderr||javaEffective.stdout||'');
const javaVersion=/version\s+"(\d+)(?:\.(\d+))?/.exec(javaText);
const javaMajor=javaVersion?Number(javaVersion[1]):null;
const maestro=cmd('maestro',['--version'],25000);
// --help parses CLI options without selecting or launching any device.
const maestroHelp=maestro.status===0?cmd('maestro',['test','--help'],25000):null;
const helpText=String(maestroHelp?.stdout||'')+'\n'+String(maestroHelp?.stderr||'');
const maestroTestHelpValid=maestroHelp?.status===0 &&
  helpText.includes('maestro test') && helpText.includes('--format=') &&
  helpText.includes('--output=') && helpText.includes('<flowFiles>');
const cliVersion=maestro.status===0?String(maestro.stdout||maestro.stderr||'').trim().split('\n').at(-1):null;
const device=cmd('adb',['devices','-l']);
const xcode=cmd('xcodebuild',['-version']);
const sims=cmd('xcrun',['simctl','list','devices','booted','-j']);
const physical=cmd('xcrun',['devicectl','list','devices']);
const app=JSON.parse(readFileSync(join(root,'apps/mobile/app.json'),'utf8')).expo;
const mobilePkg=JSON.parse(readFileSync(join(root,'apps/mobile/package.json'),'utf8'));
let booted=[];
try{
  const data=JSON.parse(sims.stdout);
  booted=Object.values(data.devices||{}).flat().filter(d=>d.state==='Booted').map(d=>({name:d.name,udid:d.udid}));
}catch{}
const android=classifyAdbDevices(device.status===0?device.stdout:'');
const attachedPhysicalIos=physical.status===0 ? physical.stdout.split('\n')
  .filter(line=>/\bphysical\s*$/.test(line) &&
    /\b(?:connected|available|paired)\b/i.test(line) && !/\bunavailable\b/i.test(line)) : [];

const flowKinds=['login','android-ota','ios-ota'];
const flowFiles=[
 'tests/e2e/mobile/flows/common/login.yaml',
 'tests/e2e/mobile/flows/android/mandatory-ota.yaml',
 'tests/e2e/mobile/flows/ios/mandatory-ota.yaml',
];
const missingFlows=flowFiles.filter(file=>!existsSync(join(root,file)));
const staticFlowResults=flowFiles.map((file,index)=>{
  try{
    const source=readFileSync(join(root,file),'utf8');
    return {file, ...inspectMaestroFlow(source,{kind:flowKinds[index]}),
      sha256:createHash('sha256').update(source).digest('hex')};
  }catch(error){return {file,error:String(error.message),staticOnly:true};}
});
const sourceTestIds={
 'username-input':'apps/mobile/app/(auth)/login.tsx',
 'password-input':'apps/mobile/app/(auth)/login.tsx',
 'login-button':'apps/mobile/app/(auth)/login.tsx',
 'required-ota-screen':'apps/mobile/src/shared/components/RequiredOtaUpdateGate.tsx',
};
const missingSourceTestIds=Object.entries(sourceTestIds)
  .filter(([id,file])=>!existsSync(join(root,file)) ||
    !readFileSync(join(root,file),'utf8').includes(`testID="${id}"`))
  .map(([id])=>id);
const sdkRoot=process.env.ANDROID_HOME||join(userHome,'Library/Android/sdk');
const appIdAndRuntime={
 version:app.version,runtimePolicy:app.runtimeVersion?.policy,
 expoUpdatesPackage:mobilePkg.dependencies?.['expo-updates'],
 sameNativeAppId:app.android?.package==='ru.gafus.app'&&app.ios?.bundleIdentifier==='ru.gafus.app',
};
const binaryPrerequisites={
 javaOnInheritedPath:javaInherited.status===0,
 javaEffective:javaEffective.status===0 && javaMajor!==null && javaMajor>=17,
 javaHome:javaHome||null,javaMajor,
 javaAlternatives:[canonicalJdk,androidStudioJdk].filter(p=>existsSync(join(p,'bin/java'))),
 maestroCLI:maestro.status===0,maestroTestHelpValid,
 androidSdk:existsSync(join(sdkRoot,'platform-tools/adb')),androidSdkRoot:sdkRoot,
 androidGradleWrapper:existsSync(join(root,'apps/mobile/android/gradlew')),
 iosPodCommand:cmd('pod',['--version']).status===0,
 iosProject:existsSync(join(root,'apps/mobile/ios/Gafus.xcodeproj/project.pbxproj')),
};
const flowErrors=staticFlowResults.filter(x=>x.error).map(x=>({file:x.file,error:x.error}));
const invalidReasons=[
 ...(missingFlows.length?['maestro-flow-files-missing']:[]),
 ...(flowErrors.length?['maestro-flow-static-validation-failed']:[]),
 ...(missingSourceTestIds.length?['react-native-test-ids-missing']:[]),
 ...(!appIdAndRuntime.sameNativeAppId?['mobile-app-id-mismatch']:[]),
];
const incompleteReasons=[
 ...(!binaryPrerequisites.javaEffective?['java-17-plus-not-available']:[]),
 ...(!binaryPrerequisites.maestroCLI?['maestro-cli-not-installed']:[]),
 ...(!binaryPrerequisites.maestroTestHelpValid?['maestro-test-help-unavailable']:[]),
 ...(!binaryPrerequisites.androidSdk?['android-sdk-platform-tools-unavailable']:[]),
 ...(!binaryPrerequisites.iosProject?['ios-native-project-unavailable']:[]),
 ...(!android.physicalDeviceConnected?['physical-android-not-connected']:[]),
 ...(attachedPhysicalIos.length===0?['physical-ios-not-connected']:[]),
 // No unverified IPA, APK or app install can count as signed QA evidence.
 'isolated-signed-qa-builds-not-verified',
 'isolated-qa-ota-policy-and-signed-package-not-verified',
 'on-device-runtime-revision-and-junit-not-verified',
];
const status=invalidReasons.length?'invalid':'incomplete';
const result={
 schema:1,kind:'maestro-native-preflight',status,checkedAt:new Date().toISOString(),
 cli:{version:cliVersion,versionExitCode:maestro.status,testHelpExitCode:maestroHelp?.status??null,
   testHelpValidated:!!maestroTestHelpValid,helpOnly:true,
   dryRunMode:'static-yaml-and-cli-help',note:'Maestro 2.12.1 has no device-free --dry-run/validate subcommand in maestro test --help'},
 platforms:{android:{...android,connected:android.deviceIds.length>0},
   ios:{bootedSimulators:booted,physicalDeviceConnected:attachedPhysicalIos.length>0}},
 tools:{adb:device.status===0,xcode:xcode.status===0,
   xcodeVersion:xcode.status===0?compact(xcode,120).replaceAll('\n',' '):null,
   xcrun:sims.status===0,maestro:maestro.status===0},
 expectedPackage:'ru.gafus.app',configuredAndroidPackage:app.android?.package,
 configuredIosBundle:app.ios?.bundleIdentifier,
 staticFlowResults,missingFlows,missingSourceTestIds,binaryPrerequisites,appIdAndRuntime,
 invalidReasons,incompleteReasons,
 deviceTestsExecuted:false,qaBinariesVerified:false,otaRevisionsVerified:false,
 realNativeTestStatus:'incomplete',
};
const defaultPath=join(root,'.qa/testing/mobile-e2e/preflight.json');
const requested=process.env.GAFUS_NATIVE_PREFLIGHT_REPORT;
const artifact=requested||defaultPath;
if(requested && (!requested.startsWith(join(root,'.qa/testing')+'/') ||
  !requested.endsWith('/native-preflight.json') || requested.includes('..'))){
  console.error('REFUSE_NON_QA_NATIVE_PREFLIGHT_REPORT_PATH');process.exit(2);
}
mkdirSync(dirname(artifact),{recursive:true,mode:0o700});
writeFileSync(artifact,JSON.stringify(result,null,2)+'\n',{mode:0o600});
console.log('MOBILE_E2E_PREFLIGHT '+JSON.stringify({status,
  maestroVersion:cliVersion,javaMajor,maestroTestHelpValid,
  flowsValidated:staticFlowResults.length-flowErrors.length,
  androidDeviceCount:android.deviceIds.length,androidPhysicalDeviceCount:android.physicalDeviceIds.length,
  androidEmulatorCount:android.emulatorIds.length,iosPhysicalConnected:attachedPhysicalIos.length>0,
  invalidReasons,incompleteReasons,
  receipt:artifact.replace(root+'/','')}));
if(status==='invalid')process.exitCode=1;
else if(process.argv.includes('--strict'))process.exitCode=2;
// Without --strict the direct diagnostic command remains exit 0 for exploration.
// Neither path ever promotes native OTA E2E to passed.
