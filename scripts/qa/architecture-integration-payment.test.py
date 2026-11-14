#!/usr/bin/env python3
"""Read-only assertions on payment handoff, including P0 provenance and A3 links."""
from pathlib import Path
import csv
import hashlib
import json
import unittest

ROOT=Path(__file__).resolve().parents[2]
AUDIT=ROOT/'docs/audit'


class PaymentManifestTriage(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.info=json.loads((AUDIT/'gafus-agents-integration-payment-overlay-20261112.json').read_text())
        cls.triage=json.loads((AUDIT/'gafus-agents-integration-triage-20261112.json').read_text())

    def test_all_eighteen_after_sha_and_provenance(self):
        x=self.info
        self.assertEqual(x['fileCount'],18)
        self.assertEqual(x['statusCounts'],{'M':13,'A':4,'D':1})
        self.assertTrue(x['A1CurrentFilesMatchManifest'])
        self.assertTrue(all(f['afterShaVerified'] for f in x['files']))
        self.assertTrue(x['A1BeforeSHAFromAvailableBackupVerified'])
        self.assertEqual(len(x['missingBeforeBackupFiles']),3)
        self.assertEqual(sum(bool(f['beforeBackedUp']) for f in x['files']),11)
        self.assertTrue(x['noGitHistoryMutation'])
        self.assertEqual(x['A1RegistryStatus'],'PARTIAL_PAYMENT_GROUP_NOT_FINAL_ARCHITECTURE')
        self.assertEqual(len(set(f['path'] for f in x['files'])),18)

    def test_direct_a2_p0_and_final_a3_are_empty(self):
        x=self.info
        self.assertEqual(x['directA2P0Paths'],[])
        self.assertEqual(x['directA2CommittedPaths'],[])
        self.assertEqual(x['directA3FinalSetPaths'],[])
        self.assertEqual(x['A2P0Count'],6)
        self.assertEqual(x['A3FinalSetCount'],39)
        self.assertEqual(len(x['semanticCrossings']),8)
        self.assertEqual({p['relatedPath'] for p in x['semanticCrossings'] if p['priority']=='P0'},
            {'packages/prisma/schema.prisma','pnpm-lock.yaml',
            'apps/api/src/lib/operation-observability.ts','packages/logger/src/serverTelemetry.ts',
            'ci-cd/docker/prometheus/config.alloy','ci-cd/docker/prometheus/gafus-alerts.yml'})
        self.assertEqual(set(p['path'] for p in self.triage['a2Prioritized'] if p['priority']=='P0'),
            {p['relatedPath'] for p in x['semanticCrossings'] if p['priority']=='P0'})

    def test_schema_and_lockfile_cannot_be_replaced_by_a2_committed(self):
        p=self.info['P0SchemaAndLockVerifiedInputs']
        self.assertFalse(p['A1VsA2CommittedSchemaOnlyMetricsGeneratorFlag'])
        self.assertTrue(p['A1VsA2WorkingSchemaOnlyMetricsGeneratorFlag'])
        self.assertTrue(p['schemaRequiresManualA1BaselinePlusA2MetricsHunk'])
        self.assertIn('QuestionLegacyPhotoDeletion',p['A1OnlyModelsMissingInA2Committed'])
        self.assertEqual(len(p['A1OnlyOutboxFieldsMissingInA2Committed']),5)
        self.assertTrue(all(p['A1PaymentModelsPresent'].values()))
        self.assertFalse(p['lockfilesIdentical'])
        self.assertTrue(p['A1SubscriptionPaymentServerWorkspaceLink'])
        self.assertEqual(len(p['A1CriticalPatches']),3)
        self.assertTrue(all(v['fileExists'] and v['referencedByLock'] for v in p['A1CriticalPatches'].values()))

    def test_every_payment_file_has_addressed_minimal_tests_and_matrix_row(self):
        info=self.info
        with (AUDIT/'gafus-agents-integration-payment-overlay-20261112.tsv').open() as f:
            rows=list(csv.DictReader(f,delimiter='\t'))
        self.assertEqual(len(rows),18)
        self.assertEqual({r['path'] for r in rows},{r['path'] for r in info['files']})
        self.assertTrue(all(r['minimum_commands'] and r['source']=='A1/payment-manifest' or
                        r['source'].startswith('A1/payment-manifest') for r in rows))
        markdown=(AUDIT/'gafus-agents-integration-file-matrix-20261112.md').read_text()
        for row in rows:
            self.assertIn('`'+row['path']+'`',markdown)
        self.assertIn('previewFeatures',markdown)
        self.assertIn('QuestionLegacyPhotoDeletion',markdown)
        self.assertIn('pnpm-lock.yaml',markdown)


if __name__=='__main__':unittest.main()
