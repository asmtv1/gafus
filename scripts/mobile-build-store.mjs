import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,mobile,node,java,sdk,assert,read,run} from './mobile-build.mjs';
const signer='4ab516cf4fe26131a714d08486aa6c2b10701e8d4bbd20b3043d6499c040d8f9';
const javaTool=name=>path.join(java,'bin',name);
const fingerprints=s=>[...s.matchAll(/SHA256:\s*([a-fA-F0-9:]+)/g)].map(m=>m[1].replace(/:/g,'').toLowerCase());
function sdkTool(name){
 const base=path.join(sdk,'build-tools');
 const p=fs.readdirSync(base).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})).map(n=>path.join(base,n,name)).find(p=>fs.existsSync(p));
 assert(p,'Android build-tools: '+name+' не найден');return p;
}
export function checkAndroidSigning(){
 const p=path.join(mobile(root),'credentials.json'),c=read(p).android.keystore;
 const store=path.resolve(path.dirname(p),c.keystorePath);
 assert(fs.existsSync(store)&&c.keyAlias&&c.keyPassword&&c.keystorePassword,'Android credentials отсутствуют');
 const env={...process.env,GAFUS_KEYSTORE_PASSWORD:c.keystorePassword};
 const result=run(javaTool('keytool'),['-list','-v','-keystore',store,'-alias',c.keyAlias,'-storepass:env','GAFUS_KEYSTORE_PASSWORD'],{env,capture:true});
 assert(fingerprints(result).includes(signer),'Android ключ не совпадает с прежним upload/release сертификатом');
 return {store,c};
}
function verifyOta(file){
 run('python3',[path.join(mobile(root),'scripts/verify-native-ota-artifact.py'),file]);
}
function verifyAndroid(s,file){
 const {t,d,e,m}=s,prefix=t.ext==='aab'?'base/':'';
 verifyOta(file);
 const conf=JSON.parse(run('unzip',['-p',file,prefix+'assets/app.config'],{capture:true}));
 const x=conf.extra;
 assert(conf.version===d.appVersion&&String(conf.android.versionCode)===String(d.buildNumber)&&x.otaNativeReleaseId===d.id&&x.otaNativeFingerprint===d.nativeFingerprint&&x.ymMobileApiKey===e.EXPO_PUBLIC_YM_MOBILE_API_KEY&&x.rewardedAdsAndroidPlacementId===e.EXPO_PUBLIC_REWARDED_ADS_ANDROID_PLACEMENT_ID&&!x.analyticsDebug&&!x.rewardedAdsTestMode,'Embedded production config mismatch');
 if(t.ext==='aab'){
  for(const v of ['verify-android-payment-aab.mjs','verify-android-media-permissions.mjs','verify-android-aab-16k.mjs','verify-android-aab-app-links.mjs','verify-android-aab-compressor.mjs'])run(node,[path.join(mobile(root),'scripts',v),file]);
  run(javaTool('jarsigner'),['-verify',file]);
  assert(fingerprints(run(javaTool('keytool'),['-printcert','-jarfile',file],{capture:true})).includes(signer),'AAB подписан не тем ключом');
 }else{
  const badging=run(sdkTool('aapt'),['dump','badging',file],{capture:true});
  assert(badging.includes("name='ru.gafus.app'")&&badging.includes("versionCode='"+d.buildNumber+"'")&&badging.includes("versionName='"+d.appVersion+"'"),'APK native version mismatch');
  assert(run(sdkTool('apksigner'),['verify','--print-certs',file],{capture:true}).toLowerCase().includes('sha-256 digest: '+signer),'APK подпись не совпадает');
 }
 run('python3',['-c','import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); p="base/" if sys.argv[1].endswith(".aab") else ""; b=z.read(p+"assets/index.android.bundle"); forbidden=[b"/yookassa/start",b"/promo/validate",b"/promocodes/validate","Оплата через ЮKassa".encode()]; assert not any(x in b for x in forbidden),"Unexpected checkout"; assert b"/google/play/verify" in b,"Google Play Billing missing"; assert sys.argv[2].encode() in b,"Account deletion URL missing"',file,e.EXPO_PUBLIC_ACCOUNT_DELETION_URL]);
}
export function buildAndroid(s,out){
 const {m,e,t}=s,{store,c}=checkAndroidSigning();
 run('pnpm',['exec','expo','prebuild','--platform','android','--clean','--no-install'],{cwd:m,env:e});
 fs.writeFileSync(path.join(m,'android/local.properties'),'sdk.dir='+sdk+'\n');
 const injected={...e,'ORG_GRADLE_PROJECT_android.injected.signing.store.file':store,'ORG_GRADLE_PROJECT_android.injected.signing.store.password':c.keystorePassword,'ORG_GRADLE_PROJECT_android.injected.signing.key.alias':c.keyAlias,'ORG_GRADLE_PROJECT_android.injected.signing.key.password':c.keyPassword};
 const aab=t.ext==='aab',android=path.join(m,'android');
 run('./gradlew',[aab?':app:bundleRelease':':app:assembleRelease','--no-daemon','--max-workers=2','-Dhttps.protocols=TLSv1.2','--console=plain'],{cwd:android,env:injected});
 const raw=path.join(android,'app/build/outputs',aab?'bundle/release/app-release.aab':'apk/release/app-release.apk');
 assert(fs.existsSync(raw),'Сборка не создала артефакт');
 if(aab){verifyAndroid(s,raw);fs.copyFileSync(raw,out,fs.constants.COPYFILE_EXCL);return;}
 // Gradle's APK can still be debug signed. Explicit release re-sign and verify.
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-rustore-'));
 try{
  const aligned=path.join(tmp,'aligned.apk'),signed=path.join(tmp,'release.apk');
  run(sdkTool('zipalign'),['-P','16','-f','4',raw,aligned]);
  run(sdkTool('apksigner'),['sign','--ks',store,'--ks-key-alias',c.keyAlias,'--ks-pass','env:GAFUS_STORE_PASS','--key-pass','env:GAFUS_KEY_PASS','--out',signed,aligned],{env:{...e,GAFUS_STORE_PASS:c.keystorePassword,GAFUS_KEY_PASS:c.keyPassword}});
  verifyAndroid(s,signed);fs.copyFileSync(signed,out,fs.constants.COPYFILE_EXCL);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
export function buildIos(s,out){
 const {m,e,d}=s,profile='production-local',eas=read(path.join(m,'eas.json')),p=eas.build[profile];
 assert(p&&p.autoIncrement===false&&eas.build[p.extends]?.autoIncrement!==true,'EAS должен запрещать autoIncrement');
 const cli=['--yes','eas-cli@27.4.1'];
 if(eas.cli?.appVersionSource==='remote'){
  const v=JSON.parse(run('npx',[...cli,'build:version:get','--platform','ios','--profile',profile,'--json','--non-interactive'],{cwd:m,env:e,capture:true}));
  const number=v.buildNumber??v.ios?.buildNumber??v.version?.buildNumber??v.ios?.version;
  assert(String(number)===String(d.buildNumber),'Номер EAS не совпадает с дескриптором. Синхронизируйте номер вручную.');
 }
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-ios-store-'));
 try{
  const ipa=path.join(temp,'store.ipa');
  run('npx',[...cli,'build','--platform','ios','--profile',profile,'--local','--non-interactive','--output',ipa],{cwd:m,env:e});
  verifyOta(ipa);
  run('python3',['-c','import plistlib,zipfile,re,sys; z=zipfile.ZipFile(sys.argv[1]); p=[n for n in z.namelist() if re.fullmatch(r"Payload/[^/]+\\.app/Info\\.plist",n)]; assert len(p)==1; i=plistlib.loads(z.read(p[0])); e=plistlib.loads(z.read(p[0].replace("Info.plist","Expo.plist"))); assert i["CFBundleIdentifier"]=="ru.gafus.app" and i["CFBundleShortVersionString"]==sys.argv[2] and str(i["CFBundleVersion"])==sys.argv[3] and e["EXUpdatesRuntimeVersion"]==sys.argv[2] and e["EXUpdatesRequestHeaders"]["x-gafus-native-fingerprint"]==sys.argv[4] and e["EXUpdatesCodeSigningMetadata"]["keyid"]==sys.argv[5],"IPA identity mismatch"',ipa,d.appVersion,String(d.buildNumber),d.nativeFingerprint,d.signingKeyId]);
  run('unzip',['-q',ipa,'Payload/*','-d',temp]);
  const dir=path.join(temp,'Payload'),app=path.join(dir,fs.readdirSync(dir).find(n=>n.endsWith('.app')));
  run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
  const sign=spawnSync('/usr/bin/codesign',['-dv','--verbose=4',app],{encoding:'utf8'});
  assert(sign.status===0&&/Authority=(Apple Distribution|iPhone Distribution)/.test(sign.stderr),'IPA не подписан Apple Distribution');
  const provision=run('/usr/bin/security',['cms','-D','-i',path.join(app,'embedded.mobileprovision')],{capture:true});
  const pf=path.join(temp,'profile.plist');fs.writeFileSync(pf,provision,{mode:0o600});
  const pp=JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-',pf],{capture:true}));
  assert(pp.Entitlements?.['get-task-allow']===false&&!pp.ProvisionedDevices&&!pp.ProvisionsAllDevices&&pp.Entitlements?.['application-identifier']?.endsWith('.ru.gafus.app'),'Неподходящий App Store provisioning profile');
  fs.copyFileSync(ipa,out,fs.constants.COPYFILE_EXCL);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
