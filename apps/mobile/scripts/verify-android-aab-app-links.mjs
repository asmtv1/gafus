#!/usr/bin/env node
/**
 * Read-only release artifact smoke: native app link paths must be physically
 * embedded in the NEW Android App Bundle manifest, not merely in app.json.
 *
 * Android App Bundle uses protobuf XML; these exact ASCII string constants
 * must appear in the binary. This is a minimum artifact presence check, NOT a
 * substitute for Android OS verification/Google Play signer SHA-256.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const manifestStrings = [
  'gafus.ru','www.gafus.ru',
  '/training/','/reset-password','/feed/','/questions/',
  '/chats/','/moments/',
];
export function missingAppLinksFromBundleManifest(manifest) {
  return manifestStrings.filter(s=>!manifest.includes(Buffer.from(s)));
}
export function checkAndroidAabAppLinks(path) {
  if(!existsSync(path) || !/\.aab$/i.test(path)) throw Error('NEW_ANDROID_AAB_REQUIRED');
  const manifest=execFileSync('unzip',['-p',path,'base/manifest/AndroidManifest.xml'],{
    timeout:20000,maxBuffer:20*1024*1024});
  return missingAppLinksFromBundleManifest(manifest);
}
if(process.argv[1] && process.argv[1].endsWith('verify-android-aab-app-links.mjs')) {
  try {
    if(process.argv.length!==3) throw Error('USAGE: node verify-android-aab-app-links.mjs path/to/NEW.aab');
    const missing=checkAndroidAabAppLinks(resolve(process.argv[2]));
    if(missing.length) throw Error('ANDROID_AAB_NATIVE_LINK_PATHS_MISSING:'+missing.join(','));
    console.log('ANDROID_AAB_NATIVE_LINK_PATHS_PASS both domains; still verify assetlinks and Google Play App Signing SHA');
  }catch(e){ console.error('ANDROID_AAB_APP_LINKS_NOT_READY:'+e.message); process.exitCode=1; }
}
