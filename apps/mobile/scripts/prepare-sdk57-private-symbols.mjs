#!/usr/bin/env node
/** SDK57 Hermes maps are private release artifacts, NEVER public OTA assets.
 * OFFLINE preparation only. A verified, immutable private-bucket uploader is
 * separate and disabled by default. No AppTracer/Uptrace network calls here. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const SHA=/^[0-9a-f]{40}$/i;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REV=/^[1-9][0-9]{0,9}$/;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const ensure=(condition,code)=>{if(!condition)throw Error('SYMBOL_ARCHIVE_'+code);};
const OUT=/^[a-f0-9]{64}\.map$/;
export function buildPrivateSymbolArchive(input){
  const {repoRoot,exportRoot,outputDir,platform,environment,runtime,sourceSha,updateId,revision}=input;
  ensure(['ios','android'].includes(platform),'PLATFORM_INVALID');
  ensure(['preview','production'].includes(environment),'ENV_INVALID');
  ensure(runtime==='1.8.0','RUNTIME_NOT_SDK57');
  ensure(SHA.test(sourceSha),'SOURCE_SHA_INVALID');
  ensure(UUID.test(updateId),'UPDATE_ID_INVALID');
  ensure(REV.test(String(revision)),'REVISION_INVALID');
  const config=JSON.parse(fs.readFileSync(path.join(repoRoot,'apps/mobile/app.json'),'utf8')).expo;
  const pkg=JSON.parse(fs.readFileSync(path.join(repoRoot,'apps/mobile/package.json'),'utf8'));
  ensure(config.version===runtime&&pkg.version===runtime&&pkg.dependencies.expo==='57.0.33','APP_VERSION_MISMATCH');
  const assetRoot=path.resolve(exportRoot,'_expo/static/js',platform);
  ensure(fs.existsSync(assetRoot)&&fs.statSync(assetRoot).isDirectory(),'EXPORT_MISSING');
  const files=fs.readdirSync(assetRoot).filter(n=>/^[a-zA-Z0-9_.-]+\.hbc\.map$/.test(n)).sort();
  ensure(files.length>=1&&files.length<=8,'MAPS_COUNT_INVALID');
  ensure(!fs.existsSync(outputDir),'OUTPUT_ALREADY_EXISTS');
  fs.mkdirSync(outputDir,{recursive:false,mode:0o700});
  const maps=[];
  try{
    for(const file of files){
      const from=path.join(assetRoot,file);
      ensure(fs.lstatSync(from).isFile()&&!fs.lstatSync(from).isSymbolicLink(),'MAP_LINK_REJECTED');
      const bytes=fs.readFileSync(from);
      ensure(bytes.length>=1000&&bytes.length<=50*1024*1024,'MAP_SIZE_INVALID');
      const json=JSON.parse(bytes.toString('utf8'));
      ensure(json.version===3&&Array.isArray(json.sources)&&json.sources.length>0,'MAP_SCHEMA_INVALID');
      // Do not include original local paths in a public/release JSON receipt.
      const digest=hash(bytes),name=`${digest}.map`;
      ensure(OUT.test(name),'MAP_NAME_INVALID');
      fs.writeFileSync(path.join(outputDir,name),bytes,{flag:'wx',mode:0o600});
      maps.push({filename:name,sha256:digest,sizeBytes:bytes.length,
        sourceCount:json.sources.length,logicalBundle:file.slice(0,-4)});
    }
    const identity={schemaVersion:1,private:true,retentionClass:'release-symbols',
      environment,platform,runtimeVersion:runtime,updateId,sourceSha,revision:Number(revision),
      maps,createdAt:new Date().toISOString()};
    const manifest=JSON.stringify(identity,null,2)+'\n';
    fs.writeFileSync(path.join(outputDir,'private-symbol-manifest.json'),manifest,{flag:'wx',mode:0o600});
    return {state:'LOCAL_PRIVATE_SYMBOLS_NOT_UPLOADED',manifestSha256:hash(manifest),
      platform,updateId,count:maps.length,bytes:maps.reduce((n,m)=>n+m.sizeBytes,0)};
  }catch(error){
    // Only generated files under a freshly created dedicated output directory.
    fs.rmSync(outputDir,{recursive:true,force:true});throw error;
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);
    if(args.length!==9||args.some(x=>!x))throw Error('USAGE: node prepare-sdk57-private-symbols.mjs <repoRoot> <exportRoot> <outputDir> <ios|android> <preview|production> <runtime> <sourceSha> <updateId> <revision>');
    const result=buildPrivateSymbolArchive({repoRoot:args[0],exportRoot:args[1],outputDir:args[2],platform:args[3],environment:args[4],runtime:args[5],sourceSha:args[6],updateId:args[7],revision:args[8]});
    console.log(JSON.stringify(result));
  }catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
}
