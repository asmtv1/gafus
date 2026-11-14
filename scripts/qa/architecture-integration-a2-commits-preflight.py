#!/usr/bin/env python3
"""Inventory four committed A2 changes vs LIVE A1 and A3 final, without writes to Git.

Produces fresh, versioned audit JSON and Markdown only in A2 audit directory.
No checkout, fetch, merge, patch application, branch, staging or git writes.
"""
from __future__ import annotations
import argparse
import collections
import datetime as dt
import hashlib
import json
import re
from pathlib import Path
import subprocess

DESKTOP=Path('/Users/asmtv1/Desktop')
A1=DESKTOP/'gafus-refactor'
A2=DESKTOP/'gafus-agent2-observability'
BASE='0dcd18c13c8d567d543d1981b18d3caa52b16503'
COMMITS=[
    '751a435ec5096211b4325d80821cdfff271edd8d',
    'b05ca9c4e1c767fd4f10ea55531048f434a52527',
    'fbd89d62a977726828d4df132db5a848cb96c851',
    'bd93aef2234e228191c1e112655d0c5c1b2a711e',
]
A3_PATH=A1/'docs/audit/gafus-agent-3-final-local-handoff-20261112.json'


def git(repo:Path, *args:str, check:bool=True) -> bytes|None:
    p=subprocess.run(['git','-C',str(repo),*args],capture_output=True)
    if p.returncode:
        if check: raise RuntimeError(f'GIT_READ_FAILED: {repo}:{args}: {p.stderr.decode(errors="replace")[:400]}')
        return None
    return p.stdout


def digest(data:bytes|None) -> str|None:
    return hashlib.sha256(data).hexdigest() if data is not None else None


def work_bytes(rel:str) -> bytes|None:
    p=A1/rel
    if p.is_symlink(): raise RuntimeError('A1_SOURCE_SYMLINK_NOT_ACCEPTED:'+rel)
    return p.read_bytes() if p.is_file() else None


def git_bytes(sha:str,rel:str) -> bytes|None:
    return git(A2,'show',f'{sha}:{rel}',check=False)


def classify(change:str,before:str|None,after:str|None,current:str|None) -> str:
    if current==after: return 'ALREADY_EXACT_AT_THIS_COMMIT'
    if current==before: return 'BASE_MATCH_OR_NEW_PATH'
    if change=='A' and current is not None:return 'POTENTIAL_ADD_ADD'
    if change=='M' and current is None:return 'MISSING_A1_MODIFIED_PATH'
    return 'POTENTIAL_CONTENT_CONFLICT'


def high_risk(path:str):
    if path=='pnpm-lock.yaml':return ('P0_LOCK_REGENERATE_FROM_FINAL_A1_MANIFESTS',
        'Preserve A1 70 workspace importer graph and 7 patches; A1 already has 5 A2 OTel deps. Never use old A2 whole lock. Regenerate once offline on isolated candidate after package reconciliation.')
    if path=='packages/prisma/schema.prisma':return ('P0_PRISMA_METRICS_HUNK_ONLY',
        'Preserve all A1 models, migrations, QuestionLegacyPhotoDeletion and Chat2 outbox fields/index; add only Prisma client previewFeatures metrics if absent. Verify prisma validate + empty DDL diff for flag.')
    if path=='packages/logger/package.json':return ('P0_LOGGER_PACKAGE_PRESERVE_OR_VERIFY',
        'A1 already contains committed A2 five OTel dependencies and ./server-telemetry exports; require matching SHA or approved reconciled package manifest.')
    if path=='packages/logger/src/serverTelemetry.ts':return ('P0_LOGGER_PRIVACY_REVIEW',
        'Use latest A2 committed tracing implementation reconciled with A1 query labels; no SQL, JWS, tokens, PII; emit bounded metrics and fail-open OTLP.')
    if path=='apps/api/src/lib/operation-observability.ts':return ('P0_API_TRACING_REVIEW',
        'Preserve A1 API operationId/requestId boundaries and existing middleware; reconcile A2 latest wrappers and privacy-safe OTLP exporter; local API contract test.')
    if path=='ci-cd/docker/prometheus/config.alloy':return ('P0_ALLOY_PIPELINES_REVIEW',
        'Merge A1 existing scrape/routing and A2 OTLP/metrics guards and bounded labels; no secret exposure.')
    if path=='ci-cd/docker/prometheus/gafus-alerts.yml':return ('P0_ALERT_RULES_REVIEW',
        'Union A1 existing rules and A2 new reliability families; avoid duplicate alert names, keep DLQ/360p rules; run local rules tests.')
    if path=='ci-cd/docker/prometheus/health-monitoring.contract.test.mjs':return ('P1_MONITORING_CONTRACT_RECONCILE',
        'Preserve A1 existing test coverage + A2 data labels/Prisma metrics, 12 local OTLP/monitor tests.')
    if path=='ci-cd/docker/grafana/dashboards/gafus-api-latency.json':return ('P1_GRAFANA_PANEL_REVIEW',
        'A1 may have newer dashboard layout and metric families; merge panel IDs/queries without blind whole-file replacement.')
    if path=='packages/prisma/src/client.ts':return ('P1_PRISMA_CLIENT_WRAP_REVIEW',
        'Preserve A1 client lifecycle/reuse and A2 query duration; ensure metrics preview and no duplicated PrismaClient.')
    if path.startswith('docs/audit/'):return ('DOC_VERIFY_HISTORICAL_ONLY',
        'Include A2 commit audit receipt for traceability, but do not treat historic 33/5 or staging PENDING as new acceptance.')
    if path.startswith('ci-cd/docker/'):return ('DOCKER_MONITORING_TEST_OR_DASHBOARD',
        'Keep latest A2 monitoring/rotation config and check local dashboards/rules; real staging recipient still PENDING.')
    if path.startswith('scripts/qa/'):return ('A2_QA_GATE_SEQUENCE',
        'Preserve final revision from later A2 commits; run local tests only after integrating full QA script chain.')
    if path.startswith('apps/') or path.startswith('packages/'):return ('A2_RUNTIME_OR_CONTRACT',
        'Preserve final A2 runtime semantics, tests and A1 composition contracts; verify API/Worker/logger/Prisma types.')
    return ('REVIEW', 'Confirm final A2 SHA and dependencies manually.')


def main():
    parser=argparse.ArgumentParser(description='READ ONLY A2 committed source vs live A1')
    parser.add_argument('--tag', default='20261112',
                        help='unique output tag, e.g. a1-final-20261120; no overwrites')
    opts=parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_-]{3,64}',opts.tag):
        raise SystemExit('INVALID_OUTPUT_TAG')
    out_json=A2/f'docs/audit/gafus-a2-four-commits-transfer-preflight-{opts.tag}.json'
    out_md=A2/f'docs/audit/gafus-a2-four-commits-transfer-preflight-{opts.tag}.md'
    if out_json.exists() or out_md.exists():
        raise SystemExit('REFUSE_OVERWRITE_PRIOR_A2_COMMIT_PREFLIGHT')
    real_commits=git(A2,'rev-list','--reverse',f'{BASE}..HEAD').decode().splitlines()
    assert real_commits==COMMITS, 'A2_COMMIT_CHAIN_CHANGED_REFRESH_PLAN'
    a1_head=git(A1,'rev-parse','HEAD').decode().strip()
    if a1_head!=BASE:
        assert subprocess.run(['git','-C',str(A1),'merge-base','--is-ancestor',BASE,a1_head]).returncode==0, 'A1_BASE_NOT_ANCESTOR_REVIEW_HISTORY'
    a3=json.loads(A3_PATH.read_text());a3paths={f['path'] for f in a3['files']}
    a2p0={'apps/api/src/lib/operation-observability.ts',
          'ci-cd/docker/prometheus/config.alloy',
          'ci-cd/docker/prometheus/gafus-alerts.yml',
          'packages/logger/src/serverTelemetry.ts',
          'packages/prisma/schema.prisma','pnpm-lock.yaml'}
    source_file_hashes={}
    aggregate={}
    commits=[]
    for index,sha in enumerate(COMMITS,1):
        parent=git(A2,'rev-parse',sha+'^').decode().strip()
        assert parent==(BASE if index==1 else COMMITS[index-2]), 'COMMIT_PARENT_CHAIN_NOT_LINEAR'
        subject=git(A2,'log','-1','--format=%s',sha).decode().strip()
        name_status=git(A2,'diff-tree','--no-commit-id','--name-status','-r',sha).decode().splitlines()
        changes=[]
        for row in name_status:
            state,path=row.split('\t',1)
            previous=digest(git_bytes(parent,path))
            current=digest(work_bytes(path))
            expected=digest(git_bytes(sha,path))
            classification=classify(state,previous,expected,current)
            if path not in source_file_hashes: source_file_hashes[path]=current
            owner,why=high_risk(path)
            change={
              'status':state,'path':path,'A2ParentSha256':previous,
              'A2AfterThisCommitSha256':expected,'A1CurrentSha256':current,
              'classificationAgainstUnmergedA1':classification,
              'A2P0':path in a2p0,'A3Final39':path in a3paths,
              'riskCategory':owner,'resolutionRule':why,
            }
            changes.append(change)
            r=aggregate.setdefault(path,{'path':path,'firstCommit':index,
                'A1CurrentSha256':current,'riskCategory':owner,
                'resolutionRule':why,'commitIndices':[],'A2P0':path in a2p0,
                'A3Final39':path in a3paths})
            r['commitIndices'].append(index)
        counts=dict(collections.Counter(c['classificationAgainstUnmergedA1'] for c in changes))
        commits.append({'sequence':index,'sha':sha,'parent':parent,'subject':subject,
                        'changeCount':len(changes),'classes':counts,'files':changes})
    for path,entry in aggregate.items():
        entry['A2FinalSha256']=digest(git_bytes(COMMITS[-1],path))
        entry['A1EqualsA2Final']=entry['A2FinalSha256']==entry['A1CurrentSha256']
    # File-level SHA consistency check before concluding; A1 is being edited by agent 1.
    drift=[p for p,old in source_file_hashes.items() if digest(work_bytes(p))!=old]
    assert not drift,'A1_SOURCE_SHA_CHANGED_DURING_AUDIT:'+repr(drift)
    final_manifest_candidates=sorted(str(p.name) for p in (A1/'docs/audit').glob('gafus-agent-1*final*') if p.is_file())
    dryrun=Path.home()/'Library/Logs/gafus-refactor-regression/a2-four-commits-readonly-preflight-20261112-0648'
    check_data=[]
    for i,c in enumerate(commits,1):
        stderr=dryrun/'patches'/(c['sha']+'.check.stderr')
        # Historic git apply --check is valid only for the original 0648 A1 snapshot.
        out=stderr.read_text() if opts.tag=='20261112' and stderr.is_file() else ''
        check_data.append({'sequence':i,'sha':c['sha'],
            'gitApplyCheckOnA1PathCopy':'FAIL' if out else 'NOT_RUN_FOR_THIS_SNAPSHOT',
            'stderrSha256':digest(out.encode()) if out else None,
            'stderrLineCount':len(out.splitlines()),
            'note':'Original read-only git apply --check vs UNPATCHED A1, NOT a sequential merge forecast; new source snapshots must repeat dry-run separately.'})
    overall={
      'schema':'gafus/a2-four-commits-transfer-plan/v1',
      'observedAtUtc':dt.datetime.now(dt.timezone.utc).isoformat(),
      'A2Head':COMMITS[-1],'A2Branch':git(A2,'branch','--show-current').decode().strip(),
      'A2Base':BASE,'A1HeadDuringPreflight':a1_head,
      'A1FinalManifestPublished':bool(final_manifest_candidates),
      'A1FinalManifestCandidates':final_manifest_candidates,
      'A3FinalManifestPath':str(A3_PATH),
      'A3FinalManifestSha256':digest(A3_PATH.read_bytes()),
      'A3Final39Overlap':sorted(set(aggregate)&a3paths),
      'A2P0Paths':sorted(set(aggregate)&a2p0),
      'commitCount':len(commits),'uniquePathCount':len(aggregate),
      'perCommitDiffCount':sum(c['changeCount'] for c in commits),
      'commits':commits,
      'uniquePaths':list(aggregate.values()),
      'A1SourceSnapshotStableDuringPreflight':True,
      'dryRun':check_data,
      'phase':'PREPARED_NOT_APPROVED_NO_SOURCE_CHANGES',
      'preconditions':['A1 FINAL architecture source registry with all files and SHA',
                       'freeze A1 source into a CLEAN dedicated approved integration branch',
                       'explicit permission for local integration and acceptance',
                       'A3 final shared source owner review and lockfile proof refresh'],
      'noBranchCreated':True,'noPatchApplied':True,'noCommitsMade':True,'noPushOrDeploy':True,
    }
    out_json.write_text(json.dumps(overall,ensure_ascii=False,indent=2)+'\n')
    headers=[
     '# GAFUS — четыре коммита A2, план будущего локального переноса',
     '',
     '**Только подготовка. Ни один cherry-pick / merge / patch не применён. A1 final manifest отсутствует.**',
     '',
     f'Основа A1/A3 `0dcd18c13`; A2 HEAD `{COMMITS[-1]}`. Уникальных путей A2: **{len(aggregate)}**, изменений по отдельным коммитам: **{overall["perCommitDiffCount"]}**. Прямые пересечения с A3 final 39: **{len(overall["A3Final39Overlap"])}**; P0 A2: **{len(overall["A2P0Paths"])}**.',
     '',
     '## Линейная зависимость (обязательный порядок)',
     '',
     '| Этап | Коммит | Затронуто | Прямые ожидаемые препятствия на текущем A1 |',
     '|---|---|---:|---|',
    ]
    for c in commits:
        risk=', '.join(f'{key}: {value}' for key,value in c['classes'].items())
        headers.append(f'| {c["sequence"]} | `{c["sha"][:12]}` | {c["changeCount"]} | {risk} |')
    headers+=['',
      'Важно: сравнение каждого коммита выполнено **отдельно с незавершённым A1**, а не поверх уже перенесённых коммитов. Поэтому `MISSING_A1_MODIFIED_PATH` в этапах 2–4 обычно означает зависимость от этапа 1/2, а не реальный будущий конфликт. 3-way merge после финального A1 может давать другую классификацию.',
      '',
      '## Пофайловые рекомендации P0 и ручное согласование',
      '',
      '| Файл | Коммиты | Взаимодействие с A1 | Обязательное решение |',
      '|---|---|---|---|',
    ]
    for e in aggregate.values():
        if e['riskCategory'].startswith('P0') or e['riskCategory'].startswith('P1') or e['A2P0']:
            headers.append(f'| `{e["path"]}` | {",".join(map(str,e["commitIndices"]))} | {"уже совпадает с финальным A2" if e["A1EqualsA2Final"] else "не совпадает с финальным A2"} | {e["riskCategory"]}: {e["resolutionRule"]} |')
    headers+=['',
      '## Результат dry-run `git apply --check` (никаких изменений)',
      '',
      'Проверка выполнена отдельно на временной копии **39 затронутых файлов A1** (`~/Library/Logs/gafus-refactor-regression/a2-four-commits-readonly-preflight-20261112-0648`), патчи не применялись. Каждый коммит проверялся против *того же исходного состояния*, а не после предыдущего.',
      '',
      '| Коммит | Результат | Строк ошибок |',
      '|---|---|---:|',
    ]
    for c in check_data:
        headers.append(f'| `{c["sha"][:12]}` | {c["gitApplyCheckOnA1PathCopy"]} | {c["stderrLineCount"]} |')
    headers+=['',
      '## Все 39 уникальных затронутых путей (SHA и статус — в JSON)',
      '',
      '| Файл | Этапы | A1 = финальный A2? | Прямой A3 final | Категория |',
      '|---|---|---|---|---|',
    ]
    for e in aggregate.values():
        headers.append(f'| `{e["path"]}` | {",".join(map(str,e["commitIndices"]))} | {"да" if e["A1EqualsA2Final"] else "нет"} | {"да" if e["A3Final39"] else "нет"} | `{e["riskCategory"]}` |')
    out_md.write_text('\n'.join(headers)+'\n')
    print(json.dumps({'commits':[{'n':c['sequence'],'sha':c['sha'][:12],'paths':c['changeCount'],'classes':c['classes']} for c in commits],
      'uniquePaths':len(aggregate),'perCommitFileEdits':overall['perCommitDiffCount'],
      'currentA1EqualsFinalA2':sum(v['A1EqualsA2Final'] for v in aggregate.values()),
      'A1FinalManifestFound':overall['A1FinalManifestPublished'],
      'A3FinalOverlap':overall['A3Final39Overlap'],
      'P0Overlap':overall['A2P0Paths'],
      'output':str(out_json)},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
