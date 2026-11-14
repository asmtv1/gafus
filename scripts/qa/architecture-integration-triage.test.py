#!/usr/bin/env python3
"""Synthetic regression for read-only integration classification, not a merge."""
import csv
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from unittest import mock

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
spec=importlib.util.spec_from_file_location('gafus_arch_triage',HERE/'architecture-integration-triage.py')
triage=importlib.util.module_from_spec(spec)
spec.loader.exec_module(triage)


class TriageRules(unittest.TestCase):
    def test_distinct_baseline_hunks_are_disjoint(self):
        base=['A\n','B\n','C\n','D\n']
        a1=triage.edits(base,['A\n','B NEW\n','C\n','D\n'])
        a3=triage.edits(base,['A\n','B\n','C\n','D NEW\n'])
        self.assertFalse(triage.overlaps(a1,a3))
        same=triage.edits(base,['A\n','B OTHER\n','C\n','D\n'])
        self.assertTrue(triage.overlaps(a1,same))
        insertion=triage.edits(base,['A\n','B NEW\n','C\n','D\n'])
        self.assertTrue(triage.overlaps(a1,insertion))

    def test_a3_final_file_already_present_in_a1_is_not_copied_from_stale_a3(self):
        path='packages/worker/tsconfig.json'
        current=b'{"paths":{"booking-application":true}}'
        stale=b'{"paths":{}}'
        base=b'{"paths":{"old":true}}'
        def read(root,name):
            self.assertEqual(name,path)
            return current if root==triage.A1 else stale
        with mock.patch.object(triage,'bytes_at',side_effect=read),mock.patch.object(triage,'base_at',return_value=base):
            x=triage.classify_path(path,'different-content',{path:'shared'},
                {path:hashlib.sha256(current).hexdigest()})
        self.assertEqual(x['classification'],'AUTO_REUSE_A1_VERIFIED_A3_FINAL_HUNK')
        self.assertEqual(x['preferredSource'],'A1-with-verified-A3-final-file')
        self.assertTrue(x['A3ManifestSHAEqualToCommonTreeA1'])
        self.assertFalse(x['A3ManifestSHAEqualToA3Worktree'])

    def test_do_not_recreate_deleted_core_facade_from_old_agent3(self):
        path='packages/core/src/services/consultation/slotService.ts'
        def read(root,name):return None if root==triage.A1 else b'old core facade'
        with mock.patch.object(triage,'bytes_at',side_effect=read),mock.patch.object(triage,'base_at',return_value=b'old core facade'):
            x=triage.classify_path(path,'delete-vs-present',{}, {})
        self.assertEqual(x['classification'],'MANUAL_DELETE_VS_PRESENT')
        self.assertEqual(x['preferredSource'],'A1-deletion-with-port-verification')
        self.assertIn('core-boundaries',x['requiredVerification'])

    def test_current_full_matrix_matches_snapshot_and_preserves_all_a2_priorities(self):
        p=ROOT/'docs/audit/gafus-agents-integration-triage-20261112.json'
        x=json.loads(p.read_text())
        self.assertTrue(x['sourceSnapshotConsistentWithInventory'])
        self.assertEqual(x['counts']['differentContent'],len(x['differentFiles']))
        self.assertEqual(x['counts']['deleteVsPresent'],len(x['deleteVsPresent']))
        self.assertEqual(len(x['a2Prioritized']),16)
        self.assertEqual(sum(f['classification']=='AUTO_REUSE_A1_VERIFIED_A3_FINAL_HUNK' for f in x['differentFiles']),4)
        self.assertTrue(all(f['requiredVerification'] and f['preferredSource'] for f in x['differentFiles']+x['deleteVsPresent']))
        tsv=ROOT/'docs/audit/gafus-agents-integration-file-matrix-20261112.tsv'
        with tsv.open() as f:
            rows=list(csv.DictReader(f,delimiter='\t'))
        self.assertEqual(len(rows),len(x['differentFiles'])+len(x['deleteVsPresent']))
        self.assertEqual({f['path'] for f in rows},
            {f['path'] for f in x['differentFiles']+x['deleteVsPresent']})


if __name__=='__main__': unittest.main()
