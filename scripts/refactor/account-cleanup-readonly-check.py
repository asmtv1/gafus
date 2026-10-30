#!/usr/bin/env python3
"""Fail-closed read-only account erasure queue inspection for the exact Refactor WORK DB.

No owner IDs, URLs, S3 keys, secrets, or per-user details are ever printed.
Never modifies PostgreSQL, S3, CDN, or any other provider.
"""
from __future__ import annotations

import os
import re
import stat
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path('/Users/asmtv1/Desktop/gafus-refactor')
CREDS = ROOT / '.local-pg-scratch/production_snapshot_20261024/app.env'
PSQL = '/opt/homebrew/opt/postgresql@18/bin/psql'


def die(reason: str) -> None:
    raise SystemExit('ACCOUNT_CLEANUP_READ_ONLY_DENIED_' + reason)


def main() -> None:
    if Path.cwd().resolve() != ROOT or ROOT.is_symlink() or ROOT.resolve() != ROOT:
        die('PROJECT_ROOT')
    for cmd in (['git', '-C', str(ROOT), 'rev-parse', '--show-toplevel'],
                ['git', '-C', str(ROOT), 'branch', '--show-current']):
        value = subprocess.run(cmd, capture_output=True, text=True, timeout=4, check=True).stdout.strip()
        if value != (str(ROOT) if 'rev-parse' in cmd else 'vite'):
            die('GIT_IDENTITY')
    if CREDS.is_symlink() or not CREDS.is_file() or not str(CREDS.resolve()).startswith(str(ROOT) + '/'):
        die('CREDENTIAL_PATH')
    if (CREDS.stat().st_mode & 0o777) != (stat.S_IRUSR | stat.S_IWUSR):
        die('CREDENTIAL_PERMISSIONS')
    line = CREDS.read_text().strip()
    if not line.startswith('DATABASE_URL=') or '\n' in line:
        die('CREDENTIAL_FORMAT')
    value = line.split('=', 1)[1].strip('"\'')
    url = urlsplit(value)
    if (url.scheme, url.hostname, url.port, url.username, url.path, parse_qs(url.query)) != (
        'postgresql', '127.0.0.1', 55921, 'gafus_refactor_local_real',
        '/gafus_refactor_real_work_20261024', {'schema': ['public']}
    ) or not url.password or url.fragment:
        die('DATABASE_IDENTITY')
    env = {
        'PATH': '/opt/homebrew/bin:/usr/bin:/bin',
        'PGHOST': '127.0.0.1', 'PGPORT': '55921',
        'PGUSER': 'gafus_refactor_local_real', 'PGDATABASE': url.path[1:],
        'PGPASSWORD': url.password, 'PGCONNECT_TIMEOUT': '3',
    }
    # Literal, static SQL only. Explicit READ ONLY protects against writes if
    # this diagnostic is ever extended. Never read row keys or owner identifiers.
    sql = '''BEGIN TRANSACTION READ ONLY;
SELECT 'identity',current_user,current_database();
SELECT 'scope',"scope","status",COALESCE("errorCode",'none'),COUNT(*)::text
 FROM "AccountStorageCleanup" GROUP BY "scope","status","errorCode"
 ORDER BY "scope","status","errorCode";
SELECT 'unfinished',COUNT(*)::text FROM "AccountStorageCleanup" WHERE "status" <> 'done';
SELECT 'orphaned_unfinished',COUNT(*)::text FROM "AccountStorageCleanup" c
 WHERE c."status" <> 'done' AND NOT EXISTS
 (SELECT 1 FROM "User" u WHERE u."id"=c."ownerId");
COMMIT;'''
    try:
        proc = subprocess.run([PSQL, '-XAt', '-w', '-v', 'ON_ERROR_STOP=1', '-c', sql],
                              env=env, capture_output=True, text=True, timeout=8)
    except (OSError, subprocess.TimeoutExpired):
        die('SQL_UNAVAILABLE')
    lines = proc.stdout.splitlines()
    if proc.returncode or (
        'identity|gafus_refactor_local_real|gafus_refactor_real_work_20261024'
    ) not in lines:
        die('SQL_IDENTITY')
    for row in lines[1:]:
        if not row.startswith(('scope|', 'unfinished|', 'orphaned_unfinished|')):
            continue
        # Values are only grouped labels/counts; validate before emitting.
        if not re.fullmatch(r'[A-Za-z0-9_|-]{1,180}', row):
            die('SQL_UNEXPECTED_OUTPUT')
        print(row)
    print('LOCAL_WORK_ACCOUNT_CLEANUP_READ_ONLY_COMPLETE')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, subprocess.CalledProcessError, OSError):
        die('PREFLIGHT_UNAVAILABLE')
