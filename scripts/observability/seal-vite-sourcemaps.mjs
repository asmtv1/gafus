#!/usr/bin/env node
/** Seals Vite hidden sourcemaps into a private per-build manifest.
 * Run between Vite build and docker publish; never store .map in public dist.
 * No network, IAM, secret, source content or user IDs in output to stdout.
 */
import { createHash } from 'node:crypto';
import {readdir,stat,readFile,mkdir,writeFile,rename,unlink,realpath,lstat} from 'node:fs/promises';
import {resolve,relative,join,dirname,basename,sep,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';

const MAX_MAPS=500,MAX_MAP_BYTES=64*1024*1024,MAX_BUNDLE_BYTES=16*1024*1024;
const safeLabel=/^[a-z0-9][a-z0-9-]{2,60}$/;
const safeSha=/^[a-f0-9]{40}$/;
const buildId=/^[a-zA-Z0-9_.-]{8,40}$/;
const sha256=b=>createHash('sha256').update(b).digest('hex');
export async function findMaps(directory) {
  const files=[];
  async function visit(path,depth) {
    if(depth>8)throw Error('MAP_DEPTH_LIMIT');
    for(const item of await readdir(path,{withFileTypes:true})) {
      if(item.isSymbolicLink())throw Error('MAP_SYMLINK_FORBIDDEN');
      const full=join(path,item.name);
      if(item.isDirectory())await visit(full,depth+1);
      else if(item.isFile()&&item.name.endsWith('.map')) {
        files.push(full);
        if(files.length>MAX_MAPS)throw Error('MAP_COUNT_LIMIT');
      }
    }
  }
  await visit(directory,0);
  return files.sort();
}
function under(root,path) {
  const rel=relative(root,path);
  return rel!==''&&!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel);
}
export async function sealViteMaps({dist,privateDir,service,releaseSha,build}) {
  if(!safeLabel.test(service)||!safeSha.test(releaseSha)||!buildId.test(build))
    throw Error('RELEASE_MANIFEST_ID_INVALID');
  const publicRoot=await realpath(resolve(dist));
  if(!isAbsolute(privateDir))throw Error('PRIVATE_MAP_DIR_INVALID');
  // Canonicalize /var → /private/var on macOS before comparing directory trees.
  // Private parent must already exist; never create an unverified ancestor.
  const privateRoot=await realpath(resolve(privateDir))
    .catch(async()=>join(await realpath(dirname(resolve(privateDir))),basename(privateDir)));
  if(privateRoot===publicRoot||
     under(publicRoot,privateRoot)||under(privateRoot,publicRoot))
    throw Error('PRIVATE_MAP_DIR_INVALID');
  if((await lstat(publicRoot)).isSymbolicLink())throw Error('PUBLIC_DIR_SYMLINK');
  await mkdir(privateRoot,{recursive:true,mode:0o700});
  const privateStat=await lstat(privateRoot);
  if(!privateStat.isDirectory()||(privateStat.mode&0o077)!==0)
    throw Error('PRIVATE_MAP_PERMISSIONS_INVALID');
  const maps=await findMaps(publicRoot);
  if(!maps.length)throw Error('MAPS_REQUIRED_FOR_RELEASE');
  const destination=join(privateRoot,service,releaseSha,build);
  if((await stat(destination).catch(()=>null)))throw Error('RELEASE_MAPS_IMMUTABLE');
  await mkdir(destination,{recursive:true,mode:0o700});
  const manifest={schemaVersion:1,service,releaseSha,build,artifacts:[]};
  // Stage ALL private copies first. Delete from public root only after hash
  // verification; any partial interruption fails the release security scan.
  for(const file of maps) {
    const rel=relative(publicRoot,file);
    if(!under(publicRoot,file)||!rel.endsWith('.js.map'))
      throw Error('MAP_FILENAME_INVALID');
    const buffer=await readFile(file);
    if(buffer.length<2||buffer.length>MAX_MAP_BYTES)
      throw Error('MAP_SIZE_LIMIT');
    let parsed;
    try{parsed=JSON.parse(buffer.toString());}
    catch{throw Error('MAP_JSON_INVALID');}
    if(parsed?.version!==3||typeof parsed.mappings!=='string')
      throw Error('MAP_V3_REQUIRED');
    const asset=join(publicRoot,rel.slice(0,-4));
    const assetStats=await lstat(asset).catch(()=>null);
    if(!assetStats||!assetStats.isFile()||assetStats.size>MAX_BUNDLE_BYTES)
      throw Error('MAP_ASSET_MISMATCH');
    const bytes=await readFile(asset);
    if(/sourceMappingURL\s*=/.test(bytes.toString()))
      throw Error('PUBLIC_MAP_HEADER_FORBIDDEN');
    const saved=join(destination,rel);
    await mkdir(dirname(saved),{recursive:true,mode:0o700});
    await writeFile(saved,buffer,{flag:'wx',mode:0o600});
    const verified=await readFile(saved);
    if(sha256(verified)!==sha256(buffer))throw Error('MAP_PRIVATE_COPY_MISMATCH');
    manifest.artifacts.push({asset:rel.slice(0,-4),assetSha256:sha256(bytes),
      privateMap:rel,mapSha256:sha256(buffer),mapBytes:buffer.length});
  }
  // Manifest stays private; include no source content in its records.
  const path=join(destination,'manifest.json');
  await writeFile(path,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  for(const file of maps)await unlink(file);
  if((await findMaps(publicRoot)).length)throw Error('PUBLIC_MAP_SCAN_FAILED');
  return {service,build,releaseSha,maps:manifest.artifacts.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [dist,privateDir,service,releaseSha,build]=process.argv.slice(2);
  sealViteMaps({dist,privateDir,service,releaseSha,build}).then(result=>{
    console.log(JSON.stringify(result));
  }).catch(()=>{console.error('PRIVATE_MAP_SEAL_FAILED');process.exitCode=4;});
}
