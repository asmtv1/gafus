import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),yaml=require('yaml');
const HERE=path.dirname(new URL(import.meta.url).pathname);
const FILE=path.join(HERE,'architecture-integration-lockfile-validate.mjs');
const SOURCE=path.join(os.homedir(),'Library/Logs/gafus-refactor-regression/a2-lockfile-proof-r37-final-0600/candidate');
const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-lockfile-validate-test-'));
after(()=>fs.rmSync(ROOT,{recursive:true,force:true}));
const fresh=()=>{
 const loc=fs.mkdtempSync(path.join(ROOT,'fixture-'));
 for(const entry of fs.readdirSync(SOURCE))fs.cpSync(path.join(SOURCE,entry),path.join(loc,entry),{recursive:true});
 return loc;
};
const run=candidate=>{
 const p=spawnSync(process.execPath,[FILE,'--candidate',candidate],{encoding:'utf8',timeout:15000,maxBuffer:2e6});
 if(!p.stdout){throw Error(`Missing validator output: ${p.stderr} (${p.status})`)}
 return {code:p.status,data:JSON.parse(p.stdout)};
};
const find=(r,code)=>r.data.failed.some(x=>x.id===code);

test('isolated regenerated lock + telemetry + patches + Prisma validated',()=>{
 const r=run(SOURCE);assert.equal(r.code,0);assert.equal(r.data.verdict,'PASS_LOCKFILE_ONLY_NOT_INTEGRATION_ACCEPTANCE');
 assert.equal(r.data.passed,1292);assert.equal(r.data.checksTotal,1292);
 assert.equal(r.data.lockSha256,'f131a5960bfffbb2dd894d23ee1e0820884fce6188798ba989eab7743e48524e');
});

test('old A2 committed lock fails, including A1 patch checks',()=>{
 const loc=fresh();
 fs.copyFileSync('/Users/asmtv1/Desktop/gafus-agent2-observability/pnpm-lock.yaml',path.join(loc,'pnpm-lock.yaml'));
 const r=run(loc);
 assert.equal(r.code,1);assert.ok(find(r,'LOCK_NOT_STALE_A2'));assert.ok(find(r,'LOCK_REGEN_EQUALS_A1_SNAPSHOT'));
 assert.ok(find(r,'PATCH_HASH:expo-modules-core@55.0.27'));
});

test('OTel dependency omitted from candidate lock fails',()=>{
 const loc=fresh();const file=path.join(loc,'pnpm-lock.yaml');
 const lock=yaml.parse(fs.readFileSync(file,'utf8'));
 delete lock.importers['packages/logger'].dependencies['@opentelemetry/api'];
 fs.writeFileSync(file,yaml.stringify(lock));
 const r=run(loc);assert.equal(r.code,1);assert.ok(find(r,'OTEL_LOCK:@opentelemetry/api'));
});

test('altered Expo patch bytes fail even with untouched lockfile',()=>{
 const loc=fresh();fs.appendFileSync(path.join(loc,'patches/expo-modules-core@55.0.27.patch'),'\n# corrupted test\n');
 const r=run(loc);assert.equal(r.code,1);assert.ok(find(r,'PATCH_HASH:expo-modules-core@55.0.27'));
});

test('missing A1 payment dependency in API package manifest fails',()=>{
 const loc=fresh();const file=path.join(loc,'apps/api/package.json');
 const pkg=JSON.parse(fs.readFileSync(file,'utf8'));
 delete pkg.dependencies['@gafus/subscription-payment-server'];
 fs.writeFileSync(file,JSON.stringify(pkg));
 const r=run(loc);assert.equal(r.code,1);
 assert.ok(find(r,'A1_PAYMENT_PACKAGE_MANIFEST:apps/api'));
 assert.ok(find(r,'IMPORTER_EXACT_NAMES:apps/api'));
});

test('missing Prisma metrics in candidate schema fails',()=>{
 const loc=fresh();const file=path.join(loc,'packages/prisma/schema.prisma');
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('  previewFeatures = ["metrics"]\n',''));
 const r=run(loc);assert.equal(r.code,1);assert.ok(find(r,'PRISMA_METRICS_GENERATOR'));
});

test('wrong workspace resolver target fails even with existing packages',()=>{
 const loc=fresh();const file=path.join(loc,'pnpm-lock.yaml');
 const lock=yaml.parse(fs.readFileSync(file,'utf8'));
 lock.importers['packages/worker'].dependencies['@gafus/subscription-payment-server'].version='link:../wrong-server';
 fs.writeFileSync(file,yaml.stringify(lock));
 const r=run(loc);assert.equal(r.code,1);assert.ok(find(r,'A1_PAYMENT_WORKSPACE:packages/worker'));
});
