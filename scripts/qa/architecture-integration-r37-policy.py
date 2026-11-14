#!/usr/bin/env python3
"""Read-only A1 37-edge manifest reconciliation; emit NEW immutable candidate policy.

Does NOT mutate source, apply patches, invoke pnpm, or touch Git history.
Existing r41 policy remains unmodified. Refuse overwrite of output file.
"""
from __future__ import annotations
import csv
import hashlib
import json
from pathlib import Path
import subprocess

DESKTOP=Path('/Users/asmtv1/Desktop')
A1=DESKTOP/'gafus-refactor'
A2=DESKTOP/'gafus-agent2-observability'
A3=DESKTOP/'gafus-agent3-worker'
AUDIT=A2/'docs/audit'
OLD=AUDIT/'gafus-agents-integration-preflight-policy-20261112.json'
PREV=AUDIT/'gafus-agents-integration-inventory-20261112.json'
OUTPUT=AUDIT/'gafus-agents-integration-preflight-policy-20261112-r37.json'
COVERAGE=AUDIT/'gafus-agents-integration-a1-r37-coverage-20261112.json'
TSV=AUDIT/'gafus-agents-integration-a1-r37-matrix-20261112.tsv'
MARKDOWN=AUDIT/'gafus-agents-integration-a1-r37-matrix-20261112.md'
BATCHES=[
 ('payment','gafus-agent-1-to-agent-2-payment-composition-20261112.json',18),
 ('reminder','gafus-agent-1-to-agent-2-reminder-review-ports-20261112.json',7),
 ('flags_access','gafus-agent-1-to-agent-2-featureflags-subscription-ports-20261112.json',26),
]

def sha(data:bytes)->str:return hashlib.sha256(data).hexdigest()
def bytes_at(root:Path,rel:str):
    p=root/rel
    return p.read_bytes() if p.is_file() and not p.is_symlink() else None

def git_paths(*args):
    p=subprocess.run(['git','-C',str(A1),*args],capture_output=True,check=True)
    return set(p.stdout.decode('utf-8','surrogateescape').rstrip('\0').split('\0'))-{''}

def decision(path:str, group:str, status:str)->tuple[str,str]:
    if path.startswith('docs/audit/'):
        return 'EXCLUDE_AUDIT_ONLY','Historical progress/risk evidence retained in A1 audit, not runtime integration source'
    if path=='pnpm-lock.yaml':
        return 'REGENERATE_APPROVED_LOCK','Manual A2 P0 collision: preserve final pnpm overrides, workspace links, patches; require new approved lock SHA'
    if path=='apps/api/src/app.ts':
        return 'SHA_REQUIRED','A1 API composition startup, reconcile A2 telemetry/A3 shared routes; manual hunk review mandatory'
    if path in ('packages/core/package.json','packages/types/src/index.ts','scripts/check-core-server-boundary.mjs'):
        return 'SHA_REQUIRED','Cross-agent package/export/ratchet contract; preserve A1 ports and A2 telemetry, manual review'
    return 'SHA_REQUIRED','A1 owned group file; pinned after SHA required unless reconciliation SHA independently approved'

def main():
    if OUTPUT.exists() or COVERAGE.exists() or TSV.exists() or MARKDOWN.exists():
        raise SystemExit('REFUSE_OVERWRITE_R37_POLICY_OR_MATRIX: use new versioned path')
    old=json.loads(OLD.read_text());prior=json.loads(PREV.read_text())
    old_paths=set(prior['agents']['agent1']['allDirtyPaths'])
    current_paths=git_paths('diff','--name-only','-z','HEAD')|git_paths('ls-files','--others','--exclude-standard','-z')
    newly_dirty=sorted(current_paths-old_paths)
    manifest_records=[]; history={}
    for name,filename,count in BATCHES:
        file=A1/'docs/audit'/filename
        blob=file.read_bytes();d=json.loads(blob)
        if len(d['files'])!=count:raise SystemExit('UNEXPECTED_MANIFEST_FILE_COUNT:'+name)
        entries=[]
        for e in d['files']:
            p=e['path'];kind=e.get('status',e.get('change'))
            if kind not in ('A','M','D'):raise SystemExit('BAD_CHANGE_KIND:'+p)
            after=e.get('sha256_after')
            if kind!='D' and (not isinstance(after,str) or len(after)!=64):raise SystemExit('BAD_AFTER_SHA:'+p)
            history.setdefault(p,[]).append({'batch':name,'change':kind,'sha256_after':after})
            entries.append(p)
        if len(set(entries))!=count:raise SystemExit('DUPLICATE_PATHS:'+name)
        manifest_records.append({'name':name,'path':str(file),'sha256':sha(blob),'expectedCount':count,
            'kind':d.get('kind'),'schema':d.get('schema'),'facadesAfter':d.get('facades_after_this_group',d.get('facade_current',d.get('facades_after'))),
            'sha256MatchesRawDocument':True})
    decisions={}
    status_counts={}
    p0=set(old['p0']['requiredPaths'])
    a3=json.loads(Path(old['pinnedSourceManifests']['agent3']['path']).read_text())
    a3files={f['path'] for f in a3['files']}
    for p,h in sorted(history.items()):
        last=h[-1]
        current=bytes_at(A1,p)
        ok=(current is None if last['change']=='D' else current is not None and sha(current)==last['sha256_after'])
        if not ok:raise SystemExit('A1_MANIFEST_AFTER_SHA_DRIFT:'+p)
        status,why=decision(p,last['batch'],last['change'])
        status_counts[status]=status_counts.get(status,0)+1
        decisions[p]={'decision':status,'reason':why,'latestBatch':last['batch'],
            'sha256':last['sha256_after'],'latestChange':last['change'],'history':h,
            'reconciliationApprovedSha256':[],
            'a2P0Direct':p in p0,'a3FinalDirect':p in a3files,
            'a2ActiveWorktreeDiffers':current!=bytes_at(A2,p),
            'a3ActiveWorktreeDiffers':current!=bytes_at(A3,p),
            'newSincePinnedInventory':p in newly_dirty}
    extra_excluded=[]
    for name,filename,_ in BATCHES:
        md=filename.removesuffix('.json')+'.md'
        b=bytes_at(A1,'docs/audit/'+md)
        if b is None:raise SystemExit('MISSING_MANIFEST_DESCRIPTION:'+md)
        extra_excluded.append({'path':'docs/audit/'+md,'sha256':sha(b),'decision':'EXCLUDE_AUDIT_ONLY',
                               'reason':'Human-readable companion document, not runtime integration source'})
        manifest_file=A1/'docs/audit'/filename
        extra_excluded.append({'path':'docs/audit/'+filename,'sha256':sha(manifest_file.read_bytes()),
                               'decision':'EXCLUDE_AUDIT_ONLY',
                               'reason':'JSON SHA-pinned input evidence; validate manifest separately, not runtime source'})
    covered=set(decisions)|{x['path'] for x in extra_excluded}
    uncovered=sorted(set(newly_dirty)-covered)
    if uncovered:
        raise SystemExit('UNACCOUNTED_NEW_A1_DIRTY_FILES:'+','.join(uncovered))
    # New files are included in exact after-SHA or explicitly out-of-integration.
    source_overlay={
        'schema':'gafus/a1-r37-integration-coverage/v1',
        'ratchet':{'frozen':41,'current':37,'resolved':4,'newForbidden':0,'final':False},
        'sourceInventoryPriorPath':str(PREV),'sourceInventoryPriorSha256':sha(PREV.read_bytes()),
        'sourceDirtyPathSetSha256':sha(json.dumps(sorted(current_paths),separators=(',',':'),ensure_ascii=False).encode()),
        'sourceDirtyPathCount':len(current_paths),
        'newlyDirtyPaths':newly_dirty,
        'newlyDirtyCount':len(newly_dirty),
        'unaccountedNewA1Paths':uncovered,
        'batches':manifest_records,
        'fileDecisions':decisions,
        'excludedCompanionDocs':extra_excluded,
        'uniquePaths':len(decisions),
        'manifestEntryCount':sum(x['expectedCount'] for x in manifest_records),
        'statusCounts':status_counts,
        'A2P0DirectOverlaps':sorted(set(decisions)&p0),
        'A3FinalDirectOverlaps':sorted(set(decisions)&a3files),
        'newManifestP0DirectOverlaps':sorted(set(history)&p0),
        'lastManifest':'flags_access',
        'note':'A1 remaining 37 is intermediate; final architecture registry still absent',
    }
    policy=json.loads(OLD.read_text())
    policy['kind']='gafus/integration-preflight-policy/v1'
    policy['previousPolicySha256']=sha(OLD.read_bytes())
    policy['sourceRoots']['agent3']=str(A3)
    policy['a1AdditionalBatches']=manifest_records[1:]
    policy['a1Coverage']=source_overlay
    policy['lockfile']['observedA1SnapshotSha256']=sha((A1/'pnpm-lock.yaml').read_bytes())
    policy['lockfile']['approvedCandidateSha256']=[]
    policy['readyForIntegration']=False
    policy['finalArchitecture']={'manifestPath':None,'approvedManifestSha256':None,'required':True,
       'note':'A1 37 remaining is INTERMEDIATE; final registry + explicit authorization required'}
    # Source A1 base for Prisma remains pinned; never copy committed A2 schema.
    policy['r37OnlyPreflightStatus']='PENDING_FINAL_A1_AND_LOCK_APPROVAL'
    OUTPUT.write_text(json.dumps(policy,ensure_ascii=False,indent=2)+'\n')
    COVERAGE.write_text(json.dumps(source_overlay,ensure_ascii=False,indent=2)+'\n')
    with TSV.open('w',newline='') as f:
        writer=csv.writer(f,delimiter='\t')
        writer.writerow(['path','decision','latest_batch','latest_change','sha256','a2_p0','a3_final','a2_worktree_diff','a3_worktree_diff','new_since_snapshot','reason'])
        for p,v in decisions.items():
            writer.writerow([p,v['decision'],v['latestBatch'],v['latestChange'],v['sha256'] or 'ABSENT',v['a2P0Direct'],v['a3FinalDirect'],v['a2ActiveWorktreeDiffers'],v['a3ActiveWorktreeDiffers'],v['newSincePinnedInventory'],v['reason']])
        for e in extra_excluded:writer.writerow([e['path'],e['decision'],'manifest_description','A',e['sha256'],'False','False','n/a','n/a',e['path'] in newly_dirty,e['reason']])
    lines=['# GAFUS A1 r37 — покрытие SHA перед будущей интеграцией','',
           '**37 remaining / 4 resolved / 0 new от frozen 41 — промежуточно. Финальный A1 ещё не готов.**',
           '',f'- Манифесты: {len(manifest_records)}; записи {source_overlay["manifestEntryCount"]}, уникальных путей {len(decisions)}.',
           f'- Включено SHA: {status_counts.get("SHA_REQUIRED",0)}; lock regeneration with approval: {status_counts.get("REGENERATE_APPROVED_LOCK",0)}; Audit-excluded: {status_counts.get("EXCLUDE_AUDIT_ONLY",0)} + {len(extra_excluded)} companion docs.',
           f'- Новых относительно прежнего pinned inventory: {len(newly_dirty)}; без классификации: {len(uncovered)}.',
           f'- Прямой P0 A2: {source_overlay["A2P0DirectOverlaps"]}. Финальный A3 (39): {source_overlay["A3FinalDirectOverlaps"]}.',
           '', '| Файл | Источник | Решение | Пересечения | SHA-256/удаление |',
           '|---|---|---|---|---|']
    for p,v in decisions.items():
        badges=('P0-A2 ' if v['a2P0Direct'] else '')+('A3-final ' if v['a3FinalDirect'] else '')+('A2-worktree ' if v['a2ActiveWorktreeDiffers'] else '')
        lines.append(f'| `{p}` | `{v["latestBatch"]}` | `{v["decision"]}` | {badges.strip() or "—"} | `{(v["sha256"] or "ABSENT")[:16]}` |')
    for e in extra_excluded:
        lines.append(f'| `{e["path"]}` | `manifest_description` | `EXCLUDE_AUDIT_ONLY` | — | `{e["sha256"][:16]}` |')
    lines+=['', 'Особая ручная группа: `apps/api/src/app.ts`, `packages/core/package.json`, `packages/types/src/index.ts`, `scripts/check-core-server-boundary.mjs`. Не брать устаревший A2/A3 файл целиком, сверять startup installer и shared error exports. P0 `pnpm-lock.yaml` — обязательная regeneration после согласованных manifests; старый A2 SHA запрещён.',
            '', 'Reminder-review 7-file манифест содержит два audit-документа, которые позднее переписаны feature-flags group. Их исторические SHA хранятся в `history`, а для текущего дерева используется последний SHA feature-flags; документы помечены OUT-OF-INTEGRATION.',
            '', 'Никакие файлы A1 или Git-история не менялись; этот отчёт создан в A2.']
    MARKDOWN.write_text('\n'.join(lines)+'\n')
    print(json.dumps({'policy':str(OUTPUT),'unique':len(decisions),'manifestEntries':source_overlay['manifestEntryCount'],
        'newSinceOldInventory':len(newly_dirty),'unaccounted':uncovered,'a2P0Direct':source_overlay['A2P0DirectOverlaps'],
        'a3FinalDirect':source_overlay['A3FinalDirectOverlaps'],'statusCounts':status_counts,'companionExcluded':len(extra_excluded)},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
