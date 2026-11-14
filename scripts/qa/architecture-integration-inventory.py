#!/usr/bin/env python3
"""Read-only source inventory for Agents 1/2/3. No Git mutation / patch application.

Explicitly ignores dirty side effects by recording paths and digests, never source
contents. Re-running creates only local untracked handoff evidence files.
"""
from __future__ import annotations
import collections
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path('/Users/asmtv1/Desktop')
TREE = {'agent1': ROOT / 'gafus-refactor', 'agent2': ROOT / 'gafus-agent2-observability',
        'agent3': ROOT / 'gafus-agent3-worker'}
OUT = TREE['agent2'] / 'docs/audit/gafus-agents-integration-inventory-20261112.json'


def git(owner: str, *args: str) -> str:
    p = subprocess.run(['git', '-C', str(TREE[owner]), *args], stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE, check=True)
    return p.stdout.decode('utf-8', 'surrogateescape')


def paths(owner: str, *args: str) -> set[str]:
    return set(git(owner, *args).rstrip('\0').split('\0')) - {''}


def source(owner: str, name: str) -> str:
    p = TREE[owner] / name
    if p.is_symlink():
        return 'symlink:' + hashlib.sha256(os.readlink(p).encode()).hexdigest()
    if not p.is_file():
        return 'deleted'
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        while b := f.read(1 << 20):
            h.update(b)
    return h.hexdigest()


def desc(owner: str) -> dict:
    tracked = paths(owner, 'diff', '--name-only', '-z', 'HEAD')
    new = paths(owner, 'ls-files', '--others', '--exclude-standard', '-z')
    staged = paths(owner, 'diff', '--cached', '--name-only', '-z')
    return {
        'branch': git(owner, 'symbolic-ref', '--short', '-q', 'HEAD').strip(),
        'head': git(owner, 'rev-parse', 'HEAD').strip(),
        'trackedPaths': len(tracked), 'untrackedPaths': len(new),
        'stagedPaths': len(staged),
        'trackedPathList': sorted(tracked), 'untrackedPathList': sorted(new),
        'stagedPathList': sorted(staged),
        'shortStat': git(owner, 'diff', '--shortstat', 'HEAD').strip(),
        'trackedDeletedPaths': sorted(paths(owner, 'diff', '--name-only', '-z', '--diff-filter=D', 'HEAD')),
        'allDirtyPaths': sorted(tracked | new | staged),
    }


def count_group(items: set[str]) -> dict:
    return dict(sorted(collections.Counter(x.split('/')[0] for x in items).items()))


def main() -> None:
    result = {
        'schemaVersion': 1,
        'observedAtUTC': dt.datetime.now(dt.timezone.utc).isoformat(),
        'sourceRoots': {k: str(v) for k, v in TREE.items()},
        'sourceSnapshotIsMutable': True,
        'noGitHistoryModified': True,
        'agents': {owner: desc(owner) for owner in TREE},
    }
    a1 = set(result['agents']['agent1']['allDirtyPaths'])
    a3 = set(result['agents']['agent3']['allDirtyPaths'])
    a2_committed = paths('agent2', 'diff', '--name-only', '-z',
                         result['agents']['agent1']['head'] + '..' +
                         result['agents']['agent2']['head'])
    a2_local = set(result['agents']['agent2']['allDirtyPaths'])
    both = a1 & a3
    identical = set()
    divergent = set()
    both_deleted = set()
    asymmetric_deletion = set()
    divergent_fingerprints = {}
    for name in both:
        h1 = source('agent1', name)
        h3 = source('agent3', name)
        if h1 == 'deleted' and h3 == 'deleted':
            both_deleted.add(name)
        elif h1 == 'deleted' or h3 == 'deleted':
            asymmetric_deletion.add(name)
            divergent_fingerprints[name] = {'agent1': h1, 'agent3': h3}
        elif h1 == h3:
            identical.add(name)
        else:
            divergent.add(name)
            divergent_fingerprints[name] = {'agent1': h1, 'agent3': h3}
    a2_a1 = a2_committed & a1
    a2_a3 = a2_committed & a3
    a2_dirty = a2_committed & a2_local
    result['agent2CommitCountOverBase'] = int(git('agent2', 'rev-list', '--count',
           result['agents']['agent1']['head'] + '..' + result['agents']['agent2']['head']).strip())
    result['agent3CommitCountOverBase'] = int(git('agent3', 'rev-list', '--count',
           result['agents']['agent1']['head'] + '..' + result['agents']['agent3']['head']).strip())
    result['agent2CommittedDiffPaths'] = sorted(a2_committed)
    result['overlap'] = {
        'agent1AndAgent3Paths': len(both),
        'identicalFileContent': len(identical),
        'differentFileContent': len(divergent),
        'bothDeletedPaths': len(both_deleted),
        'asymmetricDeleteVsPresentPaths': len(asymmetric_deletion),
        'agent1OnlyDirty': len(a1 - a3),
        'agent3OnlyDirty': len(a3 - a1),
        'agent2CommittedAndAgent1Dirty': len(a2_a1),
        'agent2CommittedAndAgent3Dirty': len(a2_a3),
        'agent2CommittedAndOwnDirty': len(a2_dirty),
        'tripleChangedPathCount': len(a2_a1 & a3),
        'groupCounts': {
           'agent1Dirty': count_group(a1),
           'agent3Dirty': count_group(a3),
           'agent2Committed': count_group(a2_committed),
           'identical': count_group(identical),
           'divergent': count_group(divergent),
        },
        'identicalPaths': sorted(identical),
        'divergentPaths': sorted(divergent),
        'bothDeletedPathsList': sorted(both_deleted),
        'asymmetricDeletionPaths': sorted(asymmetric_deletion),
        'agent1OnlyPaths': sorted(a1 - a3),
        'agent3OnlyPaths': sorted(a3 - a1),
        'agent2VsAgent1Paths': sorted(a2_a1),
        'agent2VsAgent3Paths': sorted(a2_a3),
        'agent2VsOwnOverlayPaths': sorted(a2_dirty),
        'triplePaths': sorted(a2_a1 & a3),
        'divergentContentSha256': divergent_fingerprints,
        'agent2CrossSourceSha256': {name: {owner: source(owner, name) for owner in TREE}
            for name in sorted(a2_a1 | a2_a3)},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({
      'utc': result['observedAtUTC'],
      'agents': {k: {field: v[field] for field in
                    ('branch','head','trackedPaths','untrackedPaths','stagedPaths')}
                 for k,v in result['agents'].items()},
      'commitsSinceBase': {'agent2': result['agent2CommitCountOverBase'],
                           'agent3': result['agent3CommitCountOverBase']},
      'summary': {k:v for k,v in result['overlap'].items() if isinstance(v,int)},
      'triplePaths': result['overlap']['triplePaths'],
      'report': str(OUT),
    },ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
