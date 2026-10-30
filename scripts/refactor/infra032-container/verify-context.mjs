#!/usr/bin/env node
/** Read-only curated bundle integrity, pinned against an INDEPENDENT approved manifest. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {htmlRefs,jsDependencies,cssDependencies,allowed,fingerprint} from './prepare-context.mjs';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
function fail(code){throw Error(code)}
function safePath(p){
 if(!path.isAbsolute(p))fail('ABSOLUTE_PATH_REQUIRED');
 const q=path.resolve(p);if(!q.startsWith(ROOT+path.sep))fail('OUTSIDE_ROOT');
 let at=ROOT;
 for(const part of path.relative(ROOT,q).split(path.sep)){
  at=path.join(at,part);const st=fs.lstatSync(at,{throwIfNoEntry:false});
  if(!st)fail('MISSING_PATH');if(st.isSymbolicLink())fail('SYMLINK_DENIED');
 }
 return q;
}
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
function filenames(dir){
 const entries=fs.readdirSync(dir,{withFileTypes:true});
 if(entries.some(x=>x.isSymbolicLink()||!x.isFile()))fail('UNSUPPORTED_ENTRY');
 return entries.map(x=>x.name).sort();
}
function verify(context,manifestFile,configHash){
 const dir=safePath(context),manifestPath=safePath(manifestFile);
 if(!fs.statSync(dir).isDirectory()||!fs.statSync(manifestPath).isFile())fail('INPUT_TYPE');
 if(!/^[a-f0-9]{64}$/.test(configHash))fail('BAD_CONFIG_PIN');
 if(JSON.stringify(fs.readdirSync(dir).sort())!==JSON.stringify(['artifact-sha256.json','assets','index.html','nginx.conf']))fail('TOPLEVEL_ALLOWLIST');
 const assetsDir=safePath(path.join(dir,'assets'));
 if(!fs.statSync(assetsDir).isDirectory())fail('ASSET_DIRECTORY');
 const assets=filenames(assetsDir).map(x=>'assets/'+x);
 if(!assets.length||assets.some(x=>!allowed.test(x)||!fingerprint.test(x)))fail('ASSET_ALLOWLIST');
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 if(manifest.schema!=='ag4-static-artifact-hashes-v1'||!Array.isArray(manifest.files)||Object.keys(manifest).sort().join()!=='files,schema')fail('BAD_APPROVED_MANIFEST');
 const expected=new Map();
 for(const item of manifest.files){if(!item||Object.keys(item).sort().join()!=='path,sha256'||typeof item.path!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256)||expected.has(item.path))fail('BAD_APPROVED_ENTRY');expected.set(item.path,item.sha256)}
 const names=['index.html',...assets].sort();if(JSON.stringify([...expected.keys()].sort())!==JSON.stringify(names))fail('APPROVED_FILESET_MISMATCH');
 const entries=[];const dependencies=new Map();
 for(const name of names){const file=safePath(path.join(dir,name)),st=fs.lstatSync(file);if(!st.isFile()||st.size<1||st.size>10*1024*1024)fail('FILE_SIZE_OR_TYPE');const data=fs.readFileSync(file),hash=sha(data);
  if(hash!==expected.get(name))fail('HASH_MISMATCH');entries.push({path:name,sha256:hash});
  if(name.endsWith('.js')||name.endsWith('.css')){
   const txt=data.toString('utf8');if(txt.includes('\ufffd')||/sourceMappingURL/i.test(txt))fail('UNSUPPORTED_ASSET');
   dependencies.set(name,name.endsWith('.js')?jsDependencies(name,txt):cssDependencies(name,txt))
  }
 }
 const configPath=safePath(path.join(dir,'nginx.conf')),config=fs.readFileSync(configPath),configActual=sha(config);if(configActual!==configHash)fail('CONFIG_HASH_MISMATCH');entries.push({path:'nginx.conf',sha256:configHash});
 const refs=htmlRefs(fs.readFileSync(path.join(dir,'index.html'),'utf8'));
 const reached=new Set(),pending=[...refs];while(pending.length){const ref=pending.pop();if(!expected.has(ref))fail('MISSING_DEPENDENCY');if(reached.has(ref))continue;reached.add(ref);pending.push(...(dependencies.get(ref)||[]))}
 if(assets.some(name=>!reached.has(name)))fail('UNREACHABLE_ASSET');
 const receiptPath=safePath(path.join(dir,'artifact-sha256.json'));
 const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
 if(!receipt||receipt.schema!=='ag4-curated-static-v1'||Object.keys(receipt).sort().join()!=='files,schema'||!Array.isArray(receipt.files))fail('BAD_RECEIPT');
 const normalized=a=>a.map(x=>{if(!x||Object.keys(x).sort().join()!=='path,sha256'||typeof x.path!=='string'||typeof x.sha256!=='string')fail('BAD_RECEIPT_ENTRY');return x}).sort((a,b)=>a.path.localeCompare(b.path));
 if(JSON.stringify(normalized(receipt.files))!==JSON.stringify(normalized(entries)))fail('RECEIPT_MISMATCH');
 return {status:'verified',files:entries.length,approvedManifestSha256:sha(fs.readFileSync(manifestPath)),configSha256:configActual,receiptSha256:sha(fs.readFileSync(receiptPath))};
}
try{if(process.argv.length!==5)fail('USAGE');console.log(JSON.stringify(verify(...process.argv.slice(2))))}catch(e){console.error('AG4_VERIFY_'+(/^[A-Z_]+$/.test(e?.message??'')?e.message:'VALIDATION_FAILED'));process.exitCode=1}
