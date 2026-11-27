/** Exact descriptor-bound IPA verification, shared by current and historical store releases. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const check=(ok,code)=>{if(!ok)throw Error('NATIVE_IOS_STORE_'+code);};
function readPlistFromIpa(ipa,entry){
  const raw=execFileSync('unzip',['-p',ipa,entry],{maxBuffer:4*1024*1024});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-ipa-plist-'));
  const tmp=path.join(dir,'metadata.plist');
  try{fs.writeFileSync(tmp,raw);return JSON.parse(execFileSync('plutil',['-convert','json','-o','-',tmp],
    {encoding:'utf8',maxBuffer:4*1024*1024}));}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
}
/** A decoded Apple profile contains NSDate/NSData values that plutil cannot
 * convert to JSON. Read just the fields needed for Store signature validation.
 */
export function verifyAppleStoreProvisioningProfile(profilePath){
  const lint=spawnSync('/usr/bin/plutil',['-lint',profilePath],{encoding:'utf8'});
  check(!lint.error && lint.status===0,'IPA_PROVISIONING_PLIST_INVALID');
  const read=(key)=>{
    const item=spawnSync('/usr/bin/plutil',['-extract',key,'raw','-o','-',profilePath],
      {encoding:'utf8',maxBuffer:4*1024*1024});
    if(item.error)throw item.error;
    return item.status===0?item.stdout.trim():null;
  };
  const expiry=read('ExpirationDate');
  check(read('ProvisionedDevices')===null && read('ProvisionsAllDevices')!=='true' &&
    read('Entitlements.get-task-allow')==='false' &&
    read('Entitlements.application-identifier')==='PJQ8PP666S.ru.gafus.app' &&
    expiry!==null && Number.isFinite(Date.parse(expiry)) && Date.parse(expiry)>Date.now(),
    'IPA_NOT_APP_STORE_DISTRIBUTION');
}

/** Verify actual Apple code signing and that provisioning is App Store, not ad hoc.
 * This runs only after the user builds the IPA; synthetic plist tests opt out.
 */
function verifyAppleStoreSignature(ipa,infoEntry){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-ios-store-signature-'));
  try{
    const prefix=path.dirname(infoEntry);
    const extracted=spawnSync('unzip',['-q',ipa,`${prefix}/*`,'-d',tmp],
      {encoding:'utf8',maxBuffer:4*1024*1024});
    check(extracted.status===0,'IPA_EXTRACT_FOR_SIGNATURE_FAILED');
    const appDir=path.join(tmp,prefix);
    const verify=spawnSync('/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',appDir],
      {encoding:'utf8',maxBuffer:4*1024*1024});
    check(verify.status===0,'IPA_APPLE_CODESIGN_INVALID');
    const provisioning=path.join(appDir,'embedded.mobileprovision');
    check(fs.existsSync(provisioning),'IPA_APP_STORE_PROVISIONING_MISSING');
    const profileXml=execFileSync('/usr/bin/security',['cms','-D','-i',provisioning],
      {maxBuffer:4*1024*1024});
    const profilePath=path.join(tmp,'provisioning.plist');
    fs.writeFileSync(profilePath,profileXml);
    verifyAppleStoreProvisioningProfile(profilePath);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}

export function verifyIpa(ipa,d,{metadataOnly=false}={}){
  check(fs.existsSync(ipa)&&fs.statSync(ipa).size>10_000_000,'IPA_MISSING_OR_TOO_SMALL');
  const entries=execFileSync('unzip',['-Z','-1',ipa],{encoding:'utf8',maxBuffer:8*1024*1024}).trim().split('\n');
  const infos=entries.filter(x=>/^Payload\/[^/]+\.app\/Info\.plist$/.test(x));
  check(infos.length===1,'IPA_INFO_PLIST_MISSING');
  const info=infos[0];
  const expo=info.replace(/Info\.plist$/,'Expo.plist');
  check(entries.filter(x=>x===expo).length===1,'IPA_EXPO_PLIST_MISSING');
  const i=readPlistFromIpa(ipa,info),e=readPlistFromIpa(ipa,expo);
  check(i.CFBundleIdentifier==='ru.gafus.app'&&i.CFBundleShortVersionString===d.appVersion&&
    String(i.CFBundleVersion)===d.buildNumber,'IPA_STORE_VERSION_MISMATCH');
  // Xcode 27 / iOS 27 kills legacy UIApplicationDelegate binaries at launch.
  // The actual signed IPA must declare the Expo SDK 57 scene delegate.
  const scenes=i.UIApplicationSceneManifest;
  check(scenes?.UIApplicationSupportsMultipleScenes===false&&
    scenes?.UISceneConfigurations?.UIWindowSceneSessionRoleApplication?.some(
      scene=>scene.UISceneDelegateClassName==='EXExpoAppSceneDelegate'),
    'IPA_IOS27_SCENE_LIFECYCLE_REQUIRED');
  check(e.EXUpdatesRuntimeVersion===d.runtimeVersion&&e.EXUpdatesURL===d.updateUrl&&
    e.EXUpdatesCheckOnLaunch==='NEVER'&&
    e.EXUpdatesRequestHeaders?.['expo-channel-name']===d.channel&&
    e.EXUpdatesRequestHeaders?.['x-gafus-native-fingerprint']===d.nativeFingerprint&&
    e.EXUpdatesCodeSigningMetadata?.keyid===d.signingKeyId&&
    e.EXUpdatesCodeSigningMetadata?.alg==='rsa-v1_5-sha256'&&
    e.EXUpdatesCodeSigningCertificate===d.certificatePem,'IPA_SELF_HOSTED_OTA_MISMATCH');
  if(!metadataOnly){
    execFileSync('python3',[path.join(path.dirname(fileURLToPath(import.meta.url)),'verify-native-ota-artifact.py'),ipa],{stdio:'inherit'});
    verifyAppleStoreSignature(ipa,info);
  }
  const digest=crypto.createHash('sha256').update(fs.readFileSync(ipa)).digest('hex');
  return {ipa,version:i.CFBundleShortVersionString,buildNumber:String(i.CFBundleVersion),
    otaUrl:e.EXUpdatesURL,channel:d.channel,nativeReleaseId:d.id,
    nativeFingerprint:d.nativeFingerprint,sha256:digest};
}
