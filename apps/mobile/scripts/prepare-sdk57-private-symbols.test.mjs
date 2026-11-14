import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildPrivateSymbolArchive} from './prepare-sdk57-private-symbols.mjs';
const uuid='b6b9dc0d-7e53-4da4-8f20-910fd3520be6';
const sha='a'.repeat(40);
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-sdk57-private-maps-'));
 t.after(()=>fs.rmSync(root,{force:true,recursive:true}));
 const mobile=path.join(root,'apps/mobile');fs.mkdirSync(mobile,{recursive:true});
 fs.writeFileSync(path.join(mobile,'app.json'),JSON.stringify({expo:{version:'1.8.0'}}));
 fs.writeFileSync(path.join(mobile,'package.json'),JSON.stringify({version:'1.8.0',dependencies:{expo:'57.0.33'}}));
 const exportRoot=path.join(root,'export'),assetRoot=path.join(exportRoot,'_expo/static/js/ios');
 fs.mkdirSync(assetRoot,{recursive:true});
 const map={version:3,sources:Array.from({length:200},(_,i)=>`/Users/private/person-${i}/source.ts`),sourcesContent:Array.from({length:200},()=> 'export const a = 123;'),names:[],mappings:''};
 fs.writeFileSync(path.join(assetRoot,'main-test.hbc.map'),JSON.stringify(map));
 return {repoRoot:root,exportRoot,outputDir:path.join(root,'private'),platform:'ios',environment:'preview',runtime:'1.8.0',sourceSha:sha,updateId:uuid,revision:'1'};
}
test('copies exact Hermes maps into private digest-keyed archive with no source paths in manifest',t=>{
 const args=fixture(t);const result=buildPrivateSymbolArchive(args);
 assert.equal(result.state,'LOCAL_PRIVATE_SYMBOLS_NOT_UPLOADED');
 const manifest=JSON.parse(fs.readFileSync(path.join(args.outputDir,'private-symbol-manifest.json'),'utf8'));
 assert.equal(manifest.maps.length,1);assert.equal(manifest.private,true);
 assert(!JSON.stringify(manifest).includes('/Users/private'));
 assert(fs.statSync(path.join(args.outputDir,manifest.maps[0].filename)).size>1000);
 assert.equal(fs.statSync(path.join(args.outputDir,manifest.maps[0].filename)).mode & 0o077,0);
});
test('refuses wrong runtime, untrusted SHA and output overwrite',t=>{
 const args=fixture(t);
 assert.throws(()=>buildPrivateSymbolArchive({...args,runtime:'1.7.4'}),/RUNTIME_NOT_SDK57/);
 assert.throws(()=>buildPrivateSymbolArchive({...args,sourceSha:'../escape'}),/SOURCE_SHA_INVALID/);
 buildPrivateSymbolArchive(args);
 assert.throws(()=>buildPrivateSymbolArchive(args),/OUTPUT_ALREADY_EXISTS/);
});
test('does not leave partially prepared private archive after malformed map',t=>{
 const args=fixture(t);const assetRoot=path.join(args.exportRoot,'_expo/static/js/ios');
 fs.writeFileSync(path.join(assetRoot,'main-test.hbc.map'),'\"bad\"');
 assert.throws(()=>buildPrivateSymbolArchive(args));assert.equal(fs.existsSync(args.outputDir),false);
});
