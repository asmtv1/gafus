import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, symlinkSync, rmSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const root=new URL('../../',import.meta.url);
const src=readFileSync(new URL('ci-cd/docker/check-runtime-package-exports.mjs',root),'utf8');
const legacyPackageNames=['core-client','achievements-server','consent-server','mobile-intro-server','notifications-server','feature-flags-server','admin-rewarded-ads-server','tracking-server','admin-reengagement-server'];
const packageNames=[...legacyPackageNames,'subscription-read-server'];
const manifestFor=(pkg)=>JSON.parse(readFileSync(new URL(`packages/${pkg}/package.json`,root),'utf8'));
const actualManifestCount=packageNames.reduce((n,pkg)=>n+Object.keys(manifestFor(pkg).exports).length,0);
assert.equal(legacyPackageNames.reduce((n,pkg)=>n+Object.keys(manifestFor(pkg).exports).length,0),49,'frozen nine-package manifest sum must stay 49');
const write=(p,content)=>{mkdirSync(dirname(p),{recursive:true});writeFileSync(p,content);};
const perform=(mode,corrupt)=>{
  const dir=mkdtempSync(join(tmpdir(),'gafus-agent2-runtime-layout-'));
  try {
    write(join(dir,mode==='api'?'dist/index.js':'dist/worker/src/index.js'),'export {};');
    const physical=join(dir,'node_modules/.pnpm/@gafus+core@file+fixture/node_modules/@gafus');
    write(join(physical,'core/package.json'),JSON.stringify({name:'@gafus/core',type:'module'}));
    mkdirSync(join(dir,'node_modules/@gafus'),{recursive:true});
    symlinkSync('../.pnpm/@gafus+core@file+fixture/node_modules/@gafus/core',join(dir,'node_modules/@gafus/core'),'dir');
    for (const pkg of packageNames) {
      const manifest=manifestFor(pkg);
      const folder=join(physical,pkg);
      write(join(folder,'package.json'),JSON.stringify(manifest));
      for(const info of Object.values(manifest.exports)) {
        assert.ok(info.default && info.types);
        write(join(folder,info.default),'export {};');
        write(join(folder,info.types),'export {};');
      }
    }
    if (corrupt==='legacy-nested-dts') {
      // Preserve strict original negative: nested JS+manifest exist, DTS missing.
      unlinkSync(join(physical,'core-client/dist/utils/age/index.d.ts'));
    } else if (corrupt==='extracted-root-dts') {
      unlinkSync(join(physical,'subscription-read-server/dist/index.d.ts'));
    } else if (corrupt==='extracted-package-missing') {
      unlinkSync(join(physical,'subscription-read-server/package.json'));
    } else if (corrupt==='extracted-nested-dts') {
      // Independently prove any NEW nested export is also checked, even when
      // today's new domain only exposes its actual root manifest export.
      const folder=join(physical,'subscription-read-server');
      const manifest=manifestFor('subscription-read-server');
      const specifier='./qa-missing-nested-dts';
      assert.equal(manifest.exports[specifier],undefined);
      manifest.exports[specifier]={types:'./dist/qa-missing-nested-dts.d.ts',default:'./dist/qa-missing-nested-dts.js'};
      write(join(folder,'package.json'),JSON.stringify(manifest));
      write(join(folder,'dist/qa-missing-nested-dts.js'),'export {};');
    } else if (corrupt==='extracted-nested-js') {
      const folder=join(physical,'subscription-read-server');
      const manifest=manifestFor('subscription-read-server');
      const specifier='./qa-missing-nested-js';
      assert.equal(manifest.exports[specifier],undefined);
      manifest.exports[specifier]={types:'./dist/qa-missing-nested-js.d.ts',default:'./dist/qa-missing-nested-js.js'};
      write(join(folder,'package.json'),JSON.stringify(manifest));
      write(join(folder,'dist/qa-missing-nested-js.d.ts'),'export {};');
    } else if (corrupt==='extracted-export-extra') {
      const folder=join(physical,'subscription-read-server');
      const manifest=manifestFor('subscription-read-server');
      manifest.exports['./qa-extra']={types:'./dist/qa-extra.d.ts',default:'./dist/qa-extra.js'};
      write(join(folder,'package.json'),JSON.stringify(manifest));
      write(join(folder,'dist/qa-extra.js'),'export {};');
      write(join(folder,'dist/qa-extra.d.ts'),'export {};');
    } else if (corrupt==='legacy-export-removed') {
      // Attempted coverage reduction must fail even when remaining exports
      // all resolve, and cannot be hidden by extra new-domain exports.
      const folder=join(physical,'core-client');
      const manifest=manifestFor('core-client');
      delete manifest.exports['./utils/age/index'];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    }
    const runner=join(dir,'runtime-checker.mjs');
    write(runner,src.replaceAll('/app/',`${dir}/`));
    return spawnSync(process.execPath,[runner,mode],{encoding:'utf8',timeout:10000});
  } finally {rmSync(dir,{recursive:true,force:true});}
};
test('production guard resolves transitive exports from realpath pnpm symlink graph (api + worker)',()=>{
  for(const mode of ['api','worker']){
    const run=perform(mode,false);
    assert.equal(run.status,0,run.stderr);
    assert.match(run.stdout,new RegExp(`RUNTIME_PACKAGING_PASS target=${mode} packages=${packageNames.length} compiled_exports=${actualManifestCount}`));
  }
});
test('production guard fails closed on missing legacy NESTED declaration despite present manifest and JS',()=>{
  const run=perform('worker','legacy-nested-dts');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/core-client\/utils\/age\/index compiled declarations/);
});
test('production guard fails closed when new extracted root compiled declaration is missing',()=>{
  const run=perform('api','extracted-root-dts');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/subscription-read-server compiled declarations/);
});
test('production guard requires the extracted package manifest',()=>{
  const run=perform('worker','extracted-package-missing');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_PACKAGE_ENTRY_MISSING:@gafus\/subscription-read-server/);
});
test('production guard must resolve a newly added nested exported JS AND declaration',()=>{
  const run=perform('api','extracted-nested-dts');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/subscription-read-server\/qa-missing-nested-dts compiled declarations/);
});
test('original nine-package 49-export baseline may never be silently reduced',()=>{
  const run=perform('worker','legacy-export-removed');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_LEGACY_PACKAGE_EXPORT_COVERAGE_CHANGED:packages=9:exports=48/);
});

test('production guard fails closed when new nested exported JS is missing despite a declaration',()=>{
  const run=perform('worker','extracted-nested-js');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/subscription-read-server\/qa-missing-nested-js compiled JS/);
});

test('exact postsubscription 10/50 denies extra new export despite both compiled targets',()=>{
  const run=perform('api','extracted-export-extra');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_POSTSUBSCRIPTION_EXPORT_COVERAGE_CHANGED:packages=10:exports=51/);
});
