/** EAS success hook: fail if no final artifact can be verified. */
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const profile=process.env.EAS_BUILD_PROFILE;
if (['development','development-device'].includes(profile)) process.exit(0);
const platform=process.env.EAS_BUILD_PLATFORM;
const environment=process.env.APP_ENV;
const descriptor=process.env.GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR;
if(!descriptor||!existsSync(resolve(root,descriptor))) throw Error('GAFUS_EAS_REGISTERED_DESCRIPTOR_REQUIRED');
if(!['android','ios'].includes(platform) || !['production','preview'].includes(environment))
  throw Error('GAFUS_EAS_RELEASE_CONTEXT_REQUIRED');
function collect(dir,pattern) {
  if(!existsSync(dir)) return [];
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const file=resolve(dir,entry.name);
    return entry.isDirectory()?collect(file,pattern):entry.isFile()&&pattern.test(entry.name)?[file]:[];
  });
}
const artifacts=platform==='android'
  ? collect(resolve(root,'android/app/build/outputs'),/\.(apk|aab)$/i)
  : collect(resolve(root,'ios/build'),/\.ipa$/i);
if(!artifacts.length) throw Error('GAFUS_EAS_FINAL_OTA_ARTIFACT_MISSING');
for(const artifact of artifacts){
  const check=spawnSync('python3',[resolve(root,'scripts/verify-native-ota-artifact.py'),artifact,'--environment',environment,'--descriptor',resolve(root,descriptor)],{stdio:'inherit'});
  if(check.error) throw check.error;
  if(check.status!==0) throw Error('GAFUS_EAS_FINAL_OTA_ARTIFACT_INVALID:'+artifact);
}
