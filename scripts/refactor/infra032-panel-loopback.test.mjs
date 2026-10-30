// AG4-INFRA032 LOCALNONPROD. ACTUAL loopback HTTP only; never binds/listens.
// Launch the separately configured Nginx before invoking this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../..',import.meta.url)));
const base='http://127.0.0.1:5188';
const mounts={
 trainer:{dir:'infra032-vite-acceptance-trainer-20261022',index:'218a3e4c0c191c0bba15b3ddb9bd5d49946c23d2676f9961b980cb8c0f049dc8',asset:'index-Cs6AsiU8.js',js:'040bafc562f9ff679e444d0e2411a3099d805907421350141bdbb4ba437f87f8'},
 admin:{dir:'infra032-vite-acceptance-admin-20261022',index:'090ae921abea15409f97a3b1714cbd8de10a1a2ccec80efb4fe6631a038f8b6c',asset:'index-C5VI_C_m.js',js:'3406863af3128ef808227a2c4e5cc952367d857ddd5e1dbcdb5b233e24cb9a9a'},
};
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function pinnedOriginal(part,kind){
 const p=path.join(root,'scripts/refactor',part.dir,kind==='html'?'index.html':`assets/${part.asset}`);
 assert.ok(p.startsWith(root+path.sep));
 assert.equal(fs.lstatSync(p).isSymbolicLink(),false);
 const bytes=fs.readFileSync(p);
 assert.equal(digest(bytes),kind==='html'?part.index:part.js);
 return bytes;
}
async function request(url,init){
 // Explicit literal loopback origin, never follow redirect to external address.
 assert.ok(url.startsWith('/'));
 const res=await fetch(base+url,{redirect:'manual',...init});
 assert.equal(res.headers.get('access-control-allow-origin'),null);
 assert.equal(res.headers.get('set-cookie'),null);
 assert.match(res.headers.get('cache-control')??'',/private, no-store/);
 assert.equal(res.headers.get('x-content-type-options'),'nosniff');
 assert.equal(res.headers.get('referrer-policy'),'no-referrer');
 return res;
}
for(const [name,part] of Object.entries(mounts)){
 test(`${name} direct SPA URLs and refresh return OWN original HTML 200`,async()=>{
  const index=pinnedOriginal(part,'html');
  for(const route of [`/${name}`,`/${name}/`,`/${name}/courses/cuid_123`,
   `/${name}/main-panel/course/example?tab=overview`,`/${name}/profile?username=admin`]){
   const res=await request(route);
   assert.equal(res.status,200,route);
   assert.match(res.headers.get('content-type')??'',/^text\/html(?:;|$)/i);
   const body=Buffer.from(await res.arrayBuffer());
   assert.equal(digest(body),part.index,route+' HTML differs from exact built artifact');
   assert.deepEqual(body,index);
   assert.match(body.toString(),new RegExp(`src="/assets/${part.asset.replaceAll('.','\\.')}"`));
  }
 });
 test(`${name} actual hashed JavaScript 200, JS MIME and exact bytes`,async()=>{
  const expected=pinnedOriginal(part,'js');
  const res=await request(`/assets/${part.asset}`);
  assert.equal(res.status,200);
  assert.match(res.headers.get('content-type')??'',/javascript/i);
  const bytes=Buffer.from(await res.arrayBuffer());
  assert.equal(digest(bytes),part.js);
  assert.deepEqual(bytes,expected);
  assert.notEqual(digest(bytes),part.index);
 });
 test(`${name} HEAD SPA/JS has status and content type without body`,async()=>{
  for(const route of [`/${name}/history`,`/assets/${part.asset}`]){
   const res=await request(route,{method:'HEAD'});
   assert.equal(res.status,200);
   assert.equal((await res.arrayBuffer()).byteLength,0);
  }
 });
}
test('missing hashed assets, CSS, fonts and images are 404 not SPA index',async()=>{
 const missing=['/assets/index-NOT-EXIST.js','/assets/index-NOT-EXIST.css',
  '/trainer/assets/index-C5VI_C_m.js','/admin/assets/index-Cs6AsiU8.js',
  '/trainer/missing.css','/admin/missing.js','/admin/avatars/unknown.webp',
  '/trainer/logo.svg','/favicon.ico','/manifest-not-present.webmanifest'];
 for(const url of missing){
  const res=await request(url);
  assert.equal(res.status,404,url);
  const body=Buffer.from(await res.arrayBuffer());
  assert.notEqual(digest(body),mounts.trainer.index);
  assert.notEqual(digest(body),mounts.admin.index);
  assert.doesNotMatch(body.toString(),/index-Cs6AsiU8|index-C5VI_C_m/);
 }
});
test('all /api/v1 and /api/ routes safe 404; no upstream/API auth or SPA',async()=>{
 const routes=['/api','/api/','/api/v1','/api/v1/',
  '/api/v1/pets','/api/v1/trainer/courses/c1/draft',
  '/trainer/api/v1/pets','/admin/api/v1/private','/api/v2/health'];
 for(const url of routes){
  const res=await request(url);
  assert.equal(res.status,404,url);
  const body=Buffer.from(await res.arrayBuffer());
  assert.notEqual(digest(body),mounts.trainer.index);
  assert.notEqual(digest(body),mounts.admin.index);
 }
});
test('unsafe mutation methods never reach an API or SPA write action',async()=>{
 for(const [url,method] of [['/api/v1/bookings','POST'],['/trainer/courses','POST'],
  ['/admin/private','PUT'],['/api/v1/pets','DELETE']]){
  const res=await request(url,{method});
  assert.ok([404,405].includes(res.status),`${method} ${url} unexpected ${res.status}`);
  const body=Buffer.from(await res.arrayBuffer());
  assert.notEqual(digest(body),mounts.trainer.index);
  assert.notEqual(digest(body),mounts.admin.index);
 }
});
test('retired SW / manifest / Workbox 404 on root, trainer and admin',async()=>{
 for(const prefix of ['', '/trainer', '/admin']){
  for(const file of ['sw.js','service-worker.js','workbox-test.js',
   'manifest.json','manifest.webmanifest','site.webmanifest']){
   const res=await request(`${prefix}/${file}`);
   assert.equal(res.status,404,`${prefix}/${file}`);
   const text=await res.text();
   assert.doesNotMatch(text,/index-Cs6AsiU8|index-C5VI_C_m/);
  }
 }
});
test('root/unknown application namespaces are 404, no implicit default SPA',async()=>{
 for(const path of ['/','/web','/not-an-app','/assets/','/.env','/.git/config']){
  const res=await request(path);
  assert.equal(res.status,404,path);
 }
});
