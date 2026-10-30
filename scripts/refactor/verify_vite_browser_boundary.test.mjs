import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {audit,inspect,inspectViteConfig} from './verify_vite_browser_boundary.mjs';
const home='scripts/refactor/fixtures/vite-browser-boundary';
const target=e=>[['fixture',home+'/'+e,home+'/'+(e==='invalid.ts'?'invalid.html':'index.html'),home+'/public']];
test('valid browser module including type-only Prisma PASS',()=>{
 const r=audit({targets:target('valid.ts')});
 assert.equal(r.ok,true,JSON.stringify(r.violations));assert.equal(r.counts.fixture,2);
});
test('transitive runtime Prisma/Next/Node imports expected FAIL',()=>{
 const r=audit({targets:target('invalid.ts')});
 assert.equal(r.ok,false);assert.equal(r.counts.fixture,2);
 assert.deepEqual(r.violations.map(x=>x.code),['SERVER_IMPORT','SERVER_IMPORT','NODE_IMPORT']);
 assert.ok(r.violations.every(x=>x.file.endsWith('forbidden.ts')));
});
test('re-export, dynamic import and require cannot hide server dependencies',()=>{
 const r=inspect("export * from '@gafus/core/server';\nconst a=import('@gafus/prisma');const b=require('node:crypto');",'fixture.ts');
 assert.deepEqual(r.violations.map(x=>x.code),['SERVER_IMPORT','SERVER_IMPORT','NODE_IMPORT']);
});
test('unknown dynamic module path fails closed',()=>{
 assert.deepEqual(inspect('const x=import(moduleName);','fixture.ts').violations.map(x=>x.code),['DYNAMIC_IMPORT']);
});
test('PWA registrations fail but previous service worker retirement remains allowed',()=>{
 const bad=inspect("navigator.serviceWorker.register('/sw.js');subscription.pushManager.subscribe();",'fixture.ts');
 assert.deepEqual(bad.violations.map(x=>x.code),['PWA_REGISTER','PWA_REGISTER']);
 assert.equal(inspect('navigator.serviceWorker.getRegistrations();','fixture.ts').violations.length,0);
});
test('outside-root path denied without scanning',()=>{
 assert.throws(()=>audit({targets:[['bad','../out.ts',home+'/index.html',home+'/public']]}),/OUTSIDE_PROJECT_PATH/);
});
test('actual Vite Web/Trainer/Admin browser entrypoint graph PASS',()=>{
 const r=audit();assert.equal(r.ok,true,JSON.stringify(r.violations));
 assert.equal(Object.keys(r.counts).length,3);assert.ok(r.modules>=30);
});

test('real Web imported browser-safe package must be declared and exported',()=>{
 assert.equal(inspect("import { getConsentValue } from '@gafus/ui-components/cookie-consent';",'apps/web-vite/src/fixture.ts').violations.length,0);
 assert.deepEqual(inspect("import { PrismaClient } from '@gafus/prisma';",'apps/web-vite/src/fixture.ts').violations.map(x=>x.code),['SERVER_IMPORT']);
 assert.deepEqual(inspect("import { x } from '@gafus/ui-components/private';",'apps/web-vite/src/fixture.ts').violations.map(x=>x.code),['UNINSPECTED_WORKSPACE_RUNTIME_IMPORT']);
});
test('uninspected workspace package/alias/glob are fail-closed',()=>{
 const a=inspect("import {x} from '@gafus/consultation-shared';"+
  "import {y} from '@/shared/unresolved';"+
  "const files=import.meta.glob('./features/*.ts');",'fixture.ts');
 assert.deepEqual(a.violations.map(x=>x.code),[
  'UNINSPECTED_WORKSPACE_RUNTIME_IMPORT','UNRESOLVED_LOCAL_ALIAS','UNRESOLVED_GLOB']);
});
test('forbidden public sw.js fixture expected FAIL, without serving file',()=>{
 const a=audit({targets:[['pwa',home+'/valid.ts',home+'/index.html',home+'/public-pwa']]});
 assert.equal(a.ok,false);
 assert.deepEqual(a.violations.map(x=>x.code),['PWA_ASSET']);
 assert.match(a.violations[0].file,/public-pwa\/sw\.js$/);
});
test('HTML manifest and inline registration fail without executing scripts',()=>{
 const a=audit({targets:target('valid.ts'),read:p=>p.endsWith('/index.html')
  ? '<html><link rel="manifest" href="/manifest.json"><script type="module" src="/valid.ts"></script><script>navigator.serviceWorker.register("/sw.js")</script></html>'
  : fs.readFileSync(p,'utf8')});
 assert.deepEqual(a.violations.map(x=>x.code),['PWA_MANIFEST_HTML','PWA_INLINE_HTML']);
});
test('actual reachable graph never reads previously refused AG4 paths',()=>{
 const accessed=[];
 const a=audit({read:p=>{accessed.push(p);return fs.readFileSync(p,'utf8');}});
 assert.equal(a.ok,true);
 assert.equal(accessed.some(p=>p.includes('AG4AdminConsultationNavShell')||
  p.includes('AG4CancellationReceiptReview')),false);
});

test('PWA plugin reintroduction through Vite config expected FAIL',()=>{
 const pwa=inspectViteConfig("import {defineConfig} from 'vite';"+
  "import {VitePWA} from 'vite-plugin-pwa';"+
  "export default defineConfig({plugins:[VitePWA({})]});",'fixture/vite.config.ts');
 assert.deepEqual(pwa.map(x=>x.code),['VITE_PWA_PLUGIN','VITE_PWA_PLUGIN']);
});
test('legitimate node:url in Node-run Vite config is permitted',()=>{
 const valid=inspectViteConfig("import {fileURLToPath} from 'node:url';"+
  "import {defineConfig} from 'vite';"+
  "export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url))});",'fixture/vite.config.ts');
 assert.equal(valid.length,0);
});
test('checker traverses 3 actual config files without compiling or executing them',()=>{
 const readFiles=[];
 const a=audit({read:p=>{readFiles.push(p);return fs.readFileSync(p,'utf8');}});
 assert.equal(a.ok,true);
 assert.deepEqual(readFiles.filter(p=>p.endsWith('vite.config.ts')||p.endsWith('vite.config.mjs'))
  .map(p=>p.split('/apps/')[1]),[
   'web-vite/vite.config.mjs',
  ]);
});

test('HTML entry mismatch cannot hide another unscanned browser bootstrap',()=>{
 const a=audit({targets:target('valid.ts'),read:p=>p.endsWith('/index.html')
  ? '<html><script type="module" src="/evil.ts"></script></html>'
  : fs.readFileSync(p,'utf8')});
 assert.deepEqual(a.violations.map(x=>x.code),['ENTRY_HTML_MISMATCH']);
});
