// AG4-INFRA-032: executable STATIC fixtures; NO actual HTTP requests/servers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSpaConfig,modelRequest} from './infra032-spa-policy.mjs';
const file='scripts/refactor/infra032-spa-local.nginx.conf';
const source=readFileSync(file,'utf8');
function bad(modified,label){assert.throws(()=>validateSpaConfig(modified),new RegExp(label));}
function change(oldValue,newValue){
  assert.ok(source.includes(oldValue),'baseline fixture token absent: '+oldValue);
  return source.replaceAll(oldValue,newValue);
}
test('all three actual Vite output roots, distinct loopback SPA ports and local API only',()=>{
 const proof=validateSpaConfig(source);
 assert.deepEqual(proof.ports,[5180,5181,5182]);
 assert.equal(proof.roots.length,3);
 assert.ok(proof.roots[0].endsWith('/apps/web-vite/dist'));
 assert.ok(proof.roots[1].endsWith('/apps/trainer-panel/src/vite-preparation/.opt-in-dist'));
 assert.ok(proof.roots[2].endsWith('/apps/admin-panel/src/vite-preparation/.opt-in-dist'));
});
test('SPA direct navigation and refresh yield INDEX, with no-store, on all apps',()=>{
 for(const port of [5180,5181,5182]){
  for(const uri of ['/','/courses','/courses/cuid-1','/profile?username=admin',
   '/consultations/mine','/main-panel/course/new','/questions/123']){
   const r=modelRequest(uri);
   assert.equal(r.action,'SPA_INDEX',`port ${port}: ${uri}`);
   assert.equal(r.status,'INDEX_OR_404');
   assert.match(r.cache,/no-store/);
  }
 }
});
test('exact /index.html stays no-store; missing index has explicit 404',()=>{
 assert.equal(modelRequest('/index.html').action,'INDEX');
 assert.equal(modelRequest('/index.html').status,'FILE_OR_404');
 assert.ok(source.includes('try_files /index.html =404;'));
});
test('missing Vite assets and static extensions never route to SPA HTML',()=>{
 for(const path of ['/assets/missing-deadbeef.js','/assets/missing-deadbeef.css',
  '/assets/photo.jpg','/favicon.ico','/fonts/app.woff2','/unknown.js?version=1',
  '/data/export.json','/_next/static/chunks/old.js','/image.webp']){
  const r=modelRequest(path);
  assert.equal(r.action,'STATIC_FILE_OR_404',path);
  assert.equal(r.status,'FILE_OR_404',path);
  assert.match(r.cache,/no-store/);
 }
});
test('API method and path preserved for GET/POST; upstream status is not overwritten',()=>{
 for(const method of ['GET','POST','PUT','DELETE','PATCH']){
  const r=modelRequest('/api/v1/pets?cursor=123',method);
  assert.equal(r.action,'PROXY_API');
  assert.equal(r.path,'/api/v1/pets');
  assert.equal(r.status,'UPSTREAM');
  assert.equal(r.method,method);
  assert.match(r.cache,/private/);assert.match(r.cache,/no-store/);
 }
 assert.ok(source.includes('proxy_intercept_errors off;'));
 assert.ok(!source.includes('proxy_pass http://127.0.0.1:4188/;'));
});
test('unknown /api paths and exact /api/v1 yield 404, never SPA',()=>{
 for(const path of ['/api/v1','/api/other','/api/v2/data','/api/']){
  const r=modelRequest(path);assert.equal(r.action,'API_404');
  assert.equal(r.status,404);assert.match(r.cache,/private, no-store/);
 }
});
test('legacy SW, manifest, workbox URLs are explicit no-store 404',()=>{
 for(const path of ['/sw.js','/service-worker.js','/workbox-123.js',
  '/workbox-hash.mjs','/manifest.json','/manifest.webmanifest','/site.webmanifest']){
   const r=modelRequest(path);
   assert.equal(r.action,'PWA_404',path);assert.equal(r.status,404);
   assert.match(r.cache,/no-store/);
 }
});
test('failing deep-link fallback EXPECTED FAIL',()=>{
 bad(change('try_files $uri /index.html;','try_files $uri =404;'),'deep link');
});
test('failing static 404 protection EXPECTED FAIL',()=>{
 bad(change('try_files $uri =404;','try_files $uri /index.html;'),'missing Vite asset');
});
test('API proxy URI suffix would alter /api/v1 path: EXPECTED FAIL',()=>{
 bad(change('proxy_pass http://127.0.0.1:4188;',
   'proxy_pass http://127.0.0.1:4188/;'),'one allowed localhost API proxy');
});
test('API public caching: EXPECTED FAIL',()=>{
 bad(change('"private, no-store, max-age=0"','"public, max-age=300"'),
  'API must be private');
});
test('API interception converts 401/403/500: EXPECTED FAIL',()=>{
 bad(change('proxy_intercept_errors off;','proxy_intercept_errors on;'),
  'preserve API');
});
test('PWA retirement to SPA HTML: EXPECTED FAIL',()=>{
 const marker='      return 404;\n    }\n    # Existing Vite hashed assets;';
 assert.ok(source.includes(marker));
 const unsafe=source.replaceAll(marker,
  '      try_files $uri /index.html;\n    }\n    # Existing Vite hashed assets;');
 bad(unsafe,'no SW/manifest HTML fallback');
});
test('nonloopback exposure: EXPECTED FAIL',()=>{
 bad(change('listen 127.0.0.1:5180;','listen 0.0.0.0:5180;'),
  'loopback');
});
test('external include or log path: EXPECTED FAIL',()=>{
 bad(source.replace('  server_tokens off;',
  '  include /etc/nginx/conf.d/prod.conf;\n  server_tokens off;'),'uninspected includes');
 bad(source.replace('  access_log off;','  access_log /var/log/nginx/access.log;'),
  'unsafe nginx config');
});
test('SW endpoint cacheable: EXPECTED FAIL',()=>{
 bad(change('add_header Cache-Control "no-store, max-age=0" always;',
  'add_header Cache-Control "public, max-age=604800" always;'),'no SW stale cache');
});

test('proxy_pass smuggled into SPA route: EXPECTED FAIL',()=>{
 const unsafe=change('try_files $uri /index.html;',
  'proxy_pass http://127.0.0.1:4188;\n      try_files $uri /index.html;');
 bad(unsafe,'one allowed localhost API proxy');
});
