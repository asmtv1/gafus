import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { preflight, sha256 } from './architecture-integration-preflight.mjs';

const ROOT='/Users/asmtv1/Desktop/gafus-agent2-observability';
const P=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/audit/gafus-agents-integration-preflight-policy-20261112-r17.json'),'utf8'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-a2-r17-check-'));
const at=(r,id)=>r.checks.find(x=>x.id===id)?.status;
const clone=()=>structuredClone(P);
test('recovery source-only preserves all 183 SHA and blocks final approval; detects later A1 edits',()=>{
  const r=preflight(P);
  assert.ok(['BLOCKED','FAIL'].includes(r.verdict));
  // Compare live inputs against the frozen checkpoint even after integration.
  const expectedDrift=new Set(['A1_R17_SOURCE_DIRTY_SET_SHA','A1_R17_NEW_DIRTY_PATHS_ACCOUNTED']);
  const sourcePins=[
    ...Object.entries(P.a1Checkpoint17.fileDecisions).map(([rel,pin])=>
      ['A1_R17_SOURCE_SHA:',rel,pin.sha256,pin.latestChange==='D']),
    ...P.a1Checkpoint17.companionEvidence.map(pin=>
      ['A1_R17_COMPANION_SOURCE_SHA:',pin.path,pin.sha256,false]),
    ...Object.entries(P.lockfile.regenerationInputFilesSha256??{}).map(([rel,digest])=>
      ['LOCK_PROOF_SOURCE_SHA:',rel,digest,false]),
  ];
  for(const [prefix,rel,digest,deleted] of sourcePins) {
    const loc=path.join(P.sourceRoots.agent1,rel);
    const exists=fs.existsSync(loc);
    const matches=deleted?!exists:exists&&sha256(fs.readFileSync(loc))===digest;
    assert.equal(at(r,prefix+rel),matches?'PASS':'FAIL',rel);
    if(!matches)expectedDrift.add(prefix+rel);
  }
  const failures=r.checks.filter(x=>x.status==='FAIL');
  assert.ok(failures.every(x=>expectedDrift.has(x.id)),
    'unexpected 17-edge snapshot SHA drift: '+failures.map(x=>x.id).join(','));
  assert.equal(r.counts.BLOCKED,3);
  assert.equal(P.a1Checkpoint17.manifests.length,23);
  assert.equal(P.a1Checkpoint17.totalManifestEntries,276);
  assert.equal(Object.keys(P.a1Checkpoint17.fileDecisions).length,183);
  assert.equal(P.a1Checkpoint17.companionEvidence.length,47);
  const observed=r.checks.filter(x=>x.id.startsWith('A1_R17_SOURCE_SHA:'));
  assert.equal(observed.length,183);
  assert.ok(observed.filter(x=>x.status==='FAIL').every(x=>expectedDrift.has(x.id)));
  assert.equal(observed.filter(x=>x.status==='PASS').length+
    observed.filter(x=>x.status==='FAIL').length,183);
  if(r.verdict==='BLOCKED') {
    assert.equal(at(r,'A1_R17_NEW_DIRTY_PATHS_ACCOUNTED'),'PASS');
    assert.equal(at(r,'A1_R17_SOURCE_DIRTY_SET_SHA'),'PASS');
  } else {
    assert.ok(['A1_R17_NEW_DIRTY_PATHS_ACCOUNTED','A1_R17_SOURCE_DIRTY_SET_SHA']
      .some(id=>at(r,id)==='FAIL'));
  }
  assert.equal(at(r,'A1_R17_EXPLICIT_INTEGRATION_APPROVAL'),'BLOCKED');
});

test('all 16 recovery AG4 files have latest exact source SHA',()=>{
  const c=P.a1Checkpoint17;
  const last=c.manifests.at(-1);
  assert.equal(last.name,'gafus-agent-1-to-agent-2-reminder-ag4-recovery-port-20261112.json');
  assert.equal(last.fileCount,16);
  assert.equal(last.sha256,c.recoveryManifestSha256);
  const m=JSON.parse(fs.readFileSync(last.path,'utf8'));
  const current=preflight(P);
  const sharedDrift=new Set(['apps/api/src/app.ts','scripts/check-core-server-boundary.mjs',
    'docs/audit/core-server-bulk-progress-20261111.md',
    'docs/audit/core-server-adapter-risk-inventory-20261111.md']);
  for(const f of m.files) {
    assert.equal(c.fileDecisions[f.path].sha256,f.sha256_after_current);
    const live=sha256(fs.readFileSync(path.join(P.sourceRoots.agent1,f.path)));
    assert.equal(at(current,`A1_R17_SOURCE_SHA:${f.path}`),
      live===f.sha256_after_current?'PASS':'FAIL');
    // Later parallel edits to shared bootstrap/guard/audit are expected to
    // invalidate the old pin; brand-new AG4 port files must still match.
    if(!sharedDrift.has(f.path))assert.equal(live,f.sha256_after_current);
  }
});

test('tampered recovery manifest digest fails even with valid old batches',()=>{
  const p=clone();p.a1Checkpoint17.manifests.at(-1).sha256='f'.repeat(64);
  const r=preflight(p);
  assert.equal(r.verdict,'FAIL');
  assert.equal(at(r,'A1_R17_MANIFEST_SHA:gafus-agent-1-to-agent-2-reminder-ag4-recovery-port-20261112.json'),'FAIL');
});

test('forged recovery AST status fails even if manifest JSON SHA repinned',()=>{
  const p=clone(),b=p.a1Checkpoint17.manifests.at(-1);
  const m=JSON.parse(fs.readFileSync(b.path,'utf8'));
  m.edges_after=18;
  const file=path.join(tmp,'fake-recovery-manifest.json');
  const raw=JSON.stringify(m);
  fs.writeFileSync(file,raw);
  b.path=file;b.sha256=sha256(Buffer.from(raw));p.a1Checkpoint17.recoveryManifestSha256=b.sha256;
  const r=preflight(p);
  assert.equal(at(r,'A1_R17_AG4_RECOVERY_REGISTRY'),'FAIL');
});

test('missing a classified A1 source path is rejected',()=>{
  const p=clone();delete p.a1Checkpoint17.fileDecisions['packages/core/src/services/reminders/reminderAG4ReviewPort.ts'];
  const r=preflight(p);
  assert.equal(at(r,'A1_R17_ALL_183_PATHS_CLASSIFIED'),'FAIL');
});

test('latest A1 SHA cannot be silently changed or skipped',()=>{
  const p=clone(),rel='packages/core/src/services/reminders/g1ReminderMutationReceiptAG4.review.ts';
  p.a1Checkpoint17.fileDecisions[rel].sha256='a'.repeat(64);
  const r=preflight(p);
  assert.equal(at(r,`A1_R17_DECISION:${rel}`),'FAIL');
  assert.equal(at(r,`A1_R17_SOURCE_SHA:${rel}`),'PASS');
});

test('forged direct A2 overlap list fails, recovery has no A3 final overlap',()=>{
  assert.deepEqual(P.a1Checkpoint17.a2CommitIntersections,['pnpm-lock.yaml']);
  assert.deepEqual(P.a1Checkpoint17.a3FinalIntersections,[]);
  const p=clone();p.a1Checkpoint17.a2CommitIntersections=[];
  assert.equal(at(preflight(p),'A1_R17_A2_4_COMMITTED_OVERLAP'),'FAIL');
});

test('unaccounted A1 dirty files must invalidate snapshot',()=>{
  const p=clone();p.a1Checkpoint17.newDirtyPathsSinceBaseline=[];
  assert.equal(at(preflight(p),'A1_R17_NEW_DIRTY_PATHS_ACCOUNTED'),'FAIL');
});

test('forged companion SHA fails; audit-only exclusion is not silent',()=>{
  const p=clone();const e=p.a1Checkpoint17.companionEvidence.find(x=>x.path.endsWith('gafus-agent-1-recovery-verified-checkpoint-20261112.md'));
  e.sha256='c'.repeat(64);
  assert.equal(at(preflight(p),`A1_R17_COMPANION_SOURCE_SHA:${e.path}`),'FAIL');
});

test('candidate missing AG4 port fails SHA while A1 is source-correct',()=>{
  const candidate=fs.mkdtempSync(path.join(tmp,'candidate-'));
  const rel='packages/core/src/services/reminders/reminderAG4ReviewPort.ts';
  const r=preflight(P,candidate);
  assert.equal(at(r,`A1_R17_CANDIDATE_SHA:${rel}`),'FAIL');
  assert.equal(at(r,`A1_R17_SOURCE_SHA:${rel}`),'PASS');
});

test('no final A1 registry or approved lock SHA; integration blocked',()=>{
  assert.equal(P.readyForIntegration,false);
  assert.equal(P.finalArchitecture.manifestPath,null);
  assert.deepEqual(P.lockfile.approvedCandidateSha256,[]);
});

test('A1 r17 23 groups follow 41-to-17 ratchet including recovery',()=>{
  const x=P.a1Checkpoint17;
  assert.equal(x.registry.remaining,17);assert.equal(x.registry.newForbidden,0);
  assert.equal(x.registry.resolved,24);
  assert.equal(x.statusCounts.SHA_REQUIRED,180);
  assert.equal(x.statusCounts.EXCLUDE_AUDIT_ONLY,2);
  assert.equal(x.statusCounts.REGENERATE_APPROVED_LOCK,1);
});

test('four A2 commits and 39-path real Git diff are pinned, not arbitrary overlap claims',()=>{
  const r=preflight(P);
  assert.equal(at(r,'A1_R17_A2_COMMITTED_39_GIT_GRAPH'),'PASS');
  const p=clone();p.a1Checkpoint17.a2CommittedPaths.push('packages/core/src/services/reminders/reminderAG4ReviewPort.ts');
  assert.equal(at(preflight(p),'A1_R17_A2_COMMITTED_39_GIT_GRAPH'),'FAIL');
});

test('A3 final path set cannot be tampered while retaining zero overlap assertion',()=>{
  const r=preflight(P);assert.equal(at(r,'A1_R17_A3_FINAL39_PINNED_PATH_SET'),'PASS');
  const p=clone();p.a1Checkpoint17.a3FinalPaths.pop();
  assert.equal(at(preflight(p),'A1_R17_A3_FINAL39_PINNED_PATH_SET'),'FAIL');
});
