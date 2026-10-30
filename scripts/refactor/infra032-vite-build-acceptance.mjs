#!/usr/bin/env node
/** AG4-INFRA-032 Vite opt-in build acceptance. Never starts a server/imports a bundle. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inspect} from './verify_vite_browser_boundary.mjs';
import {validateSpaConfig} from './infra032-spa-policy.mjs';
const ROOT=path.resolve(fileURLToPath(new URL('../..',import.meta.url)));
const cases=[
 {app:'Trainer',folder:'infra032-vite-acceptance-trainer-20261022',
  nginxRoot:'apps/trainer-panel/src/vite-preparation/.opt-in-dist',
  viteConfig:'apps/trainer-panel/src/vite-preparation/vite.config.ts'},
 {app:'Admin',folder:'infra032-vite-acceptance-admin-20261022',
  nginxRoot:'apps/admin-panel/src/vite-preparation/.opt-in-dist',
  viteConfig:'apps/admin-panel/src/vite-preparation/vite.config.ts'},
];
const denySecret=/\b(?:DATABASE_URL|DIRECT_URL|REDIS_URL|NEXTAUTH_SECRET|JWT_SECRET|SESSION_SECRET|API_SECRET|SECRET_ACCESS_KEY|AWS_SECRET_ACCESS_KEY|S3_SECRET|RESEND_API_KEY|RUSTORE_PUSH_SERVICE_TOKEN)\b|process\.env\b|import\.meta\.env\b/;
const denyServer=/(?:\brequire\s*\(\s*['"](?:node:|fs|crypto|child_process|@prisma\/client|@gafus\/core)|\b__dirname\b|\b__filename\b|process\.versions\.node|process\.cwd\s*\()/;
const denyPwa=/(?:serviceWorker\s*\.\s*register\s*\(|pushManager\s*\.\s*subscribe\s*\(|vite-plugin-pwa|workbox-[a-z0-9-]+\.(?:m?js)|\bmanifest\.webmanifest\b)/i;
const denyRefused=/(?:AG4AdminConsultationNavShell20261021|AG4CancellationReceiptReview20261021)/;
function check(ok,why){if(!ok)throw Error('VITE_ACCEPTANCE_FAIL: '+why);}
function ownFile(rel){
 const abs=path.resolve(ROOT,rel);
 check(abs.startsWith(ROOT+path.sep),'outside exact project');
 let cur=ROOT;
 for(const part of path.relative(ROOT,abs).split(path.sep).filter(Boolean)){
  cur=path.join(cur,part);
  check(!fs.lstatSync(cur).isSymbolicLink(),'symlink not permitted in acceptance '+rel);
 }
 check(fs.statSync(abs).isFile(),'expected file '+rel);
 return abs;
}
function hash(text){return createHash('sha256').update(text).digest('hex');}
/** Only pure text/object inspections, safe for adversarial negative fixtures. */
export function inspectBuiltHtmlAndJs(html,chunk,chunkName){
 const scripts=[...html.matchAll(/<script\b[^>]*>/gi)];
 check(scripts.length===1,'exactly one script tag');
 const scriptsrc=scripts[0]?.[0].match(/\bsrc=["']([^"']+)["']/i)?.[1];
 check(/\btype=["']module["']/i.test(scripts[0][0]),'module script required');
 check(/^index-[A-Za-z0-9_-]+\.js$/.test(chunkName),'hashed Vite JS name');
 check(scriptsrc==='/assets/'+chunkName,'HTML must reference local hashed JS');
 check(!/(?:<link\b[^>]*\brel=["']?manifest|serviceWorker|workbox-)/i.test(html),'no HTML PWA');
 check(!/<script\b[^>]*src=["']https?:\/\//i.test(html),'no external script src');
 check(!denySecret.test(chunk),'no server secrets/env-access patterns in emitted bundle');
 check(!denyServer.test(chunk),'no Node runtime remnants in emitted bundle');
 check(!denyPwa.test(chunk),'no PWA runtime registration/Workbox artifact');
 check(!denyRefused.test(chunk),'no refused source names embedded in bundle');
 const scan=inspect(chunk,chunkName);
 check(scan.violations.length===0,'no forbidden runtime imports or PWA in built JS');
 check(scan.imports.length===0,'no unresolved JS module imports');
 check(!/sourceMappingURL\s*=/.test(chunk),'no source map comment in production-like bundle');
 return Object.freeze({oneReferencedLocalChunk:true,serverSecretPatternsAbsent:true,
  serverRuntimeImportsAbsent:true,pwaRegistrationAbsent:true,
  refusedSourceNamesAbsent:true,bundleIsSelfContained:true});
}
export function verifyBuiltAcceptance(){
 const nginx=fs.readFileSync(ownFile('scripts/refactor/infra032-spa-local.nginx.conf'),'utf8');
 validateSpaConfig(nginx);
 const results=[];
 for(const item of cases){
  const root='scripts/refactor/'+item.folder;
  const outputDir=path.resolve(ROOT,root);
  check(!fs.lstatSync(outputDir).isSymbolicLink(),'output symlink');
  const htmlBuf=fs.readFileSync(ownFile(root+'/index.html'));
  const assets=path.resolve(outputDir,'assets');
  check(!fs.lstatSync(assets).isSymbolicLink(),'assets symlink');
  const assetNames=fs.readdirSync(assets).sort();
  check(assetNames.length===1,'exactly one emitted JS asset');
  const asset=assetNames[0];
  const jsBuf=fs.readFileSync(ownFile(root+'/assets/'+asset));
  const proof=inspectBuiltHtmlAndJs(htmlBuf.toString('utf8'),jsBuf.toString('utf8'),asset);
  const nginxRoot=path.resolve(ROOT,item.nginxRoot);
  check(nginx.includes('root '+nginxRoot+';'),'existing INFRA032 root mapping documented');
  const viteSource=fs.readFileSync(ownFile(item.viteConfig),'utf8');
  check(viteSource.includes('.opt-in-dist'),'existing Vite default outDir agrees with INFRA032');
  check(outputDir!==nginxRoot,'isolated build must not overwrite peer default outDir');
  results.push({app:item.app,acceptanceOutput:root,configuredInfra032Root:item.nginxRoot,
   currentNginxPointsAtAcceptance:false,realHttpFileServingVerified:false,
   htmlSha256:hash(htmlBuf),jsSha256:hash(jsBuf),chunk:asset,jsBytes:jsBuf.length,...proof});
 }
 return results;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 for(const result of verifyBuiltAcceptance())console.log('VITE_ACCEPTANCE_STATIC_PASS '+JSON.stringify(result));
}
