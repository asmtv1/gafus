// @AG4 source-only negative fixtures: no browser, imports of bundles or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyBuiltAcceptance,inspectBuiltHtmlAndJs} from './infra032-vite-build-acceptance.mjs';
const validHtml='<!doctype html><html><script type="module" src="/assets/index-AbC123.js"></script></html>';
const validJs='const app=1;console.log(app);';
const check=(html=validHtml,js=validJs,asset='index-AbC123.js')=>inspectBuiltHtmlAndJs(html,js,asset);
test('real Trainer/Admin emitted artifacts accepted with unserved INFRA032 mapping explicit',()=>{
 const results=verifyBuiltAcceptance();
 assert.deepEqual(results.map(r=>r.app),['Trainer','Admin']);
 for(const r of results){
  assert.equal(r.oneReferencedLocalChunk,true);
  assert.equal(r.serverSecretPatternsAbsent,true);
  assert.equal(r.serverRuntimeImportsAbsent,true);
  assert.equal(r.pwaRegistrationAbsent,true);
  assert.equal(r.bundleIsSelfContained,true);
  assert.equal(r.currentNginxPointsAtAcceptance,false);
  assert.equal(r.realHttpFileServingVerified,false);
  assert.match(r.jsSha256,/^[0-9a-f]{64}$/);
 }
});
test('valid synthetic browser chunk accepted',()=>{
 assert.equal(check().bundleIsSelfContained,true);
});
test('HTML refers to unexpected/remote/changeless JS: expected FAIL',()=>{
 assert.throws(()=>check(validHtml,validJs,'index-Other.js'),/HTML must reference/);
 assert.throws(()=>check('<script type="module" src="https://example.invalid/index-AbC123.js"></script>'),/HTML must reference/);
 assert.throws(()=>check('<script type="module" src="/assets/index-AbC123.js"></script><script src="/extra.js"></script>'),/exactly one script tag/);
});
test('bundle emits forbidden Prisma/Next/Node imports: expected FAIL',()=>{
 for(const src of ['import {prisma} from "@gafus/prisma";',
  'import {headers} from "next/headers";',
  'const fs=require("node:fs");']){
   assert.throws(()=>check(validHtml,src),/runtime|imports/);
  }
});
test('bundle includes private/server environment tokens: expected FAIL',()=>{
 for(const src of ['const db=process.env.DATABASE_URL;',
  'const secret="RUSTORE_PUSH_SERVICE_TOKEN";',
  'const x=import.meta.env.JWT_SECRET;']){
   assert.throws(()=>check(validHtml,src),/server secrets/);
  }
});
test('SW registration, Workbox, source map reference forbidden: expected FAIL',()=>{
 assert.throws(()=>check(validHtml,'navigator.serviceWorker.register("/sw.js")'),/PWA/);
 assert.throws(()=>check(validHtml,'const x="workbox-deadbeef.js"'),/PWA/);
 assert.throws(()=>check(validHtml,'const x=1; //# sourceMappingURL=index.js.map'),/source map/);
});
