import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {preflight, sha256} from './architecture-integration-preflight.mjs';

const desktop='/Users/asmtv1/Desktop';
const A1=path.join(desktop,'gafus-refactor');
const A2=path.join(desktop,'gafus-agent2-observability');
const policy=JSON.parse(fs.readFileSync(path.join(A2,'docs/audit/gafus-agents-integration-preflight-policy-20261112.json'),'utf8'));
const payment=JSON.parse(fs.readFileSync(policy.pinnedSourceManifests.payment.path,'utf8'));
const a3=JSON.parse(fs.readFileSync(policy.pinnedSourceManifests.agent3.path,'utf8'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-a2-preflight-fixture-'));
after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const mkFile=(root,rel,src)=>{const dest=path.join(root,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,src)};
const fromA1=rel=>fs.readFileSync(path.join(A1,rel));
const copyA1=(root,rel)=>mkFile(root,rel,fromA1(rel));
const freshFixture=()=>{
  const root=fs.mkdtempSync(path.join(tmp,'copy-'));
  for(const f of payment.files) if(f.status!=='D') copyA1(root,f.path);
  for(const f of a3.files) copyA1(root,f.path);
  for(const rel of policy.p0.requiredPaths) {
    if(rel==='packages/prisma/schema.prisma') {
      const schema=fromA1(rel).toString('utf8').replace('  previewFeatures = ["metrics"]\n','')
        .replace('  provider      = "prisma-client-js"\n',
        '  provider      = "prisma-client-js"\n  previewFeatures = ["metrics"]\n');
      mkFile(root,rel,schema);
    } else if(rel==='pnpm-lock.yaml') copyA1(root,rel);
    else mkFile(root,rel,execFileSync('git',['-C',A2,'show','HEAD:'+rel]));
  }
  for(const imp of policy.lockfile.requiredImporters){
    copyA1(root,imp==='.'?'package.json':`${imp}/package.json`);
  }
  for(const patch of Object.keys(policy.lockfile.requiredPatches)) copyA1(root,patch);
  return root;
};
const allowFinal=(copied, p=structuredClone(policy))=>{
  // SYNTHETIC TEST MARKER ONLY: never use as evidence of real A1 completion.
  const fake=JSON.stringify({kind:'gafus/a1-final-architecture/v1',status:'FINAL_VERIFIED',
    sourceFingerprintSha256:'a'.repeat(64), registry:{remaining:40,newForbidden:0},
    verification:{architecture:'PASS'}, _fixtureOnly:true});
  const final=path.join(copied,'synthetic-a1-final-FAKE.json');
  fs.writeFileSync(final,fake);
  p.finalArchitecture={required:true,manifestPath:final,approvedManifestSha256:sha256(Buffer.from(fake))};
  p.lockfile.approvedCandidateSha256=[sha256(fs.readFileSync(path.join(copied,'pnpm-lock.yaml')))];
  return p;
};
const byId=(r,id)=>r.checks.find(x=>x.id===id)?.status;

const baseline=freshFixture();
const approvedFixture=allowFinal(baseline);
const initial=preflight(approvedFixture,baseline);

test('historical snapshot fixture is accepted only if every pinned payment SHA still matches',()=>{
  // A1 actively edits payment exports after this old preflight snapshot.
  // A live copy of changed A1 bytes must NOT impersonate the payment pin.
  const mismatches=payment.files.filter(f=>f.status!=='D' &&
    sha256(fromA1(f.path))!==f.sha256_after).map(f=>f.path);
  if(mismatches.length===0){
    assert.equal(initial.verdict,'PREFLIGHT_PASS_NOT_INTEGRATION_OR_RELEASE_ACCEPTANCE',
      initial.checks.filter(x=>x.status!=='PASS').map(x=>x.id).join(','));
    assert.equal(initial.counts.FAIL,0);
  } else {
    assert.equal(initial.verdict,'FAIL');
    for(const rel of mismatches) assert.equal(byId(initial,`PAYMENT_FILE:${rel}`),'FAIL');
  }
  assert.ok(initial.counts.PASS>=100);
});

test('old policy remains unapproved, and can FAIL closed on later A1 source drift',()=>{
  const result=preflight(policy,baseline);
  assert.ok(['BLOCKED','FAIL'].includes(result.verdict));
  assert.equal(byId(result,'A1_FINAL_REGISTRY_PIN'),'BLOCKED');
  assert.equal(byId(result,'LOCKFILE_APPROVED_SHA'),'BLOCKED');
  if(result.verdict==='FAIL')assert.ok(result.checks.some(x=>x.id.startsWith('PAYMENT_FILE:')&&x.status==='FAIL'));
});

test('tampered pinned source manifest is rejected',()=>{
  const altered=structuredClone(approvedFixture);
  altered.pinnedSourceManifests.payment.sha256='0'.repeat(64);
  const result=preflight(altered,baseline);
  assert.equal(byId(result,'PAYMENT_MANIFEST_SHA'),'FAIL');
  assert.equal(result.verdict,'FAIL');
});

test('missing A2 P0 telemetry file fails',()=>{
  const copy=freshFixture();
  fs.unlinkSync(path.join(copy,'ci-cd/docker/prometheus/config.alloy'));
  const r=preflight(allowFinal(copy),copy);
  assert.equal(byId(r,'P0_EXISTS:ci-cd/docker/prometheus/config.alloy'),'FAIL');
});

test('P0 file present but stale A1 fingerprint cannot impersonate committed A2',()=>{
  const copy=freshFixture();
  fs.appendFileSync(path.join(copy,'packages/logger/src/serverTelemetry.ts'),'\n// Different telemetry source\n');
  const r=preflight(allowFinal(copy),copy);
  assert.equal(byId(r,'P0_APPROVED_SHA:packages/logger/src/serverTelemetry.ts'),'FAIL');
});

test('missing metrics preview feature fails',()=>{
  const copy=freshFixture();
  const rel='packages/prisma/schema.prisma';
  mkFile(copy,rel,fs.readFileSync(path.join(copy,rel),'utf8').replace('  previewFeatures = ["metrics"]\n',''));
  const r=preflight(allowFinal(copy),copy);
  assert.equal(byId(r,'PRISMA_METRICS_PREVIEW'),'FAIL');
});

test('metrics preserved but missing A1 Chat2 outbox column fails',()=>{
  const copy=freshFixture();const loc=path.join(copy,'packages/prisma/schema.prisma');
  const txt=fs.readFileSync(loc,'utf8').replace('  deadLetteredAt DateTime?\n','');
  assert.notEqual(txt,fs.readFileSync(loc,'utf8'));
  fs.writeFileSync(loc,txt);
  const r=preflight(allowFinal(copy),copy);
  assert.equal(byId(r,'PRISMA_CHAT2_OUTBOX_FIELD:deadLetteredAt'),'FAIL');
  assert.equal(byId(r,'PRISMA_A1_MODEL_BASELINE_SHA'),'FAIL');
});

test('committed stale A2 lockfile rejected even if someone adds its SHA to allowlist',()=>{
  const copy=freshFixture();
  mkFile(copy,'pnpm-lock.yaml',execFileSync('git',['-C',A2,'show','HEAD:pnpm-lock.yaml']));
  const r=preflight(allowFinal(copy),copy);
  assert.equal(byId(r,'LOCKFILE_REJECT_KNOWN_STALE_A2'),'FAIL');
  assert.equal(byId(r,'LOCKFILE_PAYMENT_WORKSPACE:apps/api'),'FAIL');
});

test('lockfile tamper breaks fingerprint even if YAML still parses',()=>{
  const copy=freshFixture();
  const p=path.join(copy,'pnpm-lock.yaml');fs.appendFileSync(p,'\n# changed after pinning\n');
  const r=preflight(approvedFixture,copy);
  assert.equal(byId(r,'LOCKFILE_APPROVED_SHA'),'FAIL');
  assert.equal(byId(r,'LOCKFILE_YAML_PARSE'),'PASS');
});

test('candidate package manifest drift is caught by lock importer spec comparison',()=>{
  const copy=freshFixture();const f=path.join(copy,'apps/api/package.json');
  const manifest=JSON.parse(fs.readFileSync(f,'utf8'));
  manifest.dependencies['@gafus/subscription-payment-server']='9.9.9';
  fs.writeFileSync(f,JSON.stringify(manifest));
  const r=preflight(allowFinal(copy),copy);
  assert.equal(byId(r,'LOCKFILE_SPEC:apps/api:@gafus/subscription-payment-server'),'FAIL');
});

test('A3 owned file tamper caught by final handoff SHA',()=>{
  const copy=freshFixture();const f=a3.files.find(x=>x.scope==='owned');
  fs.appendFileSync(path.join(copy,f.path),'\nTEST_TAMPER');
  const r=preflight(allowFinal(copy),copy);
  assert.equal(byId(r,`A3_FILE:${f.path}`),'FAIL');
});

test('candidate path equal to an agent worktree always rejected',()=>{
  const r=preflight(approvedFixture,A1);
  assert.equal(byId(r,'ISOLATED_CANDIDATE_COPY'),'FAIL');
});

test('candidate payment after-SHA tamper fails even when original manifest stays valid',()=>{
  const copy=freshFixture();
  const file=payment.files.find(x=>x.status==='M');
  fs.appendFileSync(path.join(copy,file.path),'\nUNAPPROVED_TEST_HUNK');
  const r=preflight(allowFinal(copy),copy);
  assert.equal(byId(r,`PAYMENT_FILE:${file.path}`),'FAIL');
});

test('removed legacy Core Apple acceptance is not silently restored',()=>{
  const copy=freshFixture();
  const deleted=payment.files.find(x=>x.status==='D');
  assert.ok(deleted);
  mkFile(copy,deleted.path,'stale old Core file');
  const r=preflight(allowFinal(copy),copy);
  assert.equal(byId(r,`PAYMENT_FILE:${deleted.path}`),'FAIL');
});

test('a forged final A1 manifest SHA is rejected',()=>{
  const copy=freshFixture();const p=allowFinal(copy);
  p.finalArchitecture.approvedManifestSha256='a'.repeat(64);
  const r=preflight(p,copy);
  assert.equal(byId(r,'A1_FINAL_REGISTRY_SHA'),'FAIL');
});

test('candidate patch file changed after capture is rejected',()=>{
  const copy=freshFixture();
  const file='patches/react-native-reanimated@4.2.1.patch';
  fs.appendFileSync(path.join(copy,file),'\n# TEST CORRUPTION\n');
  const r=preflight(allowFinal(copy),copy);
  assert.equal(byId(r,`LOCKFILE_PATCH_SHA:${file}`),'FAIL');
});

test('p0 path list cannot be swapped for six unrelated paths',()=>{
  const copy=freshFixture();const p=allowFinal(copy);
  p.p0.requiredPaths[0]='docs/audit/README.md';
  const r=preflight(p,copy);
  assert.equal(byId(r,'P0_SIX_UNIQUE_PATHS'),'FAIL');
});

// NEW A1 37-edge coverage: payment + reminder (7) + flags/access (26).
const r37policy=JSON.parse(fs.readFileSync(path.join(A2,'docs/audit/gafus-agents-integration-preflight-policy-20261112-r37.json'),'utf8'));
const r37Fixture=()=>{
  const copy=freshFixture();
  for(const [rel,entry] of Object.entries(r37policy.a1Coverage.fileDecisions)){
    if(entry.decision==='SHA_REQUIRED' && entry.latestChange!=='D')copyA1(copy,rel);
    if(entry.latestChange==='D')fs.rmSync(path.join(copy,rel),{force:true});
  }
  return copy;
};
const allowR37=(copy,p=structuredClone(r37policy))=>{
  const synthetic=allowFinal(copy,p);
  synthetic.readyForIntegration=true;
  return synthetic;
};

test('r37 source-only correctly rejects or blocks as the live A1 source evolves',()=>{
  const r=preflight(r37policy,null);
  assert.ok(['FAIL','BLOCKED'].includes(r.verdict));
  assert.equal(byId(r,'A1_R37_COMPLETE_DECISIONS'),'PASS');
  assert.equal(byId(r,'A1_BATCH_SHA:reminder'),'PASS');
  assert.equal(byId(r,'A1_BATCH_SHA:flags_access'),'PASS');
  assert.equal(byId(r,'A1_R37_INTERMEDIATE_RATCHET'),'PASS');
  assert.equal(byId(r,'A1_R37_EXPLICIT_INTEGRATION_APPROVAL'),'BLOCKED');
  assert.equal(r37policy.a1Coverage.newlyDirtyPaths.length,19);
  assert.equal(Object.keys(r37policy.a1Coverage.fileDecisions).length,49);
  if(r.verdict==='FAIL') {
    assert.ok(r.checks.some(x=>x.id.startsWith('A1_SOURCE_FINAL_SHA:') && x.status==='FAIL') ||
      byId(r,'A1_NEW_FILES_ACCOUNTED')==='FAIL' || byId(r,'A1_DIRTY_PATH_SET_SHA')==='FAIL',
      'Only actual source drift should invalidate the pinned A1 interim policy');
  } else {
    assert.equal(byId(r,'A1_NEW_FILES_ACCOUNTED'),'PASS');
    assert.equal(byId(r,'A1_DIRTY_PATH_SET_SHA'),'PASS');
  }
});

test('r37 synthetic isolated copy never bypasses a stale A1 source pin',()=>{
  const copy=r37Fixture();
  const source=preflight(r37policy,null);
  const r=preflight(allowR37(copy),copy);
  if(source.verdict==='FAIL'){
    assert.equal(r.verdict,'FAIL');
    assert.ok(r.checks.some(x=>x.status==='FAIL' && (x.id.startsWith('A1_SOURCE_FINAL_SHA:') ||
      x.id==='A1_DIRTY_PATH_SET_SHA' || x.id==='A1_NEW_FILES_ACCOUNTED')));
  } else {
    assert.equal(r.verdict,'PREFLIGHT_PASS_NOT_INTEGRATION_OR_RELEASE_ACCEPTANCE',
      r.checks.filter(x=>x.status!=='PASS').slice(0,12).map(x=>x.id).join(','));
    assert.equal(r.counts.FAIL,0);
  }
  assert.ok(r.counts.PASS>175);
});

test('r37 candidate missing new feature flags installer fails SHA',()=>{
  const copy=r37Fixture();
  const rel='apps/api/src/modules/app-feature-flags/composition/install-core-flags.ts';
  fs.unlinkSync(path.join(copy,rel));
  const r=preflight(allowR37(copy),copy);
  assert.equal(byId(r,`A1_CANDIDATE_SHA:${rel}`),'FAIL');
});

test('r37 candidate keeps A1 app.ts startup composition, not stale A2 overlay',()=>{
  const copy=r37Fixture();
  const rel='apps/api/src/app.ts';
  copyA1(copy,rel);
  let ok=preflight(allowR37(copy),copy);
  const pinned=r37policy.a1Coverage.fileDecisions[rel].sha256;
  assert.equal(byId(ok,`A1_CANDIDATE_SHA:${rel}`),sha256(fromA1(rel))===pinned?'PASS':'FAIL');
  mkFile(copy,rel,fromA1(rel).toString('utf8')+'\n// test lost installer\n');
  ok=preflight(allowR37(copy),copy);
  assert.equal(byId(ok,`A1_CANDIDATE_SHA:${rel}`),'FAIL');
});

test('r37 direct P0 lockfile only, final A3 none',()=>{
  assert.deepEqual(r37policy.a1Coverage.A2P0DirectOverlaps,['pnpm-lock.yaml']);
  assert.deepEqual(r37policy.a1Coverage.A3FinalDirectOverlaps,[]);
  assert.equal(r37policy.a1Coverage.fileDecisions['pnpm-lock.yaml'].decision,'REGENERATE_APPROVED_LOCK');
});

test('r37 policy cannot drop a new A1 path from the coverage map silently',()=>{
  const policy=structuredClone(r37policy);
  delete policy.a1Coverage.fileDecisions['packages/types/src/contracts/mobileReleaseErrors.ts'];
  const r=preflight(policy,null);
  assert.equal(byId(r,'A1_R37_COMPLETE_DECISIONS'),'FAIL');
});

test('r37 policy rejects a forged feature-flags manifest pin',()=>{
  const policy=structuredClone(r37policy);
  policy.a1AdditionalBatches.find(x=>x.name==='flags_access').sha256='f'.repeat(64);
  const r=preflight(policy,null);
  assert.equal(byId(r,'A1_BATCH_SHA:flags_access'),'FAIL');
});

test('r37 wrong new path inventory list fails rather than omitting a file',()=>{
  const policy=structuredClone(r37policy);
  policy.a1Coverage.newlyDirtyPaths.pop();
  const r=preflight(policy,null);
  assert.equal(byId(r,'A1_NEW_FILES_ACCOUNTED'),'FAIL');
});

test('r37 prior baseline fingerprint tamper fails source diff coverage',()=>{
  const policy=structuredClone(r37policy);
  policy.a1Coverage.sourceInventoryPriorSha256='a'.repeat(64);
  const r=preflight(policy,null);
  assert.equal(byId(r,'A1_PRIOR_INVENTORY_SHA'),'FAIL');
});

test('r37 correctly supersedes two older reminder audit SHA records',()=>{
  const old=r37policy.a1Coverage.fileDecisions['docs/audit/core-server-bulk-progress-20261111.md'];
  assert.equal(old.history.length,2);
  assert.equal(old.history[0].batch,'reminder');
  assert.equal(old.history[1].batch,'flags_access');
  assert.notEqual(old.history[0].sha256_after,old.history[1].sha256_after);
  assert.equal(old.decision,'EXCLUDE_AUDIT_ONLY');
  const r=preflight(r37policy,null);
  const rel='docs/audit/core-server-bulk-progress-20261111.md';
  assert.equal(byId(r,`A1_SOURCE_FINAL_SHA:${rel}`),sha256(fromA1(rel))===old.sha256?'PASS':'FAIL');
});

test('r37 manifest markdown companion is excluded with pinned SHA, not silently ignored',()=>{
  const e=r37policy.a1Coverage.excludedCompanionDocs.find(x=>x.path.endsWith('featureflags-subscription-ports-20261112.md'));
  assert.ok(e?.reason);
  assert.equal(e.decision,'EXCLUDE_AUDIT_ONLY');
  const r=preflight(r37policy,null);
  assert.equal(byId(r,`A1_EXCLUDED_COMPANION_SHA:${e.path}`),'PASS');
});

test('removed Core file may not be smuggled back as a symlink',()=>{
  const copy=r37Fixture();
  const deleted=payment.files.find(f=>f.status==='D');
  const target=path.join(copy,deleted.path);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.symlinkSync(path.join(A1,'package.json'),target);
  const r=preflight(allowR37(copy),copy);
  assert.equal(byId(r,`PAYMENT_FILE:${deleted.path}`),'FAIL');
  assert.equal(byId(r,`A1_CANDIDATE_SHA:${deleted.path}`),'FAIL');
});
