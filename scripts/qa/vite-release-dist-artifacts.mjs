#!/usr/bin/env node
/** Release-scoped, public-only Vite artifact transfer; no private sourcemaps. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, lstatSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const SPAS = Object.freeze({
  web: 'apps/web-vite/dist',
  'trainer-panel': 'apps/trainer-panel/src/trainer-vite/live/dist',
  'admin-panel': 'apps/admin-panel/dist',
});
const sourceSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw Error(`PUBLIC_DIST_ARTIFACT_${message}`); };
const own = Object.hasOwn;
function command(cmd,args) {
  const result=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:2_000_000,timeout:90_000});
  if(result.status!==0) fail(`COMMAND_FAILED:${cmd}:${result.status}`);
  return result.stdout.trim();
}
function safeRelative(p) {
  return typeof p==='string' && p.length<350 && !p.startsWith('/') && !p.includes('\\') &&
    p.split('/').every(x=>x!==''&&x!=='.'&&x!=='..');
}
function snapshot(root,component) {
  if(!existsSync(root)||!lstatSync(root).isDirectory())fail(`DIST_ABSENT:${component}`);
  const records=[];
  function walk(dir,prefix='') {
    for(const name of readdirSync(dir).sort()) {
      const rel=prefix?`${prefix}/${name}`:name;
      if(!safeRelative(rel))fail('PATH_UNSAFE');
      const abs=join(dir,name);const st=lstatSync(abs);
      if(st.isSymbolicLink())fail(`SYMLINK_NOT_ALLOWED:${component}`);
      if(st.isDirectory())walk(abs,rel);
      else if(st.isFile()) {
        if(rel.endsWith('.map')||rel.endsWith('.mjs.map')||rel.includes('/.private/'))
          fail(`PRIVATE_SOURCEMAP_IN_PUBLIC_DIST:${component}`);
        if(st.size>50*1024*1024)fail(`ASSET_TOO_LARGE:${component}`);
        records.push({path:rel,bytes:st.size,sha256:digest(readFileSync(abs))});
      } else fail(`NONFILE_IN_DIST:${component}`);
    }
  }
  walk(root);
  const files=new Set(records.map(r=>r.path));
  if(!files.has('index.html'))fail(`HTML_MISSING:${component}`);
  if(component==='web'&&(!files.has('.well-known/assetlinks.json') ||
    !files.has('.well-known/apple-app-site-association')))
    fail('WEB_DOMAIN_ASSOCIATION_MISSING');
  if(records.length<2)fail(`PUBLIC_DIST_TOO_SMALL:${component}`);
  return records;
}
function verifySchema(m,sha) {
  if(!m||m.schemaVersion!==1||m.sourceSha!==sha||
    !m.components||typeof m.components!=='object'||Array.isArray(m.components)||
    Object.keys(m).sort().join(',')!=='components,schemaVersion,sourceSha'||
    Object.keys(m.components).sort().join(',')!==Object.keys(SPAS).sort().join(','))
    fail('SCHEMA_OR_RELEASE_MISMATCH');
  for(const key of Object.keys(SPAS)) {
    const e=m.components[key];
    if(!e || typeof e!=='object' || !/^[0-9a-f]{64}$/.test(e.tarSha256??'') ||
      !Number.isSafeInteger(e.tarBytes)||e.tarBytes<512 || !Array.isArray(e.files)||e.files.length<2)
      fail(`INVALID_COMPONENT:${key}`);
    const seen=new Set();
    for(const row of e.files) {
      if(!safeRelative(row.path)||!Number.isSafeInteger(row.bytes)||row.bytes<0||
        !/^[a-f0-9]{64}$/.test(row.sha256??'')||seen.has(row.path)||row.path.endsWith('.map'))
        fail(`INVALID_FILE:${key}`);
      seen.add(row.path);
    }
  }
}
export function packPublicDists({workspace,artifactDir,sha}) {
  if(!sourceSha(sha))fail('SOURCE_SHA_REQUIRED');
  mkdirSync(artifactDir,{recursive:true,mode:0o700});
  const components={};
  for(const [component,rel] of Object.entries(SPAS)) {
    const root=resolve(workspace,rel);const files=snapshot(root,component);
    const archive=join(artifactDir,`${component}.tar`);
    if(existsSync(archive))fail('ARCHIVE_ALREADY_EXISTS');
    command('tar',['-C',root,'-cf',archive,'.']);
    const body=readFileSync(archive);
    components[component]={tarSha256:digest(body),tarBytes:body.length,files};
  }
  const manifest={schemaVersion:1,sourceSha:sha,components};
  const out=join(artifactDir,'public-vite-dists.json');
  if(existsSync(out))fail('MANIFEST_ALREADY_EXISTS');
  writeFileSync(out,JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
  return manifest;
}
export function restorePublicDist({workspace,artifactDir,sha,component}) {
  if(!sourceSha(sha)||!own(SPAS,component))fail('BAD_RESTORE_REQUEST');
  const m=JSON.parse(readFileSync(join(artifactDir,'public-vite-dists.json'),'utf8'));
  verifySchema(m,sha);
  const archive=join(artifactDir,`${component}.tar`);
  const body=readFileSync(archive),e=m.components[component];
  if(body.length!==e.tarBytes||digest(body)!==e.tarSha256)fail('ARCHIVE_HASH_MISMATCH');
  const names=command('tar',['-tf',archive]).split('\n').map(name=>name.replace(/^\.\//,'')).filter(name=>name&&name!=='.').map(name=>name.replace(/\/$/,''));
  if(names.some(name=>!safeRelative(name)))fail('TAR_TRAVERSAL');
  const target=resolve(workspace,SPAS[component]);
  // A clean checkout, no pre-existing dist from a different SHA.
  if(existsSync(target))fail('EXISTING_DIST_MUST_NOT_BE_OVERWRITTEN');
  mkdirSync(target,{recursive:true});
  command('tar',['-C',target,'-xf',archive]);
  const files=snapshot(target,component);
  if(JSON.stringify(files)!==JSON.stringify(e.files)) {
    rmSync(target,{recursive:true,force:true});
    fail('RESTORED_FILE_HASH_OR_SET_MISMATCH');
  }
  return {sourceSha:sha,component,files:files.length,digest:e.tarSha256};
}
function args(argv) {
  const a={};for(let i=0;i<argv.length;i+=2) {
    if(!argv[i]?.startsWith('--')||argv[i+1]===undefined)fail('BAD_CLI');
    a[argv[i].slice(2)]=argv[i+1];
  }return a;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  try {
    const [mode,...rest]=process.argv.slice(2),a=args(rest);
    if(!a.sha||!a.dir||!a.workspace)fail('CLI_ARGS_REQUIRED');
    const values={sha:a.sha,artifactDir:resolve(a.dir),workspace:resolve(a.workspace)};
    if(mode==='pack') {const out=packPublicDists(values);console.log(`PUBLIC_VITE_RELEASE_DISTS_PACKED:${out.sourceSha}`);}
    else if(mode==='restore') {const result=restorePublicDist({...values,component:a.component});console.log(`PUBLIC_VITE_DIST_VERIFIED:${result.component}:${result.files}:${result.digest}`);}
    else fail('UNKNOWN_OPERATION');
  }catch(e){console.error(e.message);process.exitCode=1;}
}
