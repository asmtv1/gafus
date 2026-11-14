#!/usr/bin/env node
/**
 * Read-only mechanical admission gate for a future frozen integration copy.
 * Does not add/commit/merge/cherry-pick/push/check out or mutate files.
 * Strict: payment/A3 manifest fingerprints, A1-final architecture evidence,
 * 6 A2 P0 paths, preserved Prisma metrics + A1 schema, current lockfile.
 * A positive result is PREFLIGHT_ONLY, not release or staging acceptance.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const YAML = require('yaml');

export const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const isSha = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const EXPECTED_P0 = [
  'apps/api/src/lib/operation-observability.ts',
  'packages/logger/src/serverTelemetry.ts',
  'ci-cd/docker/prometheus/config.alloy',
  'ci-cd/docker/prometheus/gafus-alerts.yml',
  'packages/prisma/schema.prisma',
  'pnpm-lock.yaml',
];

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!['--policy', '--candidate'].includes(key) || flags[key] !== undefined || !argv[i + 1]) {
      throw new Error(`USAGE: unexpected/missing argument ${key}`);
    }
    flags[key] = argv[++i];
  }
  return {
    policy: path.resolve(flags['--policy'] ?? path.join(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), '../../docs/audit/gafus-agents-integration-preflight-policy-20261112.json')),
    candidate: flags['--candidate'] ? path.resolve(flags['--candidate']) : null,
  };
}

function fileWithin(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(x => !x || x === '..' || x === '.')) {
    throw new Error(`UNSAFE_PATH:${String(relative)}`);
  }
  const base = path.resolve(root);
  const file = path.resolve(base, relative);
  if (!file.startsWith(base + path.sep)) throw new Error(`PATH_ESCAPE:${relative}`);
  let cur = base;
  for (const p of relative.split('/')) {
    cur = path.join(cur, p);
    if (fs.existsSync(cur) && fs.lstatSync(cur).isSymbolicLink()) throw new Error(`SYMLINK_NOT_ALLOWED:${relative}`);
  }
  return file;
}

const readOptional = p => fs.existsSync(p) && fs.statSync(p).isFile() ? fs.readFileSync(p) : null;
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const hashFile = p => { const b = readOptional(p); return b ? sha256(b) : null; };
const parseSchemaModel = (source, name) => {
  const m = source.match(new RegExp(`(?:^|\\n)model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  return m?.[1] ?? null;
};

export function preflight(policy, candidate = null) {
  const checks = [];
  const add = (id, ok, detail = '') => checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail });
  const pending = (id, detail = '') => checks.push({ id, status: 'BLOCKED', detail });

  add('POLICY_SCHEMA', policy?.kind === 'gafus/integration-preflight-policy/v1');
  const sources = policy?.pinnedSourceManifests ?? {};
  const manifests = {};
  for (const [name, spec] of Object.entries({ payment: sources.payment, agent3: sources.agent3 })) {
    if (!spec?.path || !isSha(spec?.sha256)) { add(`${name.toUpperCase()}_MANIFEST_PIN`, false, 'missing pinned source'); continue; }
    const buf = readOptional(spec.path);
    const matches = buf && sha256(buf) === spec.sha256;
    add(`${name.toUpperCase()}_MANIFEST_SHA`, !!matches, matches ? spec.sha256 : 'SHA mismatch / unavailable');
    if (matches) {
      try { manifests[name] = JSON.parse(buf.toString('utf8')); }
      catch { add(`${name.toUpperCase()}_MANIFEST_JSON`, false); }
    }
  }
  const pay = manifests.payment;
  add('PAYMENT_MANIFEST_CONTENT', !!(pay && pay.kind === sources.payment?.expectedKind && Array.isArray(pay.files) && pay.files.length === 18 && new Set(pay.files.map(x => x.path)).size === 18));
  const a3 = manifests.agent3;
  add('A3_MANIFEST_CONTENT', !!(a3 && a3.schema === sources.agent3?.expectedSchema && Array.isArray(a3.files) && a3.files.length === 39 && new Set(a3.files.map(x => x.path)).size === 39));

  // Optional A1 r37 overlay. Source manifest SHA and path coverage are checked
  // even with --candidate omitted, without modifying source trees.
  if (policy.a1Coverage) {
    const coverage = policy.a1Coverage;
    const batches = [
      {name:'payment', path:sources.payment?.path, sha256:sources.payment?.sha256, expectedCount:18},
      ...(policy.a1AdditionalBatches ?? []),
    ];
    add('A1_R37_THREE_BATCHES', batches.length === 3 &&
      batches.map(x=>x.name).join(',') === 'payment,reminder,flags_access' &&
      batches.reduce((n,x)=>n+x.expectedCount,0) === 51);
    const history = new Map();
    for (const batch of batches) {
      const b = batch.path ? readOptional(batch.path) : null;
      const hashOk = !!(b && isSha(batch.sha256) && sha256(b) === batch.sha256);
      add(`A1_BATCH_SHA:${batch.name}`, hashOk, hashOk ? batch.sha256 : 'absent or changed batch source');
      if (!hashOk) continue;
      let doc;
      try { doc = JSON.parse(b.toString('utf8')); } catch { doc = null; }
      const entries = doc?.files;
      const ok = !!(Array.isArray(entries) && entries.length === batch.expectedCount &&
        new Set(entries.map(e=>e.path)).size === batch.expectedCount &&
        (batch.kind ? doc.kind === batch.kind : true) &&
        (batch.schema ? doc.schema === batch.schema : true));
      add(`A1_BATCH_FILES:${batch.name}`, ok);
      if (!ok) continue;
      for (const e of entries) {
        const status = e.status ?? e.change;
        const expected = e.sha256_after ?? null;
        if (!['A','M','D'].includes(status) || (status !== 'D' && !isSha(expected))) {
          add(`A1_BATCH_ENTRY:${batch.name}:${e.path}`, false, 'missing SHA or unknown change type');
          continue;
        }
        const all = history.get(e.path) ?? [];
        all.push({batch:batch.name,change:status,sha256_after:expected});
        history.set(e.path,all);
      }
    }
    add('A1_R37_INTERMEDIATE_RATCHET', coverage.ratchet?.frozen === 41 &&
      coverage.ratchet?.current === 37 && coverage.ratchet?.resolved === 4 &&
      coverage.ratchet?.newForbidden === 0 && coverage.ratchet?.final === false,
      'R37 is a partial ratchet; must not impersonate the final A1 registry');
    const decisions = coverage.fileDecisions ?? {};
    const paths = Object.keys(decisions);
    add('A1_R37_COMPLETE_DECISIONS', paths.length === 49 && history.size === 49 &&
      paths.every(p=>history.has(p)) && [...history.keys()].every(p=>p in decisions),
      '51 manifest records collapse to 49 unique paths; every path needs a decision');
    for (const [p, versions] of history) {
      const expected = versions.at(-1), plan = decisions[p];
      const allowed = ['SHA_REQUIRED','EXCLUDE_AUDIT_ONLY','REGENERATE_APPROVED_LOCK'];
      add(`A1_DECISION:${p}`, !!(plan && allowed.includes(plan.decision) &&
        plan.reason?.trim() && plan.latestBatch===expected.batch &&
        plan.latestChange===expected.change && plan.sha256===expected.sha256_after),
        'missing/incorrect integration classification, SHA or source batch');
      if (!plan) continue;
      const root=policy.sourceRoots?.agent1;
      let bytes, safe=true, absent=false;
      try {
        const full=fileWithin(root,p);
        absent=!fs.existsSync(full);
        bytes=readOptional(full);
      } catch { bytes=null; safe=false; }
      const matches = expected.change==='D' ? safe && absent : !!(safe && bytes && sha256(bytes)===plan.sha256);
      add(`A1_SOURCE_FINAL_SHA:${p}`,matches,
        plan.decision==='EXCLUDE_AUDIT_ONLY' ? 'audit-only, pinned source, not copied to runtime' : 'A1 current after-SHA must match latest manifest');
    }
    const extras=coverage.excludedCompanionDocs ?? [];
    add('A1_COMPANION_EXCLUSIONS',extras.length===6 && new Set(extras.map(e=>e.path)).size===6 &&
      extras.every(e=>e.decision==='EXCLUDE_AUDIT_ONLY' && e.reason?.trim() && isSha(e.sha256)));
    for(const e of extras){
      let bytes;
      try { bytes=readOptional(fileWithin(policy.sourceRoots.agent1,e.path)); } catch {bytes=null;}
      add(`A1_EXCLUDED_COMPANION_SHA:${e.path}`,!!(bytes && sha256(bytes)===e.sha256));
    }
    const prior=coverage.sourceInventoryPriorPath;
    const priorBytes=prior ? readOptional(prior) : null;
    const priorOk=!!(priorBytes && sha256(priorBytes)===coverage.sourceInventoryPriorSha256);
    add('A1_PRIOR_INVENTORY_SHA',priorOk,'pinned inventory used to detect unmanifested new A1 files');
    if(priorOk){
      let before;
      try {before=JSON.parse(priorBytes.toString('utf8'));} catch {before=null;}
      const oldPaths=new Set(before?.agents?.agent1?.allDirtyPaths ?? []);
      let currentPaths;
      try {
        const root=policy.sourceRoots.agent1;
        const args=[['diff','--name-only','-z','HEAD'], ['ls-files','--others','--exclude-standard','-z']];
        currentPaths=new Set(args.flatMap(cmd=>execFileSync('git',['-C',root,...cmd],{maxBuffer:16*1024*1024}).toString('utf8').split('\0').filter(Boolean)));
      } catch {currentPaths=null;}
      add('A1_SOURCE_DIRTY_INVENTORY_AVAILABLE',!!currentPaths);
      if(currentPaths){
        const newPaths=[...currentPaths].filter(p=>!oldPaths.has(p)).sort();
        const excluded=new Set(extras.map(e=>e.path));
        const unaccounted=newPaths.filter(p=>!history.has(p) && !excluded.has(p));
        const expectedNew=coverage.newlyDirtyPaths ?? [];
        add('A1_NEW_FILES_ACCOUNTED',unaccounted.length===0 &&
          newPaths.length===expectedNew.length &&
          newPaths.every((p,i)=>p===expectedNew[i]),
          `newDirty=${newPaths.length}, unaccounted=${unaccounted.join(',') || 'none'}`);
        const canonical=JSON.stringify([...currentPaths].sort());
        add('A1_DIRTY_PATH_SET_SHA',sha256(Buffer.from(canonical))===coverage.sourceDirtyPathSetSha256,
          'new/removed A1 dirty source paths require a refreshed policy and file classification');
      }
    }
    // Explicit permission is distinct from the final A1 manifest. Synthetic
    // fixtures may set true; real policy remains false until authorized.
    if(policy.readyForIntegration!==true)
      pending('A1_R37_EXPLICIT_INTEGRATION_APPROVAL','Await separate permission; no branch creation/merge/push');
  }
  // A1 checkpoint 17: independently pinned 23 historical source manifests.
  // Source-only verifies ALL after-SHA (latest wins on shared app/guard/audit).
  // This never turns a 17-remaining checkpoint into a final integration approval.
  if (policy.a1Checkpoint17) {
    const checkpoint=policy.a1Checkpoint17;
    const batches=checkpoint.manifests ?? [];
    const versions=new Map();
    add('A1_R17_CHECKPOINT_STRUCTURE', checkpoint.kind==='gafus/a1-recovery-r17-source-coverage/v1'
      && checkpoint.state==='INTERMEDIATE_VERIFIED_NOT_FINAL'
      && batches.length===23 && checkpoint.totalManifestEntries===276
      && checkpoint.uniqueSourcePaths===183 && checkpoint.recoveryFiles===16
      && checkpoint.registry?.frozen===41 && checkpoint.registry.remaining===17
      && checkpoint.registry.resolved===24 && checkpoint.registry.newForbidden===0
      && checkpoint.registry.historical===142 && checkpoint.registry.historicalRetired===125);
    add('A1_R17_RECOVERY_IS_LAST_MANIFEST',batches.at(-1)?.name===checkpoint.recoveryManifestName
      && checkpoint.recoveryManifestName==='gafus-agent-1-to-agent-2-reminder-ag4-recovery-port-20261112.json'
      && batches.at(-1)?.sha256===checkpoint.recoveryManifestSha256);
    let total=0;
    for (const b of batches) {
      let bytes=null;
      try { bytes=readOptional(b.path); } catch {}
      const ok=!!(bytes && isSha(b.sha256) && sha256(bytes)===b.sha256);
      add(`A1_R17_MANIFEST_SHA:${b.name}`,ok,'whole manifest SHA pinned');
      if (!ok) continue;
      let doc=null;
      try { doc=JSON.parse(bytes.toString('utf8')); } catch {}
      const arr=doc?.files;
      const valid=!!(Array.isArray(arr) && arr.length===b.fileCount
        && new Set(arr.map(x=>x.path)).size===arr.length
        && (b.kind ? doc.kind===b.kind : true)
        && (b.schema ? doc.schema===b.schema : true));
      add(`A1_R17_MANIFEST_ENTRIES:${b.name}`,valid);
      if (!valid) continue;
      if (b.name===checkpoint.recoveryManifestName) {
        add('A1_R17_AG4_RECOVERY_REGISTRY',doc.edges_after===17
          && doc.frozen_ratchet?.baseline===41 && doc.frozen_ratchet.resolved===24
          && doc.frozen_ratchet.new===0 && arr.length===16,
          'recovered AG4 review port: remaining 17, 0 new forbidden');
      }
      total+=arr.length;
      for (const item of arr) {
        const rel=item.path;
        const change=item.status ?? item.change ?? 'M';
        const expected=item.sha256_after_current ?? item.sha256_after ?? item.sha256_current ?? item.sha256 ?? null;
        const sane=typeof rel==='string' && /^[^\\]+$/.test(rel)
          && !rel.startsWith('/') && !rel.split('/').some(x=>!x||x==='.'||x==='..');
        const accepted=sane && ['A','M','D'].includes(change)
          && (change==='D' || isSha(expected));
        if (!accepted) {
          add(`A1_R17_MANIFEST_BAD_ENTRY:${b.name}:${String(rel)}`,false);
          continue;
        }
        const h=versions.get(rel)??[];
        h.push({batch:b.name,change,sha256:expected});
        versions.set(rel,h);
      }
    }
    add('A1_R17_COMPLETE_276_ENTRIES',total===276 && versions.size===183);
    const decisions=checkpoint.fileDecisions??{};
    const keys=Object.keys(decisions);
    add('A1_R17_ALL_183_PATHS_CLASSIFIED',keys.length===183
      && keys.every(k=>versions.has(k)) && [...versions.keys()].every(k=>k in decisions));
    const a2p=new Set(checkpoint.a2CommittedPaths ?? []),
      a3p=new Set(checkpoint.a3FinalPaths ?? []),
      p0=new Set(policy.p0?.requiredPaths ?? []);
    const intersect=(set)=>[...versions.keys()].filter(p=>set.has(p)).sort();
    const expectedA2=intersect(a2p),expectedA3=intersect(a3p),expectedP0=intersect(p0);
    const expectedCommitted=['751a435ec5096211b4325d80821cdfff271edd8d',
      'b05ca9c4e1c767fd4f10ea55531048f434a52527',
      'fbd89d62a977726828d4df132db5a848cb96c851',
      'bd93aef2234e228191c1e112655d0c5c1b2a711e'];
    let actualA2Files=null,actualA2Chain=null;
    try {
      const repo=policy.sourceRoots.agent2;
      actualA2Files=execFileSync('git',['-C',repo,'diff','--name-only',
        '0dcd18c13c8d567d543d1981b18d3caa52b16503',expectedCommitted.at(-1)])
        .toString('utf8').split('\n').filter(Boolean).sort();
      actualA2Chain=execFileSync('git',['-C',repo,'rev-list','--reverse',
        '0dcd18c13c8d567d543d1981b18d3caa52b16503..HEAD'])
        .toString('utf8').split('\n').filter(Boolean);
    } catch {}
    add('A1_R17_A2_COMMITTED_39_GIT_GRAPH',JSON.stringify(actualA2Chain)===JSON.stringify(expectedCommitted)
      && JSON.stringify(actualA2Files)===JSON.stringify([...a2p].sort()),
      'overlap list must match real four A2 commits, not only authored policy');
    add('A1_R17_A2_4_COMMITTED_OVERLAP',a2p.size===39
      && JSON.stringify(expectedA2)===JSON.stringify(checkpoint.a2CommitIntersections)
      && expectedA2.length===1 && expectedA2[0]==='pnpm-lock.yaml');
    add('A1_R17_A3_FINAL39_PINNED_PATH_SET',!!(a3?.files
      && JSON.stringify([...a3p].sort())===JSON.stringify(a3.files.map(x=>x.path).sort())),
      'A3 39 paths must match the pinned final A3 manifest');
    add('A1_R17_A3_FINAL39_OVERLAP',a3p.size===39
      && JSON.stringify(expectedA3)===JSON.stringify(checkpoint.a3FinalIntersections)
      && expectedA3.length===0);
    add('A1_R17_P0_OVERLAP',JSON.stringify(expectedP0)===JSON.stringify(checkpoint.a2P0Intersections)
      && expectedP0.length===1 && expectedP0[0]==='pnpm-lock.yaml');
    const allowed=['SHA_REQUIRED','REGENERATE_APPROVED_LOCK','EXCLUDE_AUDIT_ONLY'];
    for (const [rel,h] of versions) {
      const last=h.at(-1),entry=decisions[rel];
      add(`A1_R17_DECISION:${rel}`,!!(entry && allowed.includes(entry.decision)
        && typeof entry.reason==='string' && entry.reason.length>=8
        && entry.sha256===last.sha256 && entry.latestBatch===last.batch
        && entry.latestChange===last.change
        && JSON.stringify(entry.history)===JSON.stringify(h)
        && entry.A2CommittedIntersection===a2p.has(rel)
        && entry.A3Final39Intersection===a3p.has(rel)),
        'every A1 manifest item has latest SHA and explicit runtime/audit/lock classification');
      let bytes=null,safe=true,absent=false;
      try {const fn=fileWithin(policy.sourceRoots.agent1,rel);absent=!fs.existsSync(fn);bytes=readOptional(fn);}catch{safe=false;}
      const matched=last.change==='D'?safe&&absent:!!(safe&&bytes&&sha256(bytes)===last.sha256);
      add(`A1_R17_SOURCE_SHA:${rel}`,matched,'source must equal latest SHA, older intermediate SHA not accepted');
    }
    const companions=checkpoint.companionEvidence??[];
    add('A1_R17_COMPANION_AUDIT_COVERAGE', companions.length===47
      && new Set(companions.map(v=>v.path)).size===47
      && companions.every(v=>v.decision==='EXCLUDE_AUDIT_ONLY' && typeof v.reason==='string'
        && v.reason.length>=8 && isSha(v.sha256)));
    for (const c of companions) {
      let b=null;
      try {b=readOptional(fileWithin(policy.sourceRoots.agent1,c.path));}catch{}
      add(`A1_R17_COMPANION_SOURCE_SHA:${c.path}`,!!(b&&sha256(b)===c.sha256));
    }
    let baselineBuf=null;
    try {baselineBuf=readOptional(checkpoint.baselineInventoryPath);}catch{}
    const pinnedBaseline=!!(baselineBuf && sha256(baselineBuf)===checkpoint.baselineInventorySha256);
    add('A1_R17_PRIOR_INVENTORY_SHA',pinnedBaseline);
    if (pinnedBaseline) {
      let old=null;
      try {old=JSON.parse(baselineBuf.toString('utf8'));}catch{}
      const prior=new Set(old?.agents?.agent1?.allDirtyPaths??[]);
      let current=null;
      try {
        const root=policy.sourceRoots.agent1;
        current=new Set([['diff','--name-only','-z','HEAD'],['ls-files','--others','--exclude-standard','-z']]
          .flatMap(cmd=>execFileSync('git',['-C',root,...cmd],{maxBuffer:16*1024*1024})
            .toString('utf8').split('\0').filter(Boolean)));
      } catch {}
      add('A1_R17_GIT_DIRTY_INVENTORY',!!current);
      if (current) {
        const canonical=JSON.stringify([...current].sort());
        add('A1_R17_SOURCE_DIRTY_SET_SHA',sha256(Buffer.from(canonical))===checkpoint.sourceDirtyPathsSha256
          && current.size===checkpoint.sourceDirtyCount,'any later A1 source changes invalidate this intermediate snapshot');
        const fresh=[...current].filter(x=>!prior.has(x)).sort();
        const covered=new Set([...versions.keys(),...companions.map(v=>v.path)]);
        const unaccounted=fresh.filter(p=>!covered.has(p));
        add('A1_R17_NEW_DIRTY_PATHS_ACCOUNTED',unaccounted.length===0
          && JSON.stringify(fresh)===JSON.stringify(checkpoint.newDirtyPathsSinceBaseline)
          && fresh.length===148 && checkpoint.uncoveredNewPaths?.length===0,
          `new=${fresh.length}, missing=${unaccounted.slice(0,6).join(',')||'none'}`);
      }
    }
    if (policy.readyForIntegration!==true)
      pending('A1_R17_EXPLICIT_INTEGRATION_APPROVAL','17 remaining is not final A1; no merge/commit/push');
  }
  const final = policy.finalArchitecture;
  const finalReady = !!(final?.manifestPath && isSha(final?.approvedManifestSha256));
  if (!finalReady) pending('A1_FINAL_REGISTRY_PIN', 'No approved final A1 architecture registry. Payment batch / prior results.tsv are insufficient.');
  else {
    const bytes = readOptional(final.manifestPath);
    const ok = bytes && sha256(bytes) === final.approvedManifestSha256;
    add('A1_FINAL_REGISTRY_SHA', !!ok, ok ? final.approvedManifestSha256 : 'SHA mismatch / unavailable');
    if (ok) {
      let obj;
      try { obj = JSON.parse(bytes.toString('utf8')); } catch { obj = null; }
      add('A1_FINAL_REGISTRY_CONTENT', !!(obj && obj.kind === 'gafus/a1-final-architecture/v1'
        && obj.status === 'FINAL_VERIFIED' && isSha(obj.sourceFingerprintSha256)
        && Number.isInteger(obj.registry?.remaining) && Number.isInteger(obj.registry?.newForbidden)
        && obj.registry.newForbidden === 0 && obj.verification?.architecture === 'PASS'),
        'requires approved frozen source fingerprint, 0 new forbidden deps, architectural PASS');
    }
  }
  // Reproduced lockfile evidence (optional): source inputs are pinned to the
  // exact isolated snapshot; any subsequent A1 manifest/patch drift fails.
  const lockEvidence=policy.lockfile ?? {};
  if (lockEvidence.isolatedRegeneratedSha256) {
    const b=lockEvidence.regenerationEvidencePath ? readOptional(lockEvidence.regenerationEvidencePath) : null;
    const pin=!!(b && isSha(lockEvidence.regenerationEvidenceSha256) &&
      sha256(b)===lockEvidence.regenerationEvidenceSha256);
    add('LOCK_PROOF_EVIDENCE_SHA',pin,'expected pinned JSON evidence');
    let evidence=null;
    if(pin)try {evidence=JSON.parse(b.toString('utf8'));}catch{evidence=null;}
    add('LOCK_PROOF_EVIDENCE_CONTENT',!!(evidence && evidence.expectedLockSha256===lockEvidence.isolatedRegeneratedSha256 &&
      evidence.regenerationResult?.sourceSnapshotLockSha256===lockEvidence.isolatedRegeneratedSha256 &&
      evidence.regenerationResult?.isolatedRegeneratedLockSha256===lockEvidence.isolatedRegeneratedSha256 &&
      evidence.validatedDependencyChecks===1292 && evidence.validatedDependencyPassed===1292 &&
      evidence.regenerationResult?.inputSnapshotStable!==false && evidence.inputSnapshotStable===true &&
      evidence.approvalStatus==='PROVISIONAL_LOCK_DIGEST_NOT_FINAL_A1_INTEGRATION'),
      'two identical offline-only regenerations; provisional, NOT final lock approval');
    const inps=Object.entries(lockEvidence.regenerationInputFilesSha256 ?? {});
    add('LOCK_PROOF_SNAPSHOT_88_FILES',inps.length===88);
    for (const [rel,h] of inps) {
      let source=null;
      try {source=readOptional(fileWithin(policy.sourceRoots.agent1,rel));}catch{}
      add(`LOCK_PROOF_SOURCE_SHA:${rel}`,!!(source && isSha(h) && sha256(source)===h),
        're-pin proof if A1 manifest, patch, workspace config or source lock changes');
    }
  }
  if (!candidate) {
    pending('CANDIDATE_COPY', 'No candidate provided; no writes performed.');
    return summarize(checks);
  }
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) {
    add('CANDIDATE_DIRECTORY', false, 'candidate must be an existing directory');
    return summarize(checks);
  }
  // Active working trees are never valid candidate copies.
  const active = Object.values(policy.sourceRoots ?? {}).map(s => path.resolve(s));
  const full = path.resolve(candidate);
  add('ISOLATED_CANDIDATE_COPY', !fs.lstatSync(candidate).isSymbolicLink() && active.every(x => full !== x && !full.startsWith(x + path.sep)),
    'candidate must be outside all three active agent worktrees');
  const candidateState = rel => {
    try {
      const file=fileWithin(candidate,rel);
      return {safe:true,absent:!fs.existsSync(file),bytes:readOptional(file)};
    } catch { return {safe:false,absent:false,bytes:null}; }
  };
  const dataAt = rel => candidateState(rel).bytes;

  if (pay?.files) {
    for (const item of pay.files) {
      const b = dataAt(item.path);
      add(`PAYMENT_FILE:${item.path}`, item.status === 'D' ? candidateState(item.path).safe && candidateState(item.path).absent : !!(b && sha256(b) === item.sha256_after),
        item.status === 'D' ? 'deleted legacy Core acceptance must stay absent' : 'exact pinned after-SHA required');
    }
  }
  if (a3?.files) for (const item of a3.files) {
    const b = dataAt(item.path);
    add(`A3_FILE:${item.path}`, !!(b && sha256(b) === item.sha256), 'file digest from final A3 handoff');
  }
  // Verify that all A1 source groups are actually represented in the frozen
  // candidate copy. Audit-only files are excluded intentionally. Reconciled
  // hunks require separate exact SHA approval; lockfile has its own gate below.
  if (policy.a1Coverage) {
    for (const [rel,entry] of Object.entries(policy.a1Coverage.fileDecisions ?? {})) {
      if(entry.decision==='EXCLUDE_AUDIT_ONLY') {
        add(`A1_CANDIDATE_EXCLUDED_AUDIT:${rel}`,!!entry.reason?.trim(),
          'Explicitly outside runtime integration; source SHA checked separately');
        continue;
      }
      if(entry.decision==='REGENERATE_APPROVED_LOCK') {
        add(`A1_CANDIDATE_MANUAL_LOCK:${rel}`,rel==='pnpm-lock.yaml',
          'Candidate must pass approved lock SHA and nonstale lock checks below');
        continue;
      }
      const b=dataAt(rel);
      const allowed=[entry.sha256,...(entry.reconciliationApprovedSha256 ?? [])].filter(isSha);
      const state=candidateState(rel);
      const ok=entry.latestChange==='D' ? state.safe && state.absent : !!(state.safe && b && allowed.includes(sha256(b)));
      add(`A1_CANDIDATE_SHA:${rel}`,ok,
        'expected A1 latest after-SHA or separately approved manual reconciliation SHA');
    }
  }
  if (policy.a1Checkpoint17) {
    // Candidate SHA of EVERY non-audit A1 path; lockfile has independent
    // regeneration and manual approval gates, never overwrite with old A2.
    for (const [rel,item] of Object.entries(policy.a1Checkpoint17.fileDecisions??{})) {
      if (item.decision==='EXCLUDE_AUDIT_ONLY') continue;
      if (item.decision==='REGENERATE_APPROVED_LOCK') {
        add('A1_R17_CANDIDATE_LOCK_REGEN_POLICY',rel==='pnpm-lock.yaml');
        continue;
      }
      const state=candidateState(rel);
      const allowed=[item.sha256,...(item.approvedReconciledSha256??[])].filter(isSha);
      const match=item.latestChange==='D' ? state.safe&&state.absent
        : !!(state.safe && state.bytes && allowed.includes(sha256(state.bytes)));
      add(`A1_R17_CANDIDATE_SHA:${rel}`,match,
        'latest A1 after SHA or individually approved reconciled SHA required');
    }
  }
  const p0 = policy.p0;
  const p0list = p0?.requiredPaths ?? [];
  add('P0_SIX_UNIQUE_PATHS', p0list.length === EXPECTED_P0.length && new Set(p0list).size === EXPECTED_P0.length && EXPECTED_P0.every(x => p0list.includes(x)));
  for (const name of p0list) {
    const b = dataAt(name);
    add(`P0_EXISTS:${name}`, !!b, 'required high-priority source file');
    if (b && name !== 'packages/prisma/schema.prisma' && name !== 'pnpm-lock.yaml') {
      const allowed = p0.integratedContentApprovedSha256?.[name] ?? [];
      add(`P0_APPROVED_SHA:${name}`, allowed.includes(sha256(b)), 'missing human-approved fingerprint of reconciliation');
    }
  }
  const schemaInfo = policy.schema;
  const schemaB = dataAt(schemaInfo.path);
  if (!schemaB) add('PRISMA_SCHEMA', false, 'schema missing');
  else {
    const txt = schemaB.toString('utf8');
    const header = txt.match(/(?:^|\n)generator\s+client\s*\{([\s\S]*?)\n\}/m)?.[1] ?? '';
    const flags = [...header.matchAll(/\bpreviewFeatures\s*=\s*\[([^\]]*)\]/g)];
    const features = flags.flatMap(m => [...m[1].matchAll(/"([^"]+)"/g)].map(v => v[1]));
    add('PRISMA_METRICS_PREVIEW', flags.length === 1 && features.includes(schemaInfo.requiredFeature), 'metrics required in generator client');
    const a1Baseline = txt.replace(/^[ \t]*previewFeatures[ \t]*=[ \t]*\[[^\]\n]*\][ \t]*\r?\n/m, '');
    add('PRISMA_A1_MODEL_BASELINE_SHA', sha256(Buffer.from(a1Baseline)) === schemaInfo.baselineA1WithoutMetricsSha256,
      'candidate must preserve A1 full schema models/indices; repin only after A1 final registry');
    for (const m of schemaInfo.requiredModels) add(`PRISMA_MODEL:${m}`, parseSchemaModel(txt,m) !== null);
    const chat2 = parseSchemaModel(txt,'Chat2OutboxEvent') ?? '';
    for (const col of schemaInfo.requiredChat2OutboxFields) add(`PRISMA_CHAT2_OUTBOX_FIELD:${col}`, new RegExp(`\\b${col}\\s+`).test(chat2));
    add('PRISMA_CHAT2_OUTBOX_INDEX', chat2.includes(schemaInfo.requiredChat2OutboxIndex));
  }
  const lockPolicy = policy.lockfile ?? {};
  const lockB = dataAt(lockPolicy.path ?? 'pnpm-lock.yaml');
  if (!lockB) add('LOCKFILE_EXISTS', false);
  else {
    const hash = sha256(lockB);
    if (lockPolicy.isolatedRegeneratedSha256) {
      add('LOCKFILE_EXPECTED_REGENERATED_SHA',hash===lockPolicy.isolatedRegeneratedSha256,
        'provisional expected SHA for A1 snapshot (separate approval still required)');
    }
    add('LOCKFILE_REJECT_KNOWN_STALE_A2', !lockPolicy.knownStaleSha256?.includes(hash),
      'never copy the stale committed A2 lockfile');
    if (!Array.isArray(lockPolicy.approvedCandidateSha256) || lockPolicy.approvedCandidateSha256.length === 0) {
      pending('LOCKFILE_APPROVED_SHA', 'No reviewed integration lockfile SHA; regenerate after package manifests are finalized');
    } else {
      add('LOCKFILE_APPROVED_SHA', lockPolicy.approvedCandidateSha256.includes(hash),
        'lockfile hash must be approved for frozen candidate');
    }
    let lock;
    try {
      const parsed = YAML.parseDocument(lockB.toString('utf8'), { uniqueKeys: true });
      if (parsed.errors.length) throw new Error(parsed.errors.map(e => e.message).join(' | '));
      lock = parsed.toJS({ maxAliasCount: 100 });
      add('LOCKFILE_YAML_PARSE', true);
    } catch (e) { add('LOCKFILE_YAML_PARSE', false, String(e)); }
    if (lock) {
      add('LOCKFILE_VERSION', String(lock.lockfileVersion) === '9.0');
      for (const importer of lockPolicy.requiredImporters ?? []) {
        const section = lock.importers?.[importer];
        add(`LOCKFILE_IMPORTER:${importer}`, !!section);
        const pkg = importer === '.' ? 'package.json' : `${importer}/package.json`;
        const pkgBuf = dataAt(pkg);
        let manifest;
        try { manifest = pkgBuf ? JSON.parse(pkgBuf.toString('utf8')) : null; }
        catch { manifest = null; }
        add(`LOCKFILE_PACKAGE_MANIFEST:${importer}`, !!manifest, pkg);
        if (manifest && section) {
          for (const [key, field] of [ ['dependencies','dependencies'], ['devDependencies','devDependencies'], ['optionalDependencies','optionalDependencies'] ]) {
            for (const [dependency, spec] of Object.entries(manifest[key] ?? {})) {
              const item = section[field]?.[dependency];
              // Lockfile specifiers may be rewritten by the root pnpm overrides.
              // Require every declared dependency to be present, and strict
              // workspace:* links for internal packages; frozen install later
              // verifies full external resolution against package manifests.
              const expectedWorkspace = (typeof spec === 'string' && spec.startsWith('workspace:')) || dependency.startsWith('@gafus/');
              const matched = !!item && (!expectedWorkspace || item.specifier === spec);
              add(`LOCKFILE_SPEC:${importer}:${dependency}`, matched,
                `declared ${spec}, lock ${item?.specifier ?? '<missing>'}`);
            }
          }
        }
      }
      for (const importer of lockPolicy.requirePaymentWorkspaceConsumers ?? []) {
        const item = lock.importers?.[importer]?.dependencies?.['@gafus/subscription-payment-server'];
        const expectedPath = importer === 'apps/api' ? '../../packages/subscription-payment-server' : '../subscription-payment-server';
        add(`LOCKFILE_PAYMENT_WORKSPACE:${importer}`, item?.specifier === 'workspace:*' && item?.version === 'link:' + expectedPath,
          'payment composition must use local workspace package, not registry version');
      }
      for (const [patch, expected] of Object.entries(lockPolicy.requiredPatches ?? {})) {
        const entry = lock.patchedDependencies?.[expected.lockKey];
        add(`LOCKFILE_PATCH_REFERENCE:${expected.lockKey}`, entry?.path === patch && typeof entry?.hash === 'string' && /^[a-f0-9]{64}$/.test(entry.hash),
          'retain patch locator and pnpm patch hash');
        const p = dataAt(patch);
        add(`LOCKFILE_PATCH_SHA:${patch}`, !!(p && sha256(p) === expected.sha256),
          'keep checked source patch bytes');
      }
    }
  }
  return summarize(checks);
}

function summarize(checks) {
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0 };
  for (const c of checks) counts[c.status]++;
  return {
    kind: 'gafus/integration-preflight-result/v1',
    verdict: counts.FAIL ? 'FAIL' : counts.BLOCKED ? 'BLOCKED' : 'PREFLIGHT_PASS_NOT_INTEGRATION_OR_RELEASE_ACCEPTANCE',
    counts, checks,
    noMutation: true,
    warning: 'Read-only preflight. Passing this does not authorize commit, merge, push, production, Cloud.ru, CDN, 33/5/18 regression or stage acceptance.',
  };
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const policy = readJson(args.policy);
    const result = preflight(policy, args.candidate);
    process.stdout.write(JSON.stringify({ policy: args.policy, candidate: args.candidate, ...result }, null, 2) + '\n');
    // 2 is expected for incomplete/awaiting A1; 1 is bad source/lock/manifest.
    process.exitCode = result.verdict === 'FAIL' ? 1 : result.verdict === 'BLOCKED' ? 2 : 0;
  } catch (e) {
    process.stderr.write(`PREFLIGHT_ERROR:${String(e?.message ?? e)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
