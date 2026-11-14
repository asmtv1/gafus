#!/usr/bin/env python3
"""Static read-only checks for the four-commit A2 integration handoff."""
import hashlib
import json
import subprocess
import unittest
from pathlib import Path

A2=Path('/Users/asmtv1/Desktop/gafus-agent2-observability')
REPORT=A2/'docs/audit/gafus-a2-four-commits-transfer-preflight-20261112.json'
EXPECTED=[
 '751a435ec5096211b4325d80821cdfff271edd8d',
 'b05ca9c4e1c767fd4f10ea55531048f434a52527',
 'fbd89d62a977726828d4df132db5a848cb96c851',
 'bd93aef2234e228191c1e112655d0c5c1b2a711e',
]
BASE='0dcd18c13c8d567d543d1981b18d3caa52b16503'


def git(*args):
    return subprocess.run(['git','-C',str(A2),*args],capture_output=True,check=True).stdout


class FourCommittedA2(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.r=json.loads(REPORT.read_text())

    def test_linear_four_commits_exact_parents_and_HEAD(self):
        x=self.r
        self.assertEqual(x['schema'],'gafus/a2-four-commits-transfer-plan/v1')
        self.assertEqual(x['commitCount'],4)
        self.assertEqual(x['A2Head'],EXPECTED[-1])
        self.assertEqual(x['A2Base'],BASE)
        self.assertEqual(git('rev-parse','HEAD').decode().strip(),EXPECTED[-1])
        for i,c in enumerate(x['commits']):
            self.assertEqual(c['sha'],EXPECTED[i])
            self.assertEqual(c['parent'],BASE if i==0 else EXPECTED[i-1])
            self.assertEqual(git('rev-parse',c['sha']+'^').decode().strip(),c['parent'])

    def test_all_56_hunks_and_39_unique_paths_accounted(self):
        x=self.r
        self.assertEqual(x['perCommitDiffCount'],56)
        self.assertEqual(x['uniquePathCount'],39)
        self.assertEqual([c['changeCount'] for c in x['commits']],[23,20,11,2])
        collected={}
        for c in x['commits']:
            for f in c['files']:
                collected.setdefault(f['path'],0)
                collected[f['path']]+=1
                self.assertEqual(len(f['A2AfterThisCommitSha256']),64)
                self.assertTrue(f['riskCategory'])
                self.assertTrue(f['resolutionRule'])
        self.assertEqual(set(collected),{p['path'] for p in x['uniquePaths']})
        self.assertEqual(len(collected),39)
        for f in x['uniquePaths']:
            self.assertEqual(len(f['commitIndices']),collected[f['path']])
            self.assertEqual(len(f['A2FinalSha256']),64)

    def test_p0_and_a3_coverage(self):
        x=self.r
        self.assertEqual(x['A3Final39Overlap'],[])
        self.assertEqual(len(x['A2P0Paths']),6)
        self.assertEqual(set(x['A2P0Paths']),{
          'apps/api/src/lib/operation-observability.ts',
          'ci-cd/docker/prometheus/config.alloy',
          'ci-cd/docker/prometheus/gafus-alerts.yml',
          'packages/logger/src/serverTelemetry.ts',
          'packages/prisma/schema.prisma','pnpm-lock.yaml',
        })
        for p in x['uniquePaths']:
            self.assertFalse(p['A3Final39'])
            self.assertEqual(p['A2P0'],p['path'] in x['A2P0Paths'])
        self.assertFalse(x['A1FinalManifestPublished'])
        self.assertEqual(x['phase'],'PREPARED_NOT_APPROVED_NO_SOURCE_CHANGES')

    def test_readonly_patch_check_does_not_claim_clean_cherrypick(self):
        x=self.r
        self.assertEqual(len(x['dryRun']),4)
        for i,f in enumerate(x['dryRun']):
            self.assertEqual(f['sha'],EXPECTED[i])
            self.assertEqual(f['gitApplyCheckOnA1PathCopy'],'FAIL')
            self.assertGreater(f['stderrLineCount'],0)
            self.assertEqual(len(f['stderrSha256']),64)
        self.assertTrue(x['A1SourceSnapshotStableDuringPreflight'])
        for flag in ['noBranchCreated','noPatchApplied','noCommitsMade','noPushOrDeploy']:
            self.assertTrue(x[flag])

    def test_runbook_has_each_commit_and_reverse_rollback(self):
        text=(A2/'docs/audit/gafus-a2-four-commits-transfer-runbook-20261112.md').read_text()
        for sha in EXPECTED:self.assertIn(sha,text)
        for token in ['git cherry-pick --no-commit',
                      'git cherry-pick --abort','git reset --hard "$A1_FROZEN_BASE"',
                      'git revert --no-edit',
                      'git restore --source="$A1_FROZEN_BASE" --staged --worktree -- pnpm-lock.yaml',
                      'previewFeatures','pnpm install --lockfile-only --offline --ignore-scripts']:
            self.assertIn(token,text)

if __name__=='__main__':unittest.main()
