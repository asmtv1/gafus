/** Store build-local diagnostics. Never upload, copy signing keys, or
 * rebuild source maps from an independent JS export. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';

const required=(ok,code)=>{if(!ok)throw Error('NATIVE_DIAGNOSTIC_ARCHIVE_'+code);};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function hashFile(file){
  const stat=fs.lstatSync(file);
  required(stat.isFile()&&!stat.isSymbolicLink(),'FILE_INVALID');
  const hash=crypto.createHash('sha256'),buffer=Buffer.alloc(1024*1024);
  const fd=fs.openSync(file,'r');
  try{let length;while((length=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,length));}
  finally{fs.closeSync(fd);}
  return hash.digest('hex');
}
const zipList=file=>execFileSync('unzip',['-Z1',file],{encoding:'utf8',maxBuffer:16*1024*1024}).split('\n').filter(Boolean);
const zipRead=(file,entry,max=50*1024*1024)=>execFileSync('unzip',['-p',file,entry],{maxBuffer:max});
function extractEntry(file,entry,output){
  const fd=fs.openSync(output,'wx',0o600);
  try{
    const run=spawnSync('unzip',['-p',file,entry],{stdio:['ignore',fd,'pipe']});
    required(run.status===0,'ZIP_EXTRACT_FAILED');
  }finally{fs.closeSync(fd);}
}
function unique(items,code){required(items.length===1,code);return items[0];}
function readPrivateMap(file){
  const stat=fs.lstatSync(file);
  required(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>=1000&&stat.size<=50*1024*1024,'SOURCE_MAP_INVALID');
  const bytes=fs.readFileSync(file),map=JSON.parse(bytes);
  required(map.version===3&&Array.isArray(map.sources)&&map.sources.length>0&&
    Array.isArray(map.names)&&typeof map.mappings==='string'&&map.mappings.length>0,'SOURCE_MAP_FORMAT');
  return bytes;
}
export function beginNativeDiagnosticCapture(env=process.env){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-native-release-private-'));
  fs.chmodSync(root,0o700);
  const capture=path.join(root,'capture'),work=path.join(root,'eas');
  fs.mkdirSync(capture,{mode:0o700});fs.mkdirSync(work,{mode:0o700});
  return {root,capture,work,startedAt:Date.now(),env:{...env,
    EAS_LOCAL_BUILD_WORKINGDIR:work,EAS_LOCAL_BUILD_SKIP_CLEANUP:'1',
    GAFUS_NATIVE_DIAGNOSTICS_CAPTURE_DIR:capture,
  }};
}
export function endNativeDiagnosticCapture(stage){
  // Only our own newly created directory; never leave EAS signing material.
  fs.rmSync(stage.root,{recursive:true,force:true});
}
function search(root,accept,depth=12){
  if(depth<0||!fs.existsSync(root))return [];
  const found=[];
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    const file=path.join(root,entry.name);
    if(entry.isSymbolicLink())continue;
    if(accept(file,entry))found.push(file);
    else if(entry.isDirectory()&&!['node_modules','.git','Pods','.gradle'].includes(entry.name))
      found.push(...search(file,accept,depth-1));
  }
  return found;
}
function matchingIosArchive(stage,bundleHash,executable,appPrefix){
  const roots=[stage.work,path.join(os.homedir(),'Library/Developer/Xcode/Archives')];
  const archives=roots.flatMap(root=>search(root,(file,e)=>e.isDirectory()&&file.endsWith('.xcarchive'),10))
    .filter(file=>fs.statSync(file).mtimeMs>=stage.startedAt-5000);
  const binaryUuids=file=>execFileSync('dwarfdump',['--uuid',file],{encoding:'utf8'})
    .split('\n').map(line=>line.match(/UUID: ([a-f0-9-]+)/i)?.[1]?.toLowerCase()).filter(Boolean).sort();
  const expected=binaryUuids(executable);
  required(expected.length>0,'IOS_UUID_MISSING');
  const matching=archives.filter(archive=>{
    const bundle=path.join(archive,'Products/Applications',appPrefix,'main.jsbundle');
    const dsym=path.join(archive,'dSYMs',appPrefix+'.dSYM');
    if(!fs.existsSync(bundle)||!fs.existsSync(dsym)||hashFile(bundle)!==bundleHash)return false;
    const actual=binaryUuids(dsym);
    return JSON.stringify(actual)===JSON.stringify(expected);
  });
  return {archive:unique(matching,'IOS_MATCHING_DSYM_ARCHIVE_REQUIRED'),uuids:expected};
}
export function createEmbeddedMapManifest({target,updateId,artifactHash,bundleHash,mapBytes,output}){
  required(uuid.test(updateId)&&/^[a-f0-9]{40}$/.test(target.sourceSha)&&
    /^[a-f0-9]{64}$/.test(artifactHash)&&/^[a-f0-9]{64}$/.test(bundleHash)&&
    ['ios','android'].includes(target.platform)&&['production','preview'].includes(target.environment)&&
    /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(target.runtimeVersion)&&target.runtimeVersion===target.appVersion&&
    /^\d{1,20}$/.test(target.buildNumber),'IDENTITY');
  fs.mkdirSync(output,{mode:0o700});
  const digest=sha(mapBytes),filename=digest+'.map';
  fs.writeFileSync(path.join(output,filename),mapBytes,{mode:0o600,flag:'wx'});
  const map=JSON.parse(mapBytes);
  const manifest={schemaVersion:1,private:true,retentionClass:'release-symbols',
    environment:target.environment,platform:target.platform,runtimeVersion:target.runtimeVersion,
    updateId,sourceSha:target.sourceSha,revision:0,nativeBuild:target.buildNumber,
    nativeArtifactSha256:artifactHash,embeddedBundleSha256:bundleHash,
    maps:[{filename,sha256:digest,sizeBytes:mapBytes.length,sourceCount:map.sources.length,
      logicalBundle:target.platform==='ios'?'main.jsbundle':'index.android.bundle'}],
    createdAt:new Date().toISOString()};
  fs.writeFileSync(path.join(output,'private-symbol-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
  return manifest;
}
export function readSignedEmbeddedUpdateId(artifact,platform){
  const entries=zipList(artifact);
  const entry=unique(entries.filter(e=>platform==='ios'
    ? /^Payload\/[^/]+\.app\/EXUpdates\.bundle\/app\.manifest$/.test(e)
    : /^(?:base\/)?assets\/app\.manifest$/.test(e)),'EMBEDDED_MANIFEST_REQUIRED');
  const id=JSON.parse(zipRead(artifact,entry,8*1024*1024)).id;
  required(uuid.test(id),'EMBEDDED_UPDATE_ID_INVALID');
  return id;
}
export function finalizeNativeDiagnosticCapture(stage,artifact,target,{archiveRoot=path.join(os.homedir(),'Library/Application Support/GAFUS/NativeDiagnostics')}={}){
  const entries=zipList(artifact),ios=target.platform==='ios';
  const bundleEntry=unique(entries.filter(e=>ios?/^Payload\/[^/]+\.app\/main\.jsbundle$/.test(e):
    /^(?:base\/)?assets\/index\.android\.bundle$/.test(e)),'EMBEDDED_BUNDLE_REQUIRED');
  const updateId=readSignedEmbeddedUpdateId(artifact,target.platform);
  const bundle=path.join(stage.capture,'signed-bundle.hbc');
  extractEntry(artifact,bundleEntry,bundle);
  const bundleHash=hashFile(bundle),artifactHash=hashFile(artifact);
  let mapFile,sourceInfo,dsym;
  if(ios){
    mapFile=path.join(stage.capture,'main.jsbundle.map');
    const proof=JSON.parse(fs.readFileSync(path.join(stage.capture,'bundle-proof.json'),'utf8'));
    required(proof.bundleSha256===bundleHash&&proof.mapSha256===hashFile(mapFile),'IOS_BUNDLE_MAP_MISMATCH');
    const prefix=bundleEntry.replace(/\/main\.jsbundle$/,'');
    const executable=path.join(stage.capture,'signed-main-executable');
    const info=path.join(stage.capture,'Info.plist');
    extractEntry(artifact,prefix+'/Info.plist',info);
    const name=execFileSync('/usr/bin/plutil',['-extract','CFBundleExecutable','raw','-o','-',info],{encoding:'utf8'}).trim();
    required(/^[a-zA-Z0-9_.-]{1,128}$/.test(name),'IOS_EXECUTABLE_INVALID');
    extractEntry(artifact,prefix+'/'+name,executable);
    dsym=matchingIosArchive(stage,bundleHash,executable,path.basename(prefix));
    sourceInfo={iosMachOUuids:dsym.uuids};
  }else{
    const maps=search(stage.work,(file,e)=>e.isFile()&&/\/app\/build\/generated\/sourcemaps\/react\/[^/]+\/index\.android\.bundle\.map$/.test(file));
    const pairs=maps.filter(file=>{
      const built=file.replace('/generated/sourcemaps/','/generated/assets/').replace(/\.map$/,'');
      return fs.existsSync(built)&&hashFile(built)===bundleHash;
    });
    mapFile=unique(pairs,'ANDROID_BUNDLE_MAP_MISMATCH');
    sourceInfo={};
  }
  const mapBytes=readPrivateMap(mapFile);
  fs.mkdirSync(archiveRoot,{recursive:true,mode:0o700});
  const rootStat=fs.lstatSync(archiveRoot);
  required(rootStat.isDirectory()&&!rootStat.isSymbolicLink()&&(rootStat.mode&0o077)===0,'PRIVATE_ROOT_REQUIRED');
  const output=path.join(archiveRoot,target.platform+'-'+target.appVersion+'-'+target.buildNumber+'-'+artifactHash.slice(0,16));
  fs.mkdirSync(output,{mode:0o700});
  try{
    const symbols=path.join(output,'symbols');
    createEmbeddedMapManifest({target,updateId,artifactHash,bundleHash,mapBytes,output:symbols});
    const native=path.join(output,'native');fs.mkdirSync(native,{mode:0o700});
    const file=path.join(native,ios?'dSYMs.zip':'r8-mapping.txt');
    if(ios){
      execFileSync('ditto',['-c','-k','--keepParent',path.join(dsym.archive,'dSYMs'),file]);
      fs.chmodSync(file,0o600);
    }else{
      // AAB's embedded R8 map is the authoritative store artifact.
      const r8=unique(entries.filter(e=>/^(?:base\/)?BUNDLE-METADATA\/com\.android\.tools\.build\.obfuscation\/proguard\.map$/.test(e)),'ANDROID_R8_REQUIRED');
      extractEntry(artifact,r8,file);
    }
    required(fs.statSync(file).size>0,'NATIVE_SYMBOLS_EMPTY');
    const receipt={schemaVersion:1,platform:target.platform,environment:target.environment,
      distribution:target.distribution,sourceSha:target.sourceSha,nativeReleaseId:target.id,
      nativeBuild:target.buildNumber,runtimeVersion:target.runtimeVersion,updateId,
      nativeArtifactSha256:artifactHash,embeddedBundleSha256:bundleHash,
      mapManifestSha256:hashFile(path.join(symbols,'private-symbol-manifest.json')),
      nativeSymbols:{filename:path.basename(file),sha256:hashFile(file),sizeBytes:fs.statSync(file).size},...sourceInfo};
    fs.writeFileSync(path.join(output,'native-diagnostics-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});
    return {state:'NATIVE_DIAGNOSTICS_ARCHIVED_LOCAL',output,artifactHash,updateId};
  }catch(error){fs.rmSync(output,{recursive:true,force:true});throw error;}
}
