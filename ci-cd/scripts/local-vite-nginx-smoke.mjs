/** Isolated SPA container smokes: no host ports, network, data or secrets. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const root=resolve(import.meta.dirname,'../..');
const configs=[
  {name:'web',file:'nginx-vite-refactor.conf',port:3000},
  {name:'trainer',file:'nginx-trainer-panel-vite.conf',port:3001},
  {name:'admin',file:'nginx-admin-panel-vite.conf',port:3006},
];
const temp=mkdtempSync(join(tmpdir(),'gafus-refactor-nginx-'));
function docker(...args){return execFileSync('docker',args,{encoding:'utf8',timeout:15000});}
function get(container,port,path){return spawnSync('docker',['exec',container,'wget','-qO-',
  `http://127.0.0.1:${port}${path}`],{encoding:'utf8',timeout:5000});}
try {
  writeFileSync(join(temp,'index.html'), '<!doctype html><title>local-refactor-smoke</title>\n');
  for(const app of configs) {
    const name=`gafus-refactor-nginx-${app.name}-${randomUUID().slice(0,8)}`;
    try {
      // No network namespace, read-only rootfs, ephemeral writable Nginx dirs.
      // DNS, external APIs, production services and databases are unreachable.
      docker('run','--rm','-d','--network','none','--read-only',
        '--tmpfs','/var/cache/nginx','--tmpfs','/var/run',
        '--name',name,'-v',`${join(root,'ci-cd/docker',app.file)}:/etc/nginx/conf.d/default.conf:ro`,
        '-v',`${temp}:/usr/share/nginx/html:ro`,'nginx:1.27-alpine');
      let active=false;
      for(let i=0;i<15;i++){
        const result=get(name,app.port,'/healthz');
        if(result.status===0 && result.stdout==='ok'){active=true;break;}
      }
      assert(active,`NGINX_HEALTHZ_FAILED:${app.name}`);
      const spa=get(name,app.port,'/profile/something');
      assert.equal(spa.status,0,`${app.name}:${spa.stderr}`);
      assert.match(spa.stdout,/local-refactor-smoke/);
      for(const path of ['/api/unknown','/assets/missing.js']){
        const response=get(name,app.port,path);
        assert.notEqual(response.status,0,`FAIL_OPEN_AS_SPA:${app.name}:${path}`);
        assert.doesNotMatch(response.stdout,/local-refactor-smoke/);
      }
      console.log(`PASS ${app.name}: /healthz, SPA deep-link, missing API/assets fail closed`);
    } finally {
      spawnSync('docker',['rm','-f',name],{stdio:'ignore',timeout:15000});
    }
  }
} finally { rmSync(temp,{recursive:true,force:true}); }
