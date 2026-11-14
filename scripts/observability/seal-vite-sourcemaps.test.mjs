import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,access,lstat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sealViteMaps,findMaps} from './seal-vite-sourcemaps.mjs';

test('seal private v3 map and remove public source map only after hash check',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'gafus-map-'));
  try{
    const dist=join(dir,'dist');
    const privateDir=join(dir,'private');
    await mkdir(join(dist,'assets'),{recursive:true});
    await writeFile(join(dist,'assets','index.abc.js'),'console.log("hello")');
    await writeFile(join(dist,'assets','index.abc.js.map'),
      JSON.stringify({version:3,sources:['src/main.ts'],names:[],mappings:'AACA'}));
    const result=await sealViteMaps({dist,privateDir,service:'gafus-web',
      releaseSha:'a'.repeat(40),build:'build0001'});
    assert.equal(result.maps,1);
    assert.deepEqual(await findMaps(dist),[]);
    const store=join(privateDir,'gafus-web','a'.repeat(40),'build0001');
    const manifest=JSON.parse(await readFile(join(store,'manifest.json')));
    assert.equal(manifest.artifacts[0].asset,'assets/index.abc.js');
    assert.equal(manifest.artifacts[0].assetSha256.length,64);
    const perms=await lstat(join(store,'manifest.json'));
    assert.equal(perms.mode&0o077,0);
    await assert.rejects(sealViteMaps({dist,privateDir,service:'gafus-web',
      releaseSha:'a'.repeat(40),build:'build0001'}),/MAPS_REQUIRED/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('invalid map/header refuses publication without deleting original map',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'gafus-map-'));
  try{
    const dist=join(dir,'dist');
    await mkdir(dist);
    await writeFile(join(dist,'index.js'),'console.log(0);\n//# sourceMappingURL=index.js.map');
    const map=join(dist,'index.js.map');
    await writeFile(map,JSON.stringify({version:3,mappings:'A',sources:[]}));
    await assert.rejects(sealViteMaps({dist,privateDir:join(dir,'secure'),
      service:'gafus-web',releaseSha:'b'.repeat(40),build:'build0002'}),/PUBLIC_MAP_HEADER_FORBIDDEN/);
    await access(map);
    await assert.rejects(sealViteMaps({dist,privateDir:dist,service:'gafus-web',
      releaseSha:'b'.repeat(40),build:'build0003'}),/PRIVATE_MAP_DIR_INVALID/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
