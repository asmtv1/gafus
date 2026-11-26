#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { buildAndroid, buildIos, checkAndroidSigning } from './mobile-build-store.mjs';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const mobile=p=>path.join(p,'apps/mobile');
export const node=fs.existsSync('/opt/homebrew/opt/node@22/bin/node')?'/opt/homebrew/opt/node@22/bin/node':process.execPath;
export const java='/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home';
export const sdk=process.env.ANDROID_HOME||path.join(os.homedir(),'Library/Android/sdk');
export const targets={
 play:{label:'Google Play · AAB',platform:'android',distribution:'google-play',ext:'aab'},
 rustore:{label:'RuStore · APK',platform:'android',distribution:'rustore',ext:'apk'},
 appstore:{label:'App Store / TestFlight · IPA',platform:'ios',distribution:'app-store',ext:'ipa'},
 android:{label:'Android · эмулятор / USB (Debug)',platform:'android'},
 ios:{label:'iOS · симулятор / устройство (Debug)',platform:'ios'}
};
export function assert(ok,message){if(!ok)throw Error(message);}
export const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
export function run(cmd,args,{cwd=root,env=process.env,capture=false}={}){
 const r=spawnSync(cmd,args,{cwd,env,encoding:capture?'utf8':undefined,stdio:capture?['ignore','pipe','inherit']:'inherit',maxBuffer:32*1024*1024});
 if(r.error)throw r.error;assert(r.status===0,path.basename(cmd)+' завершился с кодом '+r.status);return capture?r.stdout.trim():undefined;
}
const git=(dir,...a)=>run('git',a,{cwd:dir,capture:true});
export function composeEnv(base,values,production,version){
 return {...Object.fromEntries(Object.entries(base).filter(([k])=>!k.startsWith('EXPO_PUBLIC_')&&!k.startsWith('GAFUS_OTA_')&&!k.startsWith('OTA_'))),
 ...Object.fromEntries(Object.entries(values).filter(([k])=>k.startsWith('EXPO_PUBLIC_'))),
 APP_ENV:production?'production':'development',NODE_ENV:production?'production':'development',EXPO_NO_DOTENV:'1',
 EXPO_PUBLIC_API_BASE_URL:'https://api.gafus.ru',EXPO_PUBLIC_CHAT2_API_ORIGIN:'https://api.gafus.ru',EXPO_PUBLIC_APP_VERSION:version,
 EXPO_PUBLIC_YM_MOBILE_ENABLED:'true',EXPO_PUBLIC_GAFUS_ANALYTICS_DEBUG:production?'0':'1',EXPO_PUBLIC_REWARDED_ADS_TEST_MODE:production?'false':'true',
 EXPO_PUBLIC_ENABLE_TRACER:'false',OTA_PAYMENT_CONTENT:'standard',GAFUS_OTA_TRANSPORT:production?'self-hosted':'eas',
 ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,JAVA_HOME:java,PATH:path.dirname(node)+':'+java+'/bin:'+(base.PATH||'')};
}
function env(dir,prod,ver){
 const req=createRequire(path.join(mobile(dir),'package.json'));
 // Read public configuration only; never source the server's shell environment.
 const prior=process.env.NODE_ENV;
 try{process.env.NODE_ENV=prod?'production':'development';return composeEnv(process.env,req('@expo/env').get(root,{force:true}).env,prod,ver);}
 finally{if(prior===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=prior;}
}
function app(dir){const a=read(path.join(mobile(dir),'app.json')).expo;assert(a.version===read(path.join(mobile(dir),'package.json')).version,'Версии app.json и package.json различаются');return a;}
export function matches(d,t,a,head){
 return !!d&&d.platform===t.platform&&d.distribution===t.distribution&&d.environment==='production'&&d.channel==='production'&&d.verified===false&&d.updateUrl==='https://gafus.ru/ota/manifest'&&d.appVersion===a.version&&d.runtimeVersion===a.version&&/^[1-9]\d*$/.test(String(d.buildNumber))&&(t.platform==='ios'||String(a.android.versionCode)===String(d.buildNumber))&&d.sourceSha===head&&/^[a-f0-9]{64}$/.test(d.nativeFingerprint||'')&&/^[a-f0-9-]{36}$/.test(d.id||'');
}
const worktrees=()=>git(root,'worktree','list','--porcelain').split('\n').filter(l=>l.startsWith('worktree ')).map(l=>l.slice(9)).filter(p=>fs.existsSync(path.join(mobile(p),'app.json')));
function descriptors(dir,t){
 const f=path.join(mobile(dir),'.ota-certs');if(!fs.existsSync(f))return [];
 const files=fs.readdirSync(f).filter(n=>n.endsWith('.json')).map(n=>path.join(f,n));
 const parsed=files.map(p=>{try{return {p,d:read(p)};}catch{return null;}}).filter(x=>x?.d?.distribution===t.distribution&&x.d?.platform===t.platform);
 if(!parsed.length)return [];
 const a=app(dir),head=git(dir,'rev-parse','HEAD');
 return parsed.filter(x=>matches(x.d,t,a,head)).map(x=>x.p);
}
export function preflight(dir,t,file){
 const a=app(dir),m=mobile(dir),d=read(file);
 assert(!git(dir,'status','--porcelain','--untracked-files=all'),'Релиз требует чистый worktree; локальные изменения не трогаются.');
 assert(matches(d,t,a,git(dir,'rev-parse','HEAD')),'Дескриптор не соответствует магазину / версии / исходникам.');
 const f=JSON.parse(run(node,[path.join(m,'scripts/native-source-fingerprint.mjs'),dir,file],{capture:true,cwd:m}));
 assert(f.fingerprint===d.nativeFingerprint,'Native fingerprint изменился.');
 const e=env(dir,true,a.version);
 const placement=t.platform==='ios'?'EXPO_PUBLIC_REWARDED_ADS_IOS_PLACEMENT_ID':'EXPO_PUBLIC_REWARDED_ADS_ANDROID_PLACEMENT_ID';
 for(const k of ['EXPO_PUBLIC_YM_MOBILE_API_KEY','EXPO_PUBLIC_ACCOUNT_DELETION_URL',placement])assert(e[k],'Нет переменной '+k+' в корневом .env');
 Object.assign(e,{GAFUS_OTA_TARGET_PLATFORM:t.platform,GAFUS_OTA_LOCAL_STORE_BUILD:'true',GAFUS_OTA_LOCAL_DEVICE_TEST:'false',GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR:path.relative(m,file),GAFUS_OTA_NATIVE_CERTIFICATE:'.ota-certs/native.pem'});
 const c=JSON.parse(run('pnpm',['exec','expo','config','--json'],{cwd:m,env:e,capture:true}));
 assert(c.version===d.appVersion&&String(t.platform==='android'?c.android.versionCode:c.ios.buildNumber)===String(d.buildNumber)&&c.updates?.url===d.updateUrl&&c.updates.checkAutomatically==='NEVER'&&c.updates.requestHeaders?.['x-gafus-native-fingerprint']===d.nativeFingerprint&&c.extra?.otaNativeReleaseId===d.id,'Expo OTA / version mismatch');
 assert(c.extra.ymMobileEnabled&&c.extra.ymMobileApiKey===e.EXPO_PUBLIC_YM_MOBILE_API_KEY&&c.extra[t.platform==='ios'?'rewardedAdsIosPlacementId':'rewardedAdsAndroidPlacementId']===e[placement]&&!c.extra.analyticsDebug&&!c.extra.rewardedAdsTestMode,'Production ENV mismatch');
 if(t.platform==='android')checkAndroidSigning();
 console.log('PASS: '+t.label+' '+d.appVersion+' ('+d.buildNumber+'), production ENV, GAFUS OTA, fingerprint, standard payment');
 return {dir,m,d,e,c,t};
}
async function choose(rl,title,items,label=x=>x){
 console.log('\n'+title);items.forEach((x,i)=>console.log('  '+(i+1)+'. '+label(x)));console.log('  0. Выход');
 const v=(await rl.question('Выбор: ')).trim();if(v==='0'||v==='')return null;
 assert(/^\d+$/.test(v)&&Number(v)>0&&Number(v)<=items.length,'Неверный номер');return items[Number(v)-1];
}
async function main(){
 const args=process.argv.slice(2);
 if(args[0]==='--help'){console.log('pnpm mobile:build — меню\npnpm mobile:build --list — релизные дескрипторы\npnpm mobile:build --check <play|rustore|appstore> <worktree> <descriptor> — preflight без сборки');return;}
 if(args[0]==='--list'){for(const dir of worktrees())for(const t of Object.values(targets).filter(t=>t.ext))for(const f of descriptors(dir,t))console.log(t.label+' | '+dir+' | '+f);return;}
 if(args[0]==='--check'){assert(targets[args[1]]?.ext&&args.length===4,'--check <target> <worktree> <descriptor>');preflight(path.resolve(args[2]),targets[args[1]],path.resolve(args[3]));return;}
 assert(!args.length&&process.stdin.isTTY,'Запустите в обычном Terminal: pnpm mobile:build');
 const rl=createInterface({input:process.stdin,output:process.stdout});
 try{
  console.log('\n╔══════════════════════════════════╗\n║       GAFUS MOBILE BUILDER       ║\n╚══════════════════════════════════╝');
  const key=await choose(rl,'Что собираем?',Object.keys(targets),k=>targets[k].label);if(!key)return;
  const t=targets[key];
  if(!t.ext){
   console.log('Debug: production API, тестовая реклама, без store signing. Expo предложит устройство.');
   rl.close();run('pnpm',['exec','expo','run:'+t.platform,'--device'],{cwd:mobile(root),env:env(root,false,app(root).version)});return;
  }
  const actions=['Собрать','Только проверить','Подготовить новый OTA-кандидат','Завершить регистрацию кандидата'];
  const action=await choose(rl,'Действие',actions);if(!action)return;
  const dir=await choose(rl,'Исходники (worktree)',worktrees(),p=>p+' · '+app(p).version+' · '+git(p,'rev-parse','--short','HEAD'));if(!dir)return;
  const m=mobile(dir),a=app(dir),head=git(dir,'rev-parse','HEAD');
  assert(!git(dir,'status','--porcelain','--untracked-files=all'),'Для store нужен чистый коммит; выберите чистый worktree.');
  const folder=path.join(m,'.ota-certs');fs.mkdirSync(folder,{recursive:true,mode:0o700});
  if(actions.indexOf(action)>=2){
   const number=t.platform==='android'?String(a.android.versionCode):(await rl.question('Номер iOS build (из App Store Connect): ')).trim();
   assert(/^[1-9]\d*$/.test(number),'Неверный номер сборки');
   const stem=key+'-'+number+'-'+head.slice(0,12);
   const config=path.join(folder,stem+'-config.json'),candidate=path.join(folder,stem+'-candidate.json'),descriptor=path.join(folder,stem+'-native.json');
   const script=path.join(m,'scripts/prepare-self-hosted-native-build.mjs');
   if(action===actions[2]){
    assert(!fs.existsSync(candidate)&&!fs.existsSync(config),'Кандидат уже создан. Не регистрируйте повторно.');
    fs.writeFileSync(config,JSON.stringify({environment:'production',platform:t.platform,distribution:t.distribution,buildNumber:number,operationId:'gafus-'+stem,sourceSha:head,apiOrigin:'https://gafus.ru',ciRunId:'local-'+stem,buildLogRef:'local-'+stem}),{mode:0o600,flag:'wx'});
    run(node,[script,'prepare',config,candidate],{cwd:m});
    console.log('Зарегистрируйте JSON в https://adminka.gafus.ru/mobile-ota → Нативные сборки → Зарегистрировать без активации:\n'+candidate);return;
   }
   assert(fs.existsSync(candidate),'Сначала подготовьте кандидат');
   const id=(await rl.question('Native release UUID из админки: ')).trim();
   run(node,[script,'finalize',candidate,descriptor,id],{cwd:m});
   const d=read(descriptor);const pem=path.join(folder,'native.pem');
   if(fs.existsSync(pem))assert(fs.readFileSync(pem,'utf8')===d.certificatePem,'Существующий OTA сертификат не совпадает; не перезаписываю.');
   else fs.writeFileSync(pem,d.certificatePem,{mode:0o600,flag:'wx'});
   console.log('Дескриптор: '+descriptor);return;
  }
  const list=descriptors(dir,t);assert(list.length,'Нет зарегистрированного дескриптора для выбранного коммита и магазина.');
  const file=await choose(rl,'Релиз',list,p=>{const d=read(p);return d.appVersion+' ('+d.buildNumber+') · '+path.basename(p);});if(!file)return;
  const s=preflight(dir,t,file);if(action===actions[1])return;
  const output=path.join(os.homedir(),'Desktop','GAFUS-builds');fs.mkdirSync(output,{recursive:true});
  const out=path.join(output,'gafus-'+s.d.appVersion+'-'+s.d.buildNumber+'-'+key+'.'+t.ext);
  assert(!fs.existsSync(out),'Артефакт уже существует: '+out);
  console.log('Выход: '+out+'\nНикаких автоматических публикаций.');
  if((await rl.question('Начать сборку? [y/N] ')).trim().toLowerCase()!=='y')return;
  rl.close();
  const lock=path.join(folder,'.local-build.lock');const fd=fs.openSync(lock,'wx',0o600);
  try{
   fs.writeFileSync(fd,String(process.pid));
   // Do not clean generated native projects while another build is using them.
   const busy=spawnSync('pgrep',['-fl','GradleWrapperMain|gafus-17603-google-play-build.cjs|eas-cli|xcodebuild'],{encoding:'utf8'});
   assert(busy.status===1,'Обнаружен другой Gradle/EAS/Xcode build. Сначала завершите его.');
   if(t.platform==='android')buildAndroid(s,out);else buildIos(s,out);
   console.log('ГОТОВО: '+out);run('shasum',['-a','256',out]);
  }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
 }finally{rl.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('ОШИБКА: '+e.message);process.exitCode=1;});
