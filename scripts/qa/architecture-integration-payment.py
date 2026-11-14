#!/usr/bin/env python3
"""Read-only triage of 18-file A1 payment manifest against A2 P0 and A3 final.
Writes ONLY A2 audit outputs; never applies source patches or changes Git history.
"""
from __future__ import annotations
import collections
import csv
import datetime as dt
import hashlib
import json
import subprocess
from pathlib import Path

DESKTOP=Path('/Users/asmtv1/Desktop')
A1=DESKTOP/'gafus-refactor'
A2=DESKTOP/'gafus-agent2-observability'
A3=DESKTOP/'gafus-agent3-worker'
AUDIT=A2/'docs/audit'
A1_PAYMENT=A1/'docs/audit/gafus-agent-1-to-agent-2-payment-composition-20261112.json'
A3_FINAL=A1/'docs/audit/gafus-agent-3-final-local-handoff-20261112.json'
TRIAGE=AUDIT/'gafus-agents-integration-triage-20261112.json'

QA={
 'CORE':'pnpm --filter @gafus/core exec vitest run src/services/appSubscription/__tests__/paymentService.test.ts --config vitest.config.ts',
 'CORE_ARCH':'pnpm check:core-boundaries && node scripts/check-core-server-facades.mjs && pnpm --filter @gafus/core typecheck',
 'SERVER':'pnpm --filter @gafus/subscription-payment-server test && pnpm --filter @gafus/subscription-payment-server typecheck',
 'API':'pnpm --filter @gafus/api exec vitest run src/routes/v1/app-subscription.route.test.ts src/routes/v1/payment-provider-webhooks.test.ts src/routes/v1/admin-users.test.ts src/modules/architecture/dependency-architecture.test.ts --config vitest.config.ts',
 'API_TYPES':'pnpm --filter @gafus/api typecheck',
 'WORKER':'pnpm --filter @gafus/worker exec vitest run src/cron-scheduler.test.ts src/g1-consultation-outbox-core-cron-crossmodule.mock.test.ts --config vitest.config.ts',
 'WORKER_TYPES':'pnpm --filter @gafus/worker typecheck',
 'SCHEMA':'pnpm --filter @gafus/prisma prisma:generate && pnpm --filter @gafus/prisma typecheck',
 'LOCK':'pnpm install --frozen-lockfile && node scripts/check-workspace-graph.mjs',
 'A2':'A2_OBS_WITH_DB_RESTORE=1 bash scripts/qa/observability-agent2-local-gates.sh',
 'A3':'bash scripts/qa/a3-jobs-media-isolated-acceptance.sh a3-int-payment-final',
}


def sha_file(root:Path, name:str) -> str:
    p=root/name
    if p.is_symlink():return 'SYMLINK_UNSAFE'
    if not p.is_file():return 'ABSENT'
    h=hashlib.sha256()
    with p.open('rb') as f:
        while b:=f.read(1<<20):h.update(b)
    return h.hexdigest()


def classify(name:str) -> tuple[str,str,list[str],str]:
    if name.startswith('packages/core/src/services/appSubscription/'):
        return ('core-domain-boundary','A1/payment-manifest', ['CORE_ARCH','CORE'],
                'No runtime @gafus/subscription-payment-server import or re-export from Core; preserve promo policy and owner ACL')
    if name.startswith('packages/subscription-payment-server/'):
        return ('server-jws-acceptance','A1/payment-manifest', ['SERVER','CORE_ARCH'],
                'Keep Apple JWS/CA test-only in server package; do not treat synthetic JWS as Apple sandbox')
    if '/modules/app-subscription/composition/' in name:
        return ('api-payment-composition','A1/payment-manifest', ['API_TYPES','API','CORE_ARCH'],
                'Bind server factory via Core promo policy; single composition instance, no Core provider import')
    if name.startswith('apps/api/src/routes/v1/'):
        return ('api-routes-and-contracts','A1/payment-manifest', ['API_TYPES','API'],
                'Preserve webhook authentication/IP checks, cancel/idempotency, admin role scope, provider errors')
    if name.startswith('packages/worker/src/'):
        return ('worker-payment-cron','A1/payment-manifest with A3 Worker review', ['WORKER_TYPES','WORKER','A3'],
                'Keep A3 consultation cron/worker TS paths and reliable outbox scheduler, add only A1 payment composition')
    raise ValueError('Unexpected payment path: '+name)


def main():
    payment=json.loads(A1_PAYMENT.read_text())
    a3=json.loads(A3_FINAL.read_text())
    triage=json.loads(TRIAGE.read_text())
    files=payment['files']
    if len(files)!=18 or len(set(e['path'] for e in files))!=18:
        raise SystemExit('A1_PAYMENT_MANIFEST_NOT_EXACTLY_18_UNIQUE_PATHS')
    a2p0={e['path'] for e in triage['a2Prioritized'] if e['priority']=='P0'}
    a2all={e['path'] for e in triage['a2Prioritized']}
    a3files={e['path']:e for e in a3['files']}
    before_manifest_path=Path(payment['backup_root'])/'manifest.json'
    before_manifest=json.loads(before_manifest_path.read_text()) if before_manifest_path.is_file() else {'files':[]}
    before_lookup={f['path']:f['sha256'] for f in before_manifest['files']}
    status_counts=collections.Counter()
    categories=collections.Counter()
    evidence=[]
    for item in files:
        name=item['path'];status=item['status'];status_counts[status]+=1
        current_sha=sha_file(A1,name)
        expected=item.get('sha256_after')
        after_ok=(current_sha=='ABSENT' if status=='D' else current_sha==expected)
        before_sha=item.get('sha256_before')
        before_ok=before_lookup.get(name)==before_sha if before_sha is not None and name in before_lookup else None
        group,owner,qa,why=classify(name);categories[group]+=1
        a3_sha=sha_file(A3,name)
        a2_sha=sha_file(A2,name)
        path_conflict=next((e for e in triage['differentFiles']+triage['deleteVsPresent'] if e['path']==name),None)
        evidence.append({
          'path':name,'changeType':status,'category':group,'sourceOfTruth':owner,
          'afterSha256Manifest':expected,'afterSha256CurrentA1':current_sha,
          'afterShaVerified':after_ok,'beforeSha256Manifest':before_sha,
          'beforeBackupManifestMatches':before_ok,
          'beforeBackedUp':name in before_lookup,
          'A3WorktreeSha256':a3_sha,'A2WorktreeSha256':a2_sha,
          'sameAsA3Worktree':current_sha==a3_sha,
          'sameAsA2Worktree':current_sha==a2_sha,
          'directA2P0Overlap':name in a2p0,
          'directA2AnyCommittedOverlap':name in a2all,
          'directA3FinalSetOverlap':name in a3files,
          'a3FinalScope':a3files.get(name,{}).get('scope'),
          'existingTriageClassification':path_conflict['classification'] if path_conflict else 'A1_ONLY_OR_ALREADY_MATCHED_BASE',
          'transferPlan':'A1 GROUP: adopt after source freeze; never replace full A3 worker runtime' if group=='worker-payment-cron' else 'A1 GROUP: transfer with related ports/tests after freeze',
          'qaGateIds':qa,'minimumCommands':[QA[q] for q in qa],
          'semanticConstraint':why,
        })
    direct_p0=sorted(set(e['path'] for e in evidence)&a2p0)
    direct_a2=sorted(set(e['path'] for e in evidence)&a2all)
    direct_a3=sorted(set(e['path'] for e in evidence)&set(a3files))
    # Independently verify the sensitive P0 integration strategy on real files.
    committed_schema=subprocess.run(['git','-C',str(A2),'show','HEAD:packages/prisma/schema.prisma'],
                                    check=True,capture_output=True).stdout.decode('utf8')
    a1_schema=(A1/'packages/prisma/schema.prisma').read_text()
    metrics_flag='  previewFeatures = ["metrics"]\n'
    schema_only_metrics_committed=(metrics_flag in committed_schema and
                                   committed_schema.replace(metrics_flag,'',1)==a1_schema)
    a2_working_schema=(A2/'packages/prisma/schema.prisma').read_text()
    schema_only_metrics_working=(metrics_flag in a2_working_schema and
                                 a2_working_schema.replace(metrics_flag,'',1)==a1_schema)
    a1_only_models=sorted({m for m in ['QuestionLegacyPhotoDeletion'] if
                           'model '+m+' {' in a1_schema and 'model '+m+' {' not in committed_schema})
    outbox_fields=['claimToken String?', 'operationId String?', 'traceId String?',
                   'lastErrorCode String?', 'deadLetteredAt DateTime?']
    def model_block(source:str, model:str)->str:
        header='model '+model+' {'
        return source.split(header,1)[1].split('\n}',1)[0] if header in source else ''
    a1_outbox=model_block(a1_schema,'Chat2OutboxEvent')
    a2_outbox=model_block(committed_schema,'Chat2OutboxEvent')
    a1_outbox_a2_committed_missing=[v for v in outbox_fields if
                                    v in a1_outbox and v not in a2_outbox]
    payment_models=['AppSubscription','AppSubscriptionPayment','AppSubscriptionPromoCode',
                    'AppSubscriptionEvent','AppSubscriptionFinanceRefund']
    model_presence={m:('model '+m+' {' in a1_schema) for m in payment_models}
    a1_lock=(A1/'pnpm-lock.yaml').read_bytes()
    a2_lock=subprocess.run(['git','-C',str(A2),'show','HEAD:pnpm-lock.yaml'],
                           check=True,capture_output=True).stdout
    patch_paths=['patches/expo-modules-core@55.0.27.patch',
                 'patches/react-native-reanimated@4.2.1.patch',
                 'patches/react-native-compressor@1.16.0.patch']
    lock_text=a1_lock.decode('utf8')
    lockfile_inputs={
      'A1SchemaSha256':sha_file(A1,'packages/prisma/schema.prisma'),
      'A2CommittedSchemaSha256':hashlib.sha256(committed_schema.encode()).hexdigest(),
      'A1VsA2CommittedSchemaOnlyMetricsGeneratorFlag':schema_only_metrics_committed,
      'A1VsA2WorkingSchemaOnlyMetricsGeneratorFlag':schema_only_metrics_working,
      'A1OnlyModelsMissingInA2Committed':a1_only_models,
      'A1OnlyOutboxFieldsMissingInA2Committed':a1_outbox_a2_committed_missing,
      'schemaRequiresManualA1BaselinePlusA2MetricsHunk':not schema_only_metrics_committed,
      'A1PaymentModelsPresent':model_presence,
      'A1LockSha256':hashlib.sha256(a1_lock).hexdigest(),
      'A2CommittedLockSha256':hashlib.sha256(a2_lock).hexdigest(),
      'lockfilesIdentical':a1_lock==a2_lock,
      'A1SubscriptionPaymentServerWorkspaceLink': "'@gafus/subscription-payment-server':" in lock_text,
      'A1CriticalPatches':{path:{'fileExists':(A1/path).is_file(),
                                 'referencedByLock':path in lock_text} for path in patch_paths},
    }
    semantic=[
      {'priority':'P0','relatedPath':'packages/prisma/schema.prisma',
       'relatedOwner':'A2 telemetry + A1 Prisma domain schema',
       'intersection':'INDIRECT: payment transitions query existing AppSubscription and payment models; manifest does not edit schema',
       'decision':'Keep A1 complete models and add A2 previewFeatures=["metrics"] in generator only; no schema reset/migration solely for telemetry flag',
       'minimumGateIds':['SCHEMA','CORE_ARCH','API_TYPES','WORKER_TYPES','A2'],
       'gateNote':'Confirm generated Prisma client exposes metrics; check payment models and no destructive migration'},
      {'priority':'P0','relatedPath':'pnpm-lock.yaml',
       'relatedOwner':'recalculate from final combined manifests/patches',
       'intersection':'INDIRECT: A1 payment composition relies on subscription-payment-server workspace export; main lock has many packages/patches missing in A2 older lock',
       'decision':'Never copy A2 lockfile over A1. After owner package.json consensus regenerate lockfile once, verify Expo/RN patch references, then frozen install',
       'minimumGateIds':['LOCK','CORE_ARCH','API_TYPES','WORKER_TYPES'],
       'gateNote':'A1 payment manifest contains no package.json or lockfile edit; they are separate integration inputs'},
      {'priority':'P0','relatedPath':'apps/api/src/lib/operation-observability.ts',
       'relatedOwner':'A2 API observability',
       'intersection':'INDIRECT: payment checkout/webhooks/admin route need original middleware requestId/operationId and fail-open OTLP',
       'decision':'Keep A1 payment routes; A2 trace adapter/metrics composed at app boundary, never log tokens/payment credentials',
       'minimumGateIds':['API','API_TYPES','A2'],
       'gateNote':'Check identical request correlation for checkout and webhook with privacy redaction'},
      {'priority':'P0','relatedPath':'packages/logger/src/serverTelemetry.ts',
       'relatedOwner':'A2 logger telemetry',
       'intersection':'INDIRECT: do not emit card, receipt, YooKassa keys or Apple JWS in spans',
       'decision':'Combine A1 domain errors and A2 safe JSON trace spans without raw payment payloads',
       'minimumGateIds':['API','WORKER','A2'],
       'gateNote':'Unit and privacy contract for payment webhook, worker retry and callback'},
      {'priority':'P0','relatedPath':'ci-cd/docker/prometheus/config.alloy',
       'relatedOwner':'A2 monitoring config',
       'intersection':'INDIRECT: new payment route/cron labels must be bounded, no PII/payment IDs',
       'decision':'Keep A2 label allowlist and authenticated scrape; no direct payment-specific scrape claimed',
       'minimumGateIds':['A2'],
       'gateNote':'Monitoring contract and low-cardinality labels'},
      {'priority':'P0','relatedPath':'ci-cd/docker/prometheus/gafus-alerts.yml',
       'relatedOwner':'A2 alert rules',
       'intersection':'INDIRECT: worker cron changes must not break shared Worker health/outbox signals',
       'decision':'Preserve A2 alert rules; verify no missing Worker metrics; test recipient actual alert remains staging PENDING',
       'minimumGateIds':['WORKER','A2'],
       'gateNote':'Local rules/alert harness, actual staging firing/resolved still PENDING'},
      {'priority':'P1','relatedPath':'packages/worker/tsconfig.json',
       'relatedOwner':'A3 final shared A1 source',
       'intersection':'INDIRECT: A1 payment cron uses server composition and A3 consultation cron needs booking-application TS path',
       'decision':'Keep current shared A1 tsconfig; A3 final SHA matches it; do not copy older A3 worktree file',
       'minimumGateIds':['WORKER_TYPES','WORKER','A3'],
       'gateNote':'Cron payment + consultation jobs and worker tsconfig paths'},
      {'priority':'P1','relatedPath':'apps/api/src/routes/v1/admin-media.ts',
       'relatedOwner':'A3 DLQ shared A1 source',
       'intersection':'INDIRECT: adjacent admin routes and role guards, not the same file as A1 admin-users.ts',
       'decision':'Keep A3 DLQ GET/POST and A1 payment admin-users cancellation; verify both role scopes',
       'minimumGateIds':['API','A3'],
       'gateNote':'Admin payment cancellation and DLQ 409/403 mounted smoke'},
    ]
    out={
       'schema':'gafus/integration-payment-overlay/v1',
       'recordedAtUtc':dt.datetime.now(dt.timezone.utc).isoformat(),
       'paymentManifestPath':str(A1_PAYMENT),
       'paymentManifestSha256':hashlib.sha256(A1_PAYMENT.read_bytes()).hexdigest(),
       'manifestGeneratedAtUtc':payment['generated_utc'],
       'manifestHead':payment['head_at_creation'],
       'A1RegistryStatus':'PARTIAL_PAYMENT_GROUP_NOT_FINAL_ARCHITECTURE',
       'manifestGroup':payment['group'],
       'facades':{'before':payment['facades_before'],'after':payment['facades_after'],
                  'resolved':payment['facades_resolved_in_group'],'newForbidden':payment['new_forbidden_facades']},
       'statusCounts':dict(status_counts),
       'categoryCounts':dict(categories),
       'fileCount':len(evidence),'A1CurrentFilesMatchManifest':all(e['afterShaVerified'] for e in evidence),
       'A1BeforeSHAFromAvailableBackupVerified':all(e['beforeBackupManifestMatches'] is True for e in evidence if e['beforeBackedUp']),
       'missingBeforeBackupFiles':[e['path'] for e in evidence if e['beforeSha256Manifest'] is not None and not e['beforeBackedUp']],
       'directA2P0Paths':direct_p0,'directA2CommittedPaths':direct_a2,'directA3FinalSetPaths':direct_a3,
       'A3FinalManifestPath':str(A3_FINAL),
       'A3FinalManifestSha256':hashlib.sha256(A3_FINAL.read_bytes()).hexdigest(),
       'A3FinalSetCount':len(a3files),
       'A2P0Count':len(a2p0),
       'existingTriageSha256':hashlib.sha256(TRIAGE.read_bytes()).hexdigest(),
       'P0SchemaAndLockVerifiedInputs':lockfile_inputs,
       'files':evidence,'semanticCrossings':semantic,'qaCommands':QA,
       'localVerifiedTestsByA1':{'paymentCore':50,'paymentApiAndArchitecture':134,'workerCron':13,'serverJWS':5},
       'externalStillPending':['realPGPaymentConcurrencyRollback','YooKassaTestShop','AppleSandbox',
                               'full33RegressionAfterPayment','full5ChaosAfterPayment',
                               'cloud360pCDNBackendAlertLoadAB'],
       'noGitHistoryMutation':True,
    }
    path=AUDIT/'gafus-agents-integration-payment-overlay-20261112.json'
    path.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    tsv=AUDIT/'gafus-agents-integration-payment-overlay-20261112.tsv'
    with tsv.open('w',newline='') as f:
        w=csv.writer(f,delimiter='\t');w.writerow(['status','path','category','source','A1_after_SHA_verified','A3_final_direct','A2_P0_direct','minimum_commands','semantic_constraint'])
        for e in evidence:w.writerow([e['changeType'],e['path'],e['category'],e['sourceOfTruth'],e['afterShaVerified'],e['directA3FinalSetOverlap'],e['directA2P0Overlap'],' ; '.join(e['minimumCommands']),e['semanticConstraint']])
    print(json.dumps({'paymentFiles':len(evidence),'statusCounts':dict(status_counts),'A1AfterSHAAllVerified':out['A1CurrentFilesMatchManifest'],
      'A1BackupBeforeSHAAvailableVerified':out['A1BeforeSHAFromAvailableBackupVerified'],'missingBackupBefore':out['missingBeforeBackupFiles'],
      'directA2P0':direct_p0,'directA3Final39':direct_a3,'semanticCrossings':len(semantic),'output':str(path)},ensure_ascii=False,indent=2))
    if not out['A1CurrentFilesMatchManifest']:raise SystemExit('PAYMENT_MANIFEST_SOURCE_DRIFT_REFRESH_BEFORE_INTEGRATION')
    if metrics_flag not in committed_schema or metrics_flag in a1_schema or not all(model_presence.values()):
        raise SystemExit('P0_PRISMA_METRICS_FLAG_OR_PAYMENT_MODELS_MISSING')
    if not lockfile_inputs['A1SubscriptionPaymentServerWorkspaceLink'] or not all(
        v['fileExists'] and v['referencedByLock'] for v in lockfile_inputs['A1CriticalPatches'].values()):
        raise SystemExit('P0_MAIN_LOCK_PATCHES_OR_PAYMENT_WORKSPACE_MISSING')

if __name__=='__main__':main()
