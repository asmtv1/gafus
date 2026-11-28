import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {beginNativeDiagnosticCapture,endNativeDiagnosticCapture,finalizeNativeDiagnosticCapture,hashFile} from './native-store-diagnostic-archive.mjs';
const require=createRequire(import.meta.url);
const target={id:'b6b9dc0d-7e53-4da4-8f20-910fd3520be6',platform:'android',
 environment:'production',distribution:'google-play',appVersion:'1.7.6',runtimeVersion:'1.7.6',
 buildNumber:'17603',sourceSha:'a'.repeat(40)};
const updateId='511ba31a-4a63-4b7b-b025-e27772d44ea7';
function fixture(t,{mismatch=false,noR8=false}={}){
 const stage=beginNativeDiagnosticCapture({});t.after(()=>endNativeDiagnosticCapture(stage));
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-native-symbol-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dir=path.join(stage.work,'build/apps/mobile/android/app/build/generated');
 const built=path.join(dir,'assets/react/release/index.android.bundle');
 const map=path.join(dir,'sourcemaps/react/release/index.android.bundle.map');
 fs.mkdirSync(path.dirname(built),{recursive:true});fs.mkdirSync(path.dirname(map),{recursive:true});
 fs.writeFileSync(built,mismatch?'wrong bundle':'signed hermes bytecode');
 fs.writeFileSync(map,JSON.stringify({version:3,sources:['apps/mobile/app/index.tsx'],names:[],mappings:'AAAA',sourcesContent:['x'.repeat(1600)]}));
 const archive=path.join(root,'release.aab');
 const zip={'base/assets/index.android.bundle':'signed hermes bytecode','base/assets/app.manifest':JSON.stringify({id:updateId})};
 if(!noR8)zip['BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map']='ru.gafus.app.MainActivity -> a.b:\n';
 execFileSync('python3',['-c','import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],"w") as z:\n for n,v in json.loads(sys.argv[2]).items(): z.writestr(n,v)',archive,JSON.stringify(zip)]);
 return {stage,archive,archiveRoot:path.join(root,'private')};
}
test('store archive matches exact bundle and copies authoritative R8 from AAB',async t=>{
 const {stage,archive,archiveRoot}=fixture(t);
 const result=finalizeNativeDiagnosticCapture(stage,archive,target,{archiveRoot});
 const receipt=JSON.parse(fs.readFileSync(path.join(result.output,'native-diagnostics-receipt.json')));
 assert.equal(receipt.nativeArtifactSha256,hashFile(archive));
 assert.equal(receipt.updateId,updateId);
 assert.equal(receipt.nativeSymbols.sha256,hashFile(path.join(result.output,'native/r8-mapping.txt')));
 const manifest=JSON.parse(fs.readFileSync(path.join(result.output,'symbols/private-symbol-manifest.json')));
 assert.equal(manifest.nativeBuild,target.buildNumber);assert.equal(manifest.revision,0);
 assert.equal(manifest.embeddedBundleSha256,receipt.embeddedBundleSha256);
 assert.equal(fs.statSync(result.output).mode&0o077,0);
 const {planPrivateSymbolUpload}=await import('../../../packages/cdn-upload/scripts/upload-mobile-private-symbols.mjs');
 const plan=planPrivateSymbolUpload(path.join(result.output,'symbols'));
 assert.equal(plan.runtime,'1.7.6');
 assert.throws(()=>finalizeNativeDiagnosticCapture(stage,archive,target,{archiveRoot}));
});
test('rejects mismatched bundle and absent R8 without falsely declaring archive complete',t=>{
 const a=fixture(t,{mismatch:true});
 assert.throws(()=>finalizeNativeDiagnosticCapture(a.stage,a.archive,target,{archiveRoot:a.archiveRoot}),/ANDROID_BUNDLE_MAP_MISMATCH/);
 const b=fixture(t,{noR8:true});
 assert.throws(()=>finalizeNativeDiagnosticCapture(b.stage,b.archive,target,{archiveRoot:b.archiveRoot}),/ANDROID_R8_REQUIRED/);
 assert.deepEqual(fs.readdirSync(b.archiveRoot),[]);
});
test('Xcode capture plugin is idempotent and binds the final Hermes map and binary',()=>{
 const {patchBundleScript}=require('../plugins/withNativeDiagnosticSymbols.js');
 const input='echo before\nreact-native-xcode.sh\n';
 const patched=patchBundleScript(input);
 assert.equal(patchBundleScript(patched),patched);
 assert.match(patched,/export SOURCEMAP_FILE=/);
 assert.match(patched,/bundleSha256/);
 assert.match(patched,/mapSha256/);
 assert.throws(()=>patchBundleScript('echo wrong'),/SCRIPT_CHANGED/);
});
