#!/usr/bin/env python3
"""Read-only A1/A3/A2 handoff triage. Writes only untracked audit artefacts.

No git checkout/add/commit/merge/reset/cherry-pick/push; compares the exact
source files and the shared read-only Git base. No patch is applied.
"""
from __future__ import annotations
import collections
import datetime as dt
import difflib
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path('/Users/asmtv1/Desktop')
A1 = ROOT / 'gafus-refactor'
A2 = ROOT / 'gafus-agent2-observability'
A3 = ROOT / 'gafus-agent3-worker'
AUDIT = A2 / 'docs/audit'
DATA = AUDIT / 'gafus-agents-integration-inventory-20261112.json'
A3_MANIFEST = A1 / 'docs/audit/gafus-agent-3-final-local-handoff-20261112.json'
BASE = '0dcd18c13c8d567d543d1981b18d3caa52b16503'


def bytes_at(root: Path, path: str) -> bytes | None:
    p = root / path
    if p.is_symlink():
        return None  # never follow symlink into unknown environment
    return p.read_bytes() if p.is_file() else None


def sha(b: bytes | None) -> str:
    return hashlib.sha256(b).hexdigest() if b is not None else 'ABSENT'


def base_at(path: str) -> bytes | None:
    p = subprocess.run(['git', '-C', str(A1), 'show', f'{BASE}:{path}'],
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    return p.stdout if p.returncode == 0 else None


def edits(base: list[str], other: list[str]):
    return [ (tag, a, b) for tag, a, b, _, _ in
             difflib.SequenceMatcher(None, base, other, autojunk=False).get_opcodes()
             if tag != 'equal' ]


def overlaps(left, right) -> bool:
    # Replacements occupy half-open base ranges. Adjacent replacements are
    # disjoint. Insertions have zero width and touching either edit is risky.
    for _, a1, a2 in left:
        for _, b1, b2 in right:
            if a1==a2 or b1==b2:
                if a1<=b2 and b1<=a2: return True
            elif a1<b2 and b1<a2:
                return True
    return False


def context(path: str) -> tuple[str, str, str]:
    p = path.lower()
    if p in ('pnpm-lock.yaml', 'packages/prisma/schema.prisma'):
        return 'dependency/schema', 'manual-conflict', 'pnpm-lock/prisma schema; generate + typecheck + migration safety'
    if 'consultation' in p or 'booking' in p or 'slotservice' in p:
        return 'consultation/transactions', 'manual-conflict', 'consultation Core/API + isolated PG; ACL/atomic lock/idempotency/error identity'
    if 'dailycourse' in p or 'learner-daily' in p or 'userprogress' in p or 'course-progress' in p:
        return 'courses/progress', 'manual-conflict', 'Core + API daily-course/course-progress tests; ACL and post-commit'
    if 'error-handler' in p or 'g1-moderator' in p or 'architecture' in p or 'check-core-server' in p:
        return 'security/boundaries', 'manual-conflict', 'check:core-boundaries + API boundary/middleware tests'
    if p.startswith('packages/worker') or 'cron' in p:
        return 'worker/cron', 'manual-conflict', 'Worker typecheck + outbox/DLQ/cron real PG/Redis smoke'
    if 'otel' in p or 'observability' in p or 'telemetry' in p or 'prometheus' in p or 'grafana' in p:
        return 'observability', 'manual-conflict', 'A2 12 local gates + metrics/auth/low-cardinality + official promtool on stage'
    if p.endswith('lock.yaml') or p.endswith('package.json') or p.endswith('tsconfig.json'):
        return 'package/exports', 'manual-conflict', 'affected package build + typecheck + workspace graph; no whole-file overwrite'
    if p.startswith('apps/api/src/routes/v1/admin'):
        return 'admin/routes', 'manual-conflict', 'API authz, admin route contract and mounted UI tests'
    if p.startswith('apps/api/'):
        return 'api/ports', 'review-source', 'API routes/mounted contracts + core-boundaries + typecheck'
    if p.startswith('packages/core/'):
        return 'core/policy', 'review-source', 'Core unit + architecture boundaries + affected real PG tests'
    if p.startswith('packages/types/'):
        return 'shared-contracts', 'manual-conflict', 'types build + Core/API/Worker typechecks'
    if p.startswith('scripts/'):
        return 'qa/scripts', 'review-source', 'script syntax + affected smoke runner on isolated data'
    if p.startswith('docs/audit/'):
        return 'audit/evidence', 'review-source', 'compare run IDs and SHA; keep honest FAIL/PENDING and immutable baselines'
    return 'other', 'review-source', 'targeted test + build + typecheck'


def preferred_source(path: str, category: str, a3_roles: dict) -> tuple[str,str]:
    if path in a3_roles and a3_roles[path] == 'owned':
        return 'A3-owned', 'A3 final manifest lists this file as owned; verify SHA and owner code'
    if path in a3_roles and a3_roles[path] == 'shared':
        return 'A1+targeted-A3-hunk', 'A3 manifest explicitly says shared: transfer only its named hunk'
    if path == 'pnpm-lock.yaml':
        return 'regenerate-after-consensus', 'never take lockfile wholesale from either agent'
    if path.startswith('packages/worker') and 'consultation' not in path:
        return 'A3-worker-with-A1-contract-review', 'A3 owns Worker but A1 owns consultation ports and Core dependencies'
    if path.startswith('docs/audit/gafus-agent-3'):
        return 'A3-document', 'A3 handoff/receipt owner; preserve later verified observations'
    if path.startswith('docs/audit/'):
        return 'A1-evidence-source', 'verify most recent evidence; no false baseline change'
    if category in ('consultation/transactions','courses/progress','security/boundaries','api/ports','core/policy','shared-contracts'):
        return 'A1-baseline-with-A3-hunk-review', 'A1 owns Core→ports, policy and app composition; preserve A3 QA/security fixes'
    return 'A1-baseline-with-A3-review', 'A1 is current architecture baseline; capture any A3-only fix'


def test_guide(category: str, path: str, kind: str) -> str:
    if path == 'pnpm-lock.yaml':
        return 'pnpm install --frozen-lockfile; pnpm check:core-boundaries; pnpm typecheck'
    if path == 'packages/prisma/schema.prisma':
        return 'pnpm --filter @gafus/prisma prisma:generate; pnpm --filter @gafus/prisma typecheck; real PG migration expand-only / old-version compatibility; A2 pool metrics'
    if path.endswith('tsconfig.json'):
        return 'pnpm --filter @gafus/worker typecheck; pnpm check:core-boundaries; consultation reminder/cron tests'
    if 'account-cleanup-snapshot-isolated-pg.smoke.ts' in path:
        return 'bash scripts/qa/account-cleanup-snapshot-isolated-pg.sh; owner rollback/lease/foreign scope'
    if kind == 'delete-vs-present':
        return 'pnpm check:core-boundaries; pnpm --filter @gafus/core typecheck; pnpm --filter @gafus/api typecheck; targeted owner/ACL/rollback test'
    if category == 'consultation/transactions':
        return 'Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS'
    if category == 'courses/progress':
        return 'Core dailyCourse/userCourse/userProgress + course-progress-server + API mounted/isolated PG'
    if category == 'worker/cron':
        return 'pnpm --filter @gafus/worker typecheck; cron/consultation reminder tests; A3 PG/Redis outbox'
    if category == 'security/boundaries':
        return 'pnpm check:core-boundaries; API dependency-architecture; error-handler tests; owner deny before SQL'
    if category == 'shared-contracts':
        return 'pnpm --filter @gafus/types build; affected Core/API/Worker typecheck; DTO contract tests'
    if category == 'audit/evidence':
        return 'verify SHA/run IDs, no unsupported PASS; baseline lock and frozen risk inventory'
    if category == 'qa/scripts':
        return 'bash -n (shell) / node --check (JS); affected isolated smoke; no external resources'
    if category == 'admin/routes':
        return 'pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests'
    return 'affected package typecheck/build + targeted test; final 33/5/18 on one candidate'


def classify_path(path: str, kind: str, a3_roles: dict, a3_manifest_sha: dict) -> dict:
    b1, b3, ancestor = bytes_at(A1,path), bytes_at(A3,path), base_at(path)
    c, risk, guide = context(path)
    owner, why = preferred_source(path, c, a3_roles)
    source_digests = {'A1':sha(b1),'A3':sha(b3),'base':sha(ancestor)}
    out={'path':path,'kind':kind,'category':c,'preferredSource':owner,'sourceReason':why,
         'requiredVerification':test_guide(c,path,kind), 'sha256':source_digests,
         'A3ManifestScope':a3_roles.get(path),
         'A3ManifestSHAEqualToCommonTreeA1':(sha(b1) == a3_manifest_sha[path] if path in a3_manifest_sha else None),
         'A3ManifestSHAEqualToA3Worktree':(sha(b3) == a3_manifest_sha[path] if path in a3_manifest_sha else None),
         'sourceFileMissing': {'A1': b1 is None, 'A3': b3 is None},
         'baseExists':ancestor is not None}
    if kind == 'delete-vs-present':
        out['classification']='MANUAL_DELETE_VS_PRESENT'
        out['risk']='P0-core-exports'
        out['hunkRelationship']='removed in one worktree but present in other'
        if path.endswith('accountCleanup/index.ts'):
            out['preferredSource']='A1-keep-until-entrypoint-verified'
            out['sourceReason']='A1 kept accountCleanup index; removing it may break current ports/exports'
        else:
            out['preferredSource']='A1-deletion-with-port-verification'
            out['sourceReason']='A1 moved Core→server, do not reintroduce stale facade from A3'
        return out
    if b1 is None or b3 is None:
        out['classification']='MANUAL_INCONSISTENT_SNAPSHOT'
        out['risk']='P0'
        return out
    # Agent3 published its final provenance SHA from the *shared A1 tree*.
    # If A1 matches that SHA but the separate A3 worktree doesn't, that A3
    # contribution is ALREADY incorporated in A1: do not copy stale A3 bytes.
    if path in a3_manifest_sha and sha(b1)==a3_manifest_sha[path] and b1!=b3:
        out['classification']='AUTO_REUSE_A1_VERIFIED_A3_FINAL_HUNK'
        out['risk']='P1' if risk=='manual-conflict' else 'P2'
        out['preferredSource']='A1-with-verified-A3-final-file'
        out['sourceReason']='Agent3 final manifest SHA equals shared A1 file; A3 worktree is stale here'
        out['hunkRelationship']='Agent3 final already present in shared A1 tree'
        return out
    if b1==b3:
        out['classification']='AUTO_IDENTICAL_CONTENT'
        out['risk']='P2'
        return out
    if ancestor is not None and b3==ancestor:
        out['classification']='AUTO_A1_ONLY_CHANGED_BASE'
        out['risk']='P1' if risk == 'manual-conflict' else 'P2'
        out['preferredSource']='A1'
        out['hunkRelationship']='A3 unchanged from base'
        return out
    if ancestor is not None and b1==ancestor:
        out['classification']='AUTO_A3_ONLY_CHANGED_BASE'
        out['risk']='P1' if risk == 'manual-conflict' else 'P2'
        out['preferredSource']='A3'
        out['hunkRelationship']='A1 unchanged from base'
        return out
    if ancestor is None:
        out['hunkRelationship']='both added (no tracked base)'
        out['classification']='MANUAL_BOTH_ADDED'
        out['risk']='P1' if risk == 'manual-conflict' else 'P2'
        return out
    try:
        base, one, three=[s.decode('utf-8').splitlines(keepends=True) for s in (ancestor,b1,b3)]
        l,r=edits(base,one),edits(base,three)
        collide=overlaps(l,r)
        out['hunkRelationship']='overlap' if collide else 'disjoint-from-base'
        out['baseEditCounts']={'A1':len(l),'A3':len(r)}
        if collide or risk == 'manual-conflict' or owner=='A1+targeted-A3-hunk':
            out['classification']='MANUAL_SEMANTIC_OR_OVERLAPPING_HUNKS'
            out['risk']='P0' if risk=='manual-conflict' else 'P1'
        else:
            out['classification']='CANDIDATE_DISJOINT_HUNKS_REVIEW'
            out['risk']='P1'
        return out
    except UnicodeDecodeError:
        out['classification']='MANUAL_BINARY_SOURCE'
        out['risk']='P1'
        return out


def committed_a2(path: str) -> bytes | None:
    p = subprocess.run(['git','-C',str(A2),'show',f'HEAD:{path}'],
                       stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    return p.stdout if p.returncode == 0 else None


A2_REVIEW = {
    'packages/prisma/schema.prisma':('P0','A1 Prisma model + A2 metrics hunk','Prisma previewFeatures metrics, preserve A3 outbox schema, generate, typecheck, migration safety'),
    'pnpm-lock.yaml':('P0','regenerate after package manifests agreed','Never select full source. One lock resolution; frozen install after approval'),
    'apps/api/src/lib/operation-observability.ts':('P0','A2 runtime telemetry + A1 API composition','Reconcile HTTP operationId, route labels, private /internal/metrics, real PG pool wait, no secrets'),
    'packages/logger/src/serverTelemetry.ts':('P0','A2 telemetry + A1 logging hooks','Span parent/child, sanitized JSON, no payload/SQL/tokens, OTLP failure nonblocking'),
    'ci-cd/docker/prometheus/config.alloy':('P0','A2 low-cardinality allowlist + existing monitoring','Metrics target/auth, separate media/outbox scrape, source freshness, no secret in config'),
    'ci-cd/docker/prometheus/gafus-alerts.yml':('P0','A2 alert rules + existing production rules','Alert counts, no duplicate groups, 360p stuck and DLQ firing/resolved, route only test recipient'),
    'ci-cd/docker/prometheus/gafus-alerts.promtool.test.yml':('P1','A2 + existing promtool fixtures','Official promtool test rules; Alertmanager isolated webhook'),
    'ci-cd/docker/prometheus/health-monitoring.contract.test.mjs':('P1','A2 monitoring contract + existing checks','Node contract; Prometheus syntax, scrape and labels'),
    'ci-cd/docker/grafana/dashboards/gafus-api-latency.json':('P1','A2 latency dashboard with A1 API metrics','Validate JSON/data sources; HTTP p95/p99 and Prisma pool wait'),
    'ci-cd/docker/grafana/dashboards/gafus-media-chat.json':('P1','A2 media/chat dashboards + A3 job metrics','Panels source, 360p, outbox, DLQ; no unbounded labels'),
    'ci-cd/docker/grafana/dashboards/gafus-operations-reliability.json':('P1','A2 operation view + A3 outbox transitions','Rate/drain/DLQ and service health, no phantom metrics'),
    'scripts/qa/otel-local-collector.test.mjs':('P1','A2 OTLP fixture','Traceparent/operationId, collector down fail open'),
    'scripts/qa/prometheus-alertmanager-isolated.sh':('P1','A2 local alert harness','Actual Prometheus/Alertmanager if installed; no production webhook'),
    'packages/logger/package.json':('P1','identical if SHA matches A1/A2; otherwise review','OTel dependency versions, frozen lockfile, logger build'),
    'apps/api/src/lib/operation-observability.test.ts':('P1','identical if SHA matches; otherwise combine asserts','API operation contract tests, auth and label cardinality'),
    'docs/audit/gafus-agent-2-observability-20261111.md':('P2','A2 source, retain A1/A3 historical observations','Check run evidence and PENDING, do not promote local to staging'),
}


def a2_priority(path: str) -> dict:
    rank, prefer, guide=A2_REVIEW.get(path,('P1','review both','A2 local gates'))
    one,three,two=[bytes_at(root,path) for root in (A1,A3,A2)]
    committed=committed_a2(path)
    assert committed is not None, f'missing A2 committed source: {path}'
    status=('AUTO_IDENTICAL_A1_A3_A2_COMMITTED' if one==three==committed else
            'A1_A3_MATCH_A2_DIFF' if one==three else 'ALL_THREE_DIVERGE' if one!=three and one!=committed and three!=committed else
            'MANUAL_SHARED_DIFF')
    if path == 'pnpm-lock.yaml': status='REGENERATE_NO_DIRECT_COPY'
    return {'path':path,'priority':rank,'status':status,'preferredSource':prefer,
            'requiredVerification':guide,'sha256':{
                'A1':sha(one),'A3':sha(three),'A2Committed':sha(committed),
                'A2Working':sha(two)},
            'A2WorkingDiffersFromCommitted':two!=committed,
            'criticalReview': rank=='P0'}


def main():
    inventory=json.loads(DATA.read_text())
    assert inventory['agents']['agent1']['head']==BASE
    assert inventory['agents']['agent3']['head']==BASE
    roles={}; expected={}
    if A3_MANIFEST.is_file():
        manifest=json.loads(A3_MANIFEST.read_text())
        for item in manifest.get('files',[]):
            roles[item['path']]=item['scope']
            expected[item['path']]=item.get('sha256')
    diff=inventory['overlap']['divergentPaths']
    deleted=inventory['overlap']['asymmetricDeletionPaths']
    normal=[classify_path(p,'different-content',roles,expected) for p in diff]
    special=[classify_path(p,'delete-vs-present',roles,expected) for p in deleted]
    sha_initial=inventory['overlap'].get('divergentContentSha256',{})
    drift=[p for x in normal+special if (p:=x['path']) in sha_initial and
           (x['sha256']['A1']!=('ABSENT' if sha_initial[p]['agent1']=='deleted' else sha_initial[p]['agent1']) or
            x['sha256']['A3']!=('ABSENT' if sha_initial[p]['agent3']=='deleted' else sha_initial[p]['agent3']))]
    a2_entries=[a2_priority(p) for p in inventory['overlap']['triplePaths']]
    a2_entries.sort(key=lambda x:(x['priority'],x['path']))
    historical99=['docs/audit/core-server-bulk-progress-20261111.md',
                  'docs/audit/core-server-facade-baseline.json']
    classifications=collections.Counter(x['classification'] for x in normal+special)
    report={
        'schema':'gafus/integration-triage/v1',
        'recordedAtUtc':dt.datetime.now(dt.timezone.utc).isoformat(),
        'inventoryObservedAt':inventory['observedAtUTC'],
        'noGitHistoryMutation':True,
        'sourceSnapshotConsistentWithInventory':not drift,
        'changedDuringTriagePaths':drift,
        'a3ManifestRead':A3_MANIFEST.is_file(),
        'a3ManifestCapturedAt':manifest.get('capturedAt') if A3_MANIFEST.is_file() else None,
        'a3ManifestSourceRoot':manifest.get('repo',{}).get('root') if A3_MANIFEST.is_file() else None,
        'previous99Now101AdditionalCandidates':historical99 if all(x in diff for x in historical99) else [],
        'counts':{'differentContent':len(normal),'deleteVsPresent':len(special),
                  'matchedAutoWithoutConflict':inventory['overlap']['identicalFileContent'],
                  'deletedIdentically':inventory['overlap']['bothDeletedPaths'],
                  'a2Overlap':len(a2_entries),'classifications':dict(classifications)},
        'differentFiles':normal,
        'deleteVsPresent':special,
        'a2Prioritized':a2_entries,
        'safeDisjointNote':'Base-hunk disjoint is a suggestion only; manual policy/contract review mandatory',
    }
    output=AUDIT/'gafus-agents-integration-triage-20261112.json'
    output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in
          ('recordedAtUtc','sourceSnapshotConsistentWithInventory',
           'changedDuringTriagePaths','counts','a3ManifestCapturedAt')},ensure_ascii=False,indent=2))
    print('JSON_OUT',output)
    if drift: raise SystemExit('Source changed during triage. Refresh inventory and rerun.')


if __name__=='__main__':
    main()
