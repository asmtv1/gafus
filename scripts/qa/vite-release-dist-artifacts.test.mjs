import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SPAS,packPublicDists,restorePublicDist} from './vite-release-dist-artifacts.mjs';
const sha='a'.repeat(40);
const setup=()=>{
 const root=mkdtempSync(join(tmpdir(),'gafus-rc-vite-'));
 const workspace=join(root,'source'),artifactDir=join(root,'artifact'),dest=join(root,'dest');
 for(const [c,p] of Object.entries(SPAS)){
  const dir=join(workspace,p);mkdirSync(join(dir,'assets'),{recursive:true});
  writeFileSync(join(dir,'index.html'),`<html>${c}</html>`);
  writeFileSync(join(dir,'assets','app-a.js'),`console.log('${c}')`);
  if(c==='web') {
   mkdirSync(join(dir,'.well-known'));
   writeFileSync(join(dir,'.well-known','assetlinks.json'),'[]');
   writeFileSync(join(dir,'.well-known','apple-app-site-association'),'{}');
  }
 }
 return {root,workspace,artifactDir,dest};
};
test('pack exact 3 public dists and restore dot-directories with SHA256 equality',t=>{
 const v=setup();t.after(()=>rmSync(v.root,{recursive:true,force:true}));
 const m=packPublicDists({...v,sha});assert.equal(Object.keys(m.components).length,3);
 for(const component of Object.keys(SPAS)){
  const r=restorePublicDist({workspace:v.dest,artifactDir:v.artifactDir,sha,component});
  assert.equal(r.sourceSha,sha);
 }
 assert.deepEqual(readFileSync(join(v.dest,SPAS.web,'.well-known','assetlinks.json'),'utf8'),'[]');
 assert.throws(()=>restorePublicDist({workspace:v.dest,artifactDir:v.artifactDir,sha,component:'web'}),/EXISTING_DIST/);
});
test('wrong SHA, changed archive bytes and extra public map are denied',t=>{
 const v=setup();t.after(()=>rmSync(v.root,{recursive:true,force:true}));
 packPublicDists({...v,sha});
 assert.throws(()=>restorePublicDist({workspace:v.dest,artifactDir:v.artifactDir,sha:'b'.repeat(40),component:'web'}),/SCHEMA_OR_RELEASE_MISMATCH/);
 const archive=join(v.artifactDir,'web.tar');writeFileSync(archive,'corrupted');
 assert.throws(()=>restorePublicDist({workspace:v.dest,artifactDir:v.artifactDir,sha,component:'web'}),/ARCHIVE_HASH_MISMATCH/);
});
test('fail closed for missing domain files or public sourcemaps/symlinks',t=>{
 const v=setup();t.after(()=>rmSync(v.root,{recursive:true,force:true}));
 const dist=join(v.workspace,SPAS.web);
 rmSync(join(dist,'.well-known','assetlinks.json'));
 assert.throws(()=>packPublicDists({...v,sha}),/WEB_DOMAIN_ASSOCIATION_MISSING/);
});
test('reject private map and malicious symlink in release dist before packaging',t=>{
 const v=setup();t.after(()=>rmSync(v.root,{recursive:true,force:true}));
 const dir=join(v.workspace,SPAS.web,'assets');writeFileSync(join(dir,'app-a.js.map'),'{}');
 assert.throws(()=>packPublicDists({...v,sha}),/PRIVATE_SOURCEMAP/);
 rmSync(join(dir,'app-a.js.map'));
 symlinkSync('/etc/passwd',join(dir,'unexpected.txt'));
 assert.throws(()=>packPublicDists({...v,sha}),/SYMLINK_NOT_ALLOWED/);
});
