/** Generic physical-device release: never reuse an unconfigured native tree. */
import { spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { applyNativeSelfHostedProfile } = require('./self-hosted-native-profile.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const platform = process.argv[2];
if (!['ios','android'].includes(platform)) throw Error('GAFUS_RELEASE_PLATFORM_REQUIRED');
const env = {...process.env, APP_ENV: process.env.APP_ENV || 'production',
  GAFUS_OTA_TRANSPORT:'self-hosted', GAFUS_OTA_TARGET_PLATFORM:platform,
  EXPO_PUBLIC_CHAT2_API_ORIGIN:process.env.EXPO_PUBLIC_CHAT2_API_ORIGIN || 'https://api.gafus.ru'};
applyNativeSelfHostedProfile(require('../app.json').expo,{environment:env,appRoot:root});
const descriptor=JSON.parse(readFileSync(resolve(root,env.GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR),'utf8'));
const repo=resolve(root,'../..');
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
if(descriptor.sourceSha!==head || execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim())
  throw Error('GAFUS_RELEASE_REQUIRES_FRESH_REGISTERED_DESCRIPTOR_AND_CLEAN_SOURCE');
function run(cmd,args,cwd=root) {
  const p = spawnSync(cmd,args,{cwd,env,stdio:'inherit'});
  if(p.error) throw p.error;
  if(p.status!==0) throw Error('GAFUS_RELEASE_COMMAND_FAILED:'+cmd);
}
run('pnpm',['exec','expo','prebuild','--platform',platform,'--no-install']);
if(platform==='android'){
  run('./gradlew',[':app:assembleRelease','--no-daemon'],resolve(root,'android'));
  const apk=resolve(root,'android/app/build/outputs/apk/release/app-release.apk');
  run('python3',[resolve(root,'scripts/verify-native-ota-artifact.py'),apk,'--environment',env.APP_ENV]);
  run('adb',['-d','install','-r',apk]);
}else{
  // The generated Xcode guard checks the built .app before device installation.
  run('pnpm',['exec','expo','run:ios','--device','--configuration','Release']);
}
