#!/usr/bin/env python3
"""Generate an auditable PRELIMINARY source pin policy. No Git/history edits.

Output is stored as untracked audit evidence in the Agent2 worktree only.
It explicitly DENIES integration until A1 final architecture registry and an
approved candidate lockfile fingerprint are added in a separate review.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

ROOT=Path('/Users/asmtv1/Desktop')
A1=ROOT/'gafus-refactor'
A2=ROOT/'gafus-agent2-observability'
POLICY=A2/'docs/audit/gafus-agents-integration-preflight-policy-20261112.json'
PAY=A1/'docs/audit/gafus-agent-1-to-agent-2-payment-composition-20261112.json'
A3=A1/'docs/audit/gafus-agent-3-final-local-handoff-20261112.json'


def sha(b:bytes)->str: return hashlib.sha256(b).hexdigest()
def rel_sha(root:Path,name:str)->str: return sha((root/name).read_bytes())
def committed(name:str)->bytes:
    return subprocess.run(['git','-C',str(A2),'show',f'HEAD:{name}'],check=True,capture_output=True).stdout


def main():
    pay=json.loads(PAY.read_text());a3=json.loads(A3.read_text())
    p0=['apps/api/src/lib/operation-observability.ts',
        'packages/logger/src/serverTelemetry.ts',
        'ci-cd/docker/prometheus/config.alloy',
        'ci-cd/docker/prometheus/gafus-alerts.yml',
        'packages/prisma/schema.prisma','pnpm-lock.yaml']
    source_schema=(A1/'packages/prisma/schema.prisma').read_text()
    assert 'previewFeatures = ["metrics"]' not in source_schema
    assert len(pay['files'])==18 and len(a3['files'])==39
    require_model=['AppSubscription','AppSubscriptionPayment','AppSubscriptionPromoCode',
                   'AppSubscriptionEvent','AppSubscriptionFinanceRefund',
                   'QuestionLegacyPhotoDeletion','Chat2OutboxEvent']
    assert all('model '+model+' {' in source_schema for model in require_model)
    policy={
      'kind':'gafus/integration-preflight-policy/v1',
      'sourceRoots':{'agent1':str(A1),'agent2':str(A2),'agent3':str(ROOT/'gafus-agent3-worker')},
      'pinnedSourceManifests':{
        'payment':{'path':str(PAY),'sha256':rel_sha(A1,str(PAY.relative_to(A1))),
                   'expectedKind':'gafus-agent-1-to-agent-2-handoff/v1','expectedCount':18},
        'agent3':{'path':str(A3),'sha256':rel_sha(A1,str(A3.relative_to(A1))),
                  'expectedSchema':'gafus/agent3-final-local-handoff/v1','expectedCount':39},
      },
      'p0':{
        'requiredPaths':p0,
        # Approve any non-identical reconciled file digest *after* manual review.
        'integratedContentApprovedSha256':{path:[sha(committed(path))]
            for path in p0 if path not in ('packages/prisma/schema.prisma','pnpm-lock.yaml')},
        'agent2CommittedSha256':{path:sha(committed(path)) for path in p0},
      },
      'schema':{
        'path':'packages/prisma/schema.prisma',
        'baselineA1WithoutMetricsSha256':sha(source_schema.encode()),
        'requiredFeature':'metrics',
        'requiredModels':require_model,
        'requiredChat2OutboxFields':['claimToken','operationId','traceId','lastErrorCode','deadLetteredAt'],
        'requiredChat2OutboxIndex':'@@index([deadLetteredAt, deliveredAt, createdAt])',
      },
      'lockfile':{
        'path':'pnpm-lock.yaml',
        'knownStaleSha256':sorted(set([sha(committed('pnpm-lock.yaml')), rel_sha(A2,'pnpm-lock.yaml')])),
        # Pre-integration snapshot only. Must reapprove if package manifests evolve.
        'approvedCandidateSha256':[],
        'observedA1SnapshotSha256':rel_sha(A1,'pnpm-lock.yaml'),
        'requiredImporters':['.','apps/api','apps/mobile','packages/worker',
                             'packages/subscription-payment-server'],
        'requirePaymentWorkspaceConsumers':['apps/api','packages/worker'],
        'requiredPatches':{
          patch:{'sha256':rel_sha(A1,patch),
                 'lockKey':next(k for k in ['expo-modules-core@55.0.27',
                    'react-native-reanimated@4.2.1','react-native-compressor@1.16.0'] if k in patch)}
          for patch in ['patches/expo-modules-core@55.0.27.patch',
                         'patches/react-native-reanimated@4.2.1.patch',
                         'patches/react-native-compressor@1.16.0.patch']},
      },
      'finalArchitecture':{
        'manifestPath':None,
        'approvedManifestSha256':None,
        'required':True,
        'note':'BLOCKED: final A1 registry not delivered; never auto-fill from a partial payment manifest or 33-gate TSV',
      },
      'readyForIntegration':False,
      'rule':'Only after FINAL A1 registry, approved refreshed source+candidate lock SHA, and all checks PASS',
    }
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=POLICY,
        help='Write to NEW policy path only. Never overwrite pinned evidence.')
    args=parser.parse_args()
    output=args.output.expanduser().resolve()
    if not output.is_relative_to(A2/'docs/audit'):
        raise SystemExit('REFUSE_POLICY_OUTPUT_OUTSIDE_A2_AUDIT')
    if output.exists():
        raise SystemExit('REFUSE_OVERWRITE_PINNED_POLICY: choose an explicit new --output filename')
    output.write_text(json.dumps(policy,ensure_ascii=False,indent=2)+'\n')
    print('PIN_POLICY_PREPARED_ONLY',output)
    print('SOURCE_SHA', {k:v['sha256'] for k,v in policy['pinnedSourceManifests'].items()})
    print('A1_LOCK',policy['lockfile']['observedA1SnapshotSha256'],
          'A2_STALE',policy['lockfile']['knownStaleSha256'][0])
    print('FINAL_A1_REGISTRY_PENDING_AND_CANDIDATE_LOCK_NOT_APPROVED')

if __name__=='__main__':main()
