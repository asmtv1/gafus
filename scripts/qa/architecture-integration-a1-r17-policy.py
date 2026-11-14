#!/usr/bin/env python3
"""Freeze A1 17-edge intermediate source manifests and overlap matrix.

Reads live A1/A3 and committed A2; writes ONLY new, non-overwritten A2 audit files.
No branch, checkout, patch, npm, Git mutation or source copying.
"""
from __future__ import annotations
from collections import defaultdict,Counter
from hashlib import sha256
from pathlib import Path
import csv, json, subprocess

ROOT=Path('/Users/asmtv1/Desktop')
A1=ROOT/'gafus-refactor'
A2=ROOT/'gafus-agent2-observability'
AUDIT=A2/'docs/audit'
OLD=AUDIT/'gafus-agents-integration-preflight-policy-20261112-r37-lock-verified.json'
PREV=AUDIT/'gafus-agents-integration-inventory-20261112.json'
POLICY=AUDIT/'gafus-agents-integration-preflight-policy-20261112-r17.json'
COVER=AUDIT/'gafus-agents-integration-a1-r17-coverage-20261112.json'
MATRIX=AUDIT/'gafus-agents-integration-a1-r17-matrix-20261112.tsv'
MD=AUDIT/'gafus-agents-integration-a1-r17-matrix-20261112.md'
REC='gafus-agent-1-to-agent-2-reminder-ag4-recovery-port-20261112.json'
CHECKPOINT='docs/audit/gafus-agent-1-recovery-verified-checkpoint-20261112.md'
COMMITS=['751a435ec5096211b4325d80821cdfff271edd8d','b05ca9c4e1c767fd4f10ea55531048f434a52527','fbd89d62a977726828d4df132db5a848cb96c851','bd93aef2234e228191c1e112655d0c5c1b2a711e']

def hash_file(p:Path):
    return sha256(p.read_bytes()).hexdigest() if p.is_file() and not p.is_symlink() else None

def git(*a):
    return subprocess.check_output(['git','-C',str(A1),*a])

def current_dirty():
    result=set()
    for sub in [('diff','--name-only','-z','HEAD'),('ls-files','--others','--exclude-standard','-z')]:
        result.update(git(*sub).decode('utf-8','surrogateescape').rstrip('\0').split('\0'))
    return sorted(result-{''})

def manifest_record(p:Path):
    raw=json.loads(p.read_text())
    if not isinstance(raw.get('files'),list) or not raw['files']:raise RuntimeError('NO_FILES_IN_MANIFEST:'+p.name)
    return raw

def main():
    for p in [POLICY,COVER,MATRIX,MD]:
        if p.exists():raise SystemExit('REFUSE_OVERWRITE:'+str(p))
    assert OLD.is_file() and PREV.is_file()
    base=json.loads(OLD.read_text());oldpaths=set(json.loads(PREV.read_text())['agents']['agent1']['allDirtyPaths'])
    manifests=sorted((A1/'docs/audit').glob('gafus-agent-1-to-agent-2-*.json'),key=lambda p:(p.stat().st_mtime_ns,p.name))
    assert len(manifests)==23, f'EXPECTED_23_A1_MANIFESTS_GOT_{len(manifests)}'
    assert manifests[-1].name==REC, 'AG4_RECOVERY_NOT_LATEST_MANIFEST'
    latest={};history=defaultdict(list);batch=[];companion=[]
    for p in manifests:
        doc=manifest_record(p)
        count=len(doc['files']); paths=[f.get('path') for f in doc['files']]
        if len(set(paths))!=count:raise RuntimeError('DUPLICATE_MANIFEST_FILE:'+p.name)
        spec={'name':p.name,'path':str(p),'sha256':hash_file(p),'fileCount':count,
              'schema':doc.get('schema'),'kind':doc.get('kind'),
              'edgesAfter':doc.get('edges_after',doc.get('facade_current',doc.get('facades_after_this_group')))}
        batch.append(spec)
        for item in doc['files']:
            rel=item['path'];change=item.get('status',item.get('change','M'))
            h=next((item[f] for f in ('sha256_after_current','sha256_after','sha256_current','sha256')
                    if isinstance(item.get(f),str) and len(item[f])==64),None)
            if change not in ('A','M','D') or (change!='D' and (not h or len(h)!=64)):
                raise RuntimeError('INVALID_MANIFEST_PATH_SHA_OR_CHANGE:'+p.name+':'+rel)
            if rel.startswith('/') or '..' in Path(rel).parts or '\\' in rel:raise RuntimeError('UNSAFE_MANIFEST_PATH:'+rel)
            v={'batch':p.name,'change':change,'sha256':h}
            history[rel].append(v)
            latest[rel]=v
        for f in (p,p.with_suffix('.md')):
            if not f.is_file():raise RuntimeError('MISSING_MANIFEST_COMPANION:'+str(f))
            companion.append({'path':str(f.relative_to(A1)),'sha256':hash_file(f),
                'decision':'EXCLUDE_AUDIT_ONLY',
                'reason':'Audit JSON/Markdown handoff evidence; validate source SHA, do not copy into runtime integration'})
    assert sum(x['fileCount'] for x in batch)==276, 'UNEXPECTED_FILE_COUNT'
    assert len(latest)==183,'UNEXPECTED_UNIQUE_A1_FILES'
    note=A1/CHECKPOINT
    assert note.is_file()
    companion.append({'path':CHECKPOINT,'sha256':hash_file(note),'decision':'EXCLUDE_AUDIT_ONLY',
                      'reason':'Verified intermediate 17-edge recovery note, not final integration manifest'})
    checkpoint=json.loads((A1/'docs/audit'/REC).read_text())
    assert checkpoint['edges_after']==17 and checkpoint['frozen_ratchet']['resolved']==24 and checkpoint['frozen_ratchet']['new']==0
    assert len(checkpoint['files'])==16
    a2paths=set(subprocess.check_output(['git','-C',str(A2),'diff','--name-only',COMMITS[0]+'^',COMMITS[-1]],text=True).splitlines())
    assert len(a2paths)==39,'A2_COMMITTED_39_PATHS_DRIFT'
    a3manifest=Path(base['pinnedSourceManifests']['agent3']['path']);a3=json.loads(a3manifest.read_text())
    a3paths={o['path'] for o in a3['files']}
    assert len(a3paths)==39,'A3_FINAL_39_PATHS_DRIFT'
    p0=set(base['p0']['requiredPaths'])
    decisions={}
    for rel,v in sorted(latest.items()):
        content=hash_file(A1/rel)
        if not ((v['change']=='D' and content is None) or content==v['sha256']):
            raise RuntimeError('SOURCE_AFTER_SHA_DRIFT:'+rel)
        if rel.startswith('docs/audit/'):
            status='EXCLUDE_AUDIT_ONLY';reason='Historical progress/inventory source; retain its latest SHA, no runtime integration'
        elif rel=='pnpm-lock.yaml':
            status='REGENERATE_APPROVED_LOCK';reason='A2 P0: preserve final A1 package graph/patches and committed A2 OTel, regenerate lock in frozen copy'
        else:
            status='SHA_REQUIRED';reason=('A1 shared API bootstrapping/architecture guard requires semantic reconciliation'
                if rel in ('apps/api/src/app.ts','scripts/check-core-server-boundary.mjs','packages/core/package.json','packages/types/src/index.ts')
                else 'A1 source contract; latest SHA required or explicit reviewed reconciliation')
        decisions[rel]={ 'decision':status,'reason':reason,'sha256':v['sha256'],
            'latestBatch':v['batch'],'latestChange':v['change'],'history':history[rel],
            'approvedReconciledSha256':[],
            'A2CommittedIntersection':rel in a2paths,'A3Final39Intersection':rel in a3paths,'A2P0Intersection':rel in p0,
        }
    dirty=current_dirty();extra=sorted(set(dirty)-oldpaths)
    covered=set(latest)|{v['path'] for v in companion}
    unaccounted=sorted(set(extra)-covered)
    if unaccounted:raise RuntimeError('UNCOVERED_NEW_DIRTY_FILES:'+','.join(unaccounted))
    def canonical(v):return json.dumps(v,separators=(',',':'),ensure_ascii=False).encode()
    counts=Counter(o['decision'] for o in decisions.values())
    data={'kind':'gafus/a1-recovery-r17-source-coverage/v1',
      'state':'INTERMEDIATE_VERIFIED_NOT_FINAL',
      'registry':{'frozen':41,'remaining':17,'resolved':24,'newForbidden':0,'historical':142,'historicalRetired':125},
      'a1Head':git('rev-parse','HEAD').decode().strip(),
      'baselineInventoryPath':str(PREV),'baselineInventorySha256':hash_file(PREV),
      'sourceDirtyPathsSha256':sha256(canonical(dirty)).hexdigest(),
      'sourceDirtyCount':len(dirty),'newDirtyPathsSinceBaseline':extra,'newDirtyPathsCount':len(extra),
      'uncoveredNewPaths':unaccounted,
      'manifests':batch,'fileDecisions':decisions,'companionEvidence':companion,
      'totalManifestEntries':sum(x['fileCount'] for x in batch),'uniqueSourcePaths':len(decisions),
      'recoveryManifestName':REC,'recoveryManifestSha256':batch[-1]['sha256'],
      'recoveryFiles':len(checkpoint['files']),
      'statusCounts':dict(counts),'a2CommittedPaths':sorted(a2paths),
      'a3FinalPaths':sorted(a3paths),
      'a2CommitIntersections':sorted(a2paths&set(decisions)),
      'a3FinalIntersections':sorted(a3paths&set(decisions)),
      'a2P0Intersections':sorted(p0&set(decisions)),
      'sharedSemanticReviewPaths':[p for p in ['apps/api/src/app.ts','packages/core/package.json','packages/types/src/index.ts','scripts/check-core-server-boundary.mjs'] if p in decisions],
      'sourceSnapshotOnly':True,'integrationAuthorized':False,
    }
    policy=json.loads(OLD.read_text())
    policy['previousPolicySha256']=hash_file(OLD)
    policy.pop('a1Coverage',None)
    policy.pop('a1AdditionalBatches',None)
    policy.pop('r37OnlyPreflightStatus',None)
    policy['a1Checkpoint17']=data
    policy['readyForIntegration']=False
    policy['lockfile']['approvedCandidateSha256']=[]
    policy['finalArchitecture']={'manifestPath':None,'approvedManifestSha256':None,'required':True,
        'note':'17 is an INTERMEDIATE recovered checkpoint, NOT the FINAL VERIFIED A1 registry'}
    policy['schema']['baselineA1WithoutMetricsSha256']=hash_file(A1/'packages/prisma/schema.prisma')
    POLICY.write_text(json.dumps(policy,ensure_ascii=False,indent=2)+'\n')
    COVER.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    with MATRIX.open('w',newline='') as f:
        w=csv.writer(f,delimiter='\t');w.writerow(['path','latest_manifest','change','decision','sha256','manifest_versions','A2_committed_4','A3_final_39','A2_P0','reason'])
        for rel,d in decisions.items():w.writerow([rel,d['latestBatch'],d['latestChange'],d['decision'],d['sha256'] or 'ABSENT',len(d['history']),d['A2CommittedIntersection'],d['A3Final39Intersection'],d['A2P0Intersection'],d['reason']])
        for d in companion:w.writerow([d['path'],'companion','A',d['decision'],d['sha256'],1,'False','False','False',d['reason']])
    lines=['# A1 recovery checkpoint: 17 remaining — SHA и матрица пересечений','',
      '**Состояние:** промежуточная приёмка, НЕ финальный манифест. Только A2 copy/read-only A1.',
      '',f'- Ratchet **41 → 17**, устранено 24, новых 0; historical 142 → 17.',
      f'- **{len(batch)} манифеста, {data["totalManifestEntries"]} записей, {len(decisions)} уникальных файлов**. Восстановление AG4: {len(checkpoint["files"])} SHA, все должны совпадать.',
      f'- Решения: {counts.get("SHA_REQUIRED",0)} `SHA_REQUIRED`, {counts.get("REGENERATE_APPROVED_LOCK",0)} `REGENERATE_APPROVED_LOCK`, {counts.get("EXCLUDE_AUDIT_ONLY",0)} `EXCLUDE_AUDIT_ONLY` в файлах; companion audit {len(companion)} с закреплёнными SHA.',
      f'- Новых относительно прежнего inventory {len(extra)}: покрыто {len(extra)}, без статуса {len(unaccounted)}.',
      f'- **Пересечения с четырьмя committed A2 ({len(a2paths)} путей): {", ".join(data["a2CommitIntersections"]) or "нет"}**.',
      f'- **Пересечения с A3 final ({len(a3paths)} путей): {", ".join(data["a3FinalIntersections"]) or "нет"}**.',
      '- Не-прямой риск: `apps/api/src/app.ts` и `scripts/check-core-server-boundary.mjs` зависят от общей семантики порта/композиции; `packages/core/package.json` и `packages/types/src/index.ts` сверять по последней версии.',
      '- `pnpm-lock.yaml`: только regenerate от финальных package manifests, старый A2 lock запрещён. Последний A1 SHA — предварительное доказательство, не release approval.',
      '- Recovery: AG4 owner row lock, idempotency key, cap 5, UNKNOWN fail-closed, существующий keyed POST; review candidate остаётся unmounted.',
      '', '| Путь | Manifest | Статус | A2 committed | A3 final | Последний SHA-256 |',
      '|---|---|---|---|---|---|']
    for rel,d in decisions.items():
        lines.append(f'| `{rel}` | `{d["latestBatch"].replace("gafus-agent-1-to-agent-2-","").replace("-20261112.json","")}` | `{d["decision"]}` | {"да" if d["A2CommittedIntersection"] else "—"} | {"да" if d["A3Final39Intersection"] else "—"} | `{(d["sha256"] or "ABSENT")[:16]}` |')
    for d in companion:lines.append(f'| `{d["path"]}` | `companion` | `EXCLUDE_AUDIT_ONLY` | — | — | `{d["sha256"][:16]}` |')
    lines.extend(['','**Строгие ограничения:** финальный A1 manifest отсутствует; `readyForIntegration=false`, утверждённого SHA общего lockfile нет. Совместные 33-stage/5-chaos/real-PG/staging не принимались. Никакого merge/commit/push/deploy.'])
    MD.write_text('\n'.join(lines)+'\n')
    print(json.dumps({'manifests':len(batch),'entries':data['totalManifestEntries'],'sourcePaths':len(decisions),
      'statusCounts':dict(counts),'companion':len(companion),'dirtyPaths':len(dirty),'newDirty':len(extra),'unaccounted':len(unaccounted),
      'recoverySHA':data['recoveryManifestSha256'],'a2Direct':data['a2CommitIntersections'],'a3Direct':data['a3FinalIntersections'],
      'policy':str(POLICY)},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
