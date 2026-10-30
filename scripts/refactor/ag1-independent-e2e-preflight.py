#!/usr/bin/env python3
"""Fail-closed, read-only ENTRY preflight for a separate GAFUS Refactor E2E agent.

Only exact allowed local project, its work PostgreSQL Unix socket and loopback
HTTP GETs. Never logs identities, credentials, response bodies or cookies.
Does NOT attest signed UI, writes, native devices, media providers, G3 or G4.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = Path('/Users/asmtv1/Desktop/gafus-refactor')
DB = 'gafus_refactor_real_work_20261024'
SOCKET = ROOT / '.local-pg-scratch/production_snapshot_20261024/s'
PSQL = Path('/opt/homebrew/opt/postgresql@18/bin/psql')
MIGRATION = '20261022153000_course_version_global_trigger'
MIGRATION_SQL = ROOT / 'packages/prisma/migrations' / MIGRATION / 'migration.sql'
COMPILED = ROOT / 'packages/core/dist/core/src/services/course/courseService.js'


def require(condition: bool, name: str, *, quiet: bool = False) -> None:
    if not condition:
        print('E2E_ENTRY_FAIL', name, flush=True)
        raise SystemExit(31)
    if not quiet:
        print('E2E_ENTRY_PASS', name, flush=True)


def safe_path(path: Path, want_file: bool = False) -> None:
    require(str(path).startswith(str(ROOT) + '/'), 'IN_PROJECT_PATH', quiet=True)
    for ancestor in [path, *list(path.parents)]:
        if ancestor == ROOT.parent:
            break
        require(not ancestor.is_symlink(), 'NO_ESCAPE_SYMLINK', quiet=True)
    require(path.is_file() if want_file else path.exists(), 'EXPECTED_PROJECT_PATH_EXISTS', quiet=True)


def git(*args: str) -> str:
    out = subprocess.run(['git', '-C', str(ROOT), *args], cwd=ROOT,
                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                         text=True, timeout=6, check=True)
    return out.stdout.strip()


def database_state() -> None:
    safe_path(SOCKET)
    require(PSQL.is_file() and not PSQL.is_symlink(), 'PINNED_PG18_BINARY')
    safe_path(MIGRATION_SQL, want_file=True)
    expected_hash = hashlib.sha256(MIGRATION_SQL.read_bytes()).hexdigest()
    sql = (
        'SELECT current_database(),'
        '(SELECT count(*) FROM "Course"),'
        '(SELECT count(*) FROM "Course" WHERE "version"<=0),'
        '(SELECT count(*) FROM pg_trigger WHERE tgname=\'Course_global_version_increment\' AND NOT tgisinternal),'
        '(SELECT count(*) FROM pg_constraint WHERE conname=\'Course_version_positive\'),'
        '(SELECT count(*) FROM "_prisma_migrations" WHERE migration_name=\'' + MIGRATION + '\' AND finished_at IS NOT NULL),'
        '(SELECT min(checksum) FROM "_prisma_migrations" WHERE migration_name=\'' + MIGRATION + '\' AND finished_at IS NOT NULL)'
    )
    env = {'PATH': '/opt/homebrew/bin:/usr/bin:/bin',
           'PGOPTIONS': '-c default_transaction_read_only=on -c statement_timeout=6000'}
    p = subprocess.run([str(PSQL), '-XAt', '-w', '-v', 'ON_ERROR_STOP=1',
                        '-h', str(SOCKET), '-p', '55921', '-U', 'asmtv1', '-d', DB,
                        '-c', sql], cwd=ROOT, env=env, text=True,
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10)
    require(p.returncode == 0, 'PHYSICAL_WORK_PG18_READ')
    fields = p.stdout.strip().split('|')
    require(len(fields) == 7 and fields[0] == DB, 'EXACT_NONPRODUCTION_WORK_DATABASE')
    require(all(x.isdecimal() for x in fields[1:6]), 'WORK_SCHEMA_NUMERIC_FACTS')
    require(int(fields[1]) >= 1 and fields[2:6] == ['0', '1', '1', '1'],
            'COURSE_VERSION_POSITIVE_TRIGGER_AND_MIGRATION_APPLIED')
    require(fields[6] == expected_hash, 'PRISMA_MIGRATION_RECORD_MATCHES_LOCAL_SQL')


def get_json(base: str, path: str) -> tuple[int, dict[str, object]]:
    require(base in ('http://127.0.0.1:3001', 'http://127.0.0.1:5173'),
            'ALLOWLISTED_LOOPBACK_ORIGIN', quiet=True)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    request = urllib.request.Request(base + path,
                                     headers={'Accept': 'application/json'}, method='GET')
    try:
        with opener.open(request, timeout=5) as response:
            status, raw = response.status, response.read(196608)
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read(196608)
    except (OSError, TimeoutError) as error:
        print('E2E_ENTRY_HTTP_UNAVAILABLE', base, path, type(error).__name__)
        raise SystemExit(32)
    try:
        data = json.loads(raw)
    except ValueError:
        print('E2E_ENTRY_INVALID_JSON', base, path)
        raise SystemExit(33)
    require(isinstance(data, dict), 'ORIGINAL_HTTP_JSON_ENVELOPE', quiet=True)
    return status, data


def main() -> None:
    require(len(sys.argv) == 1, 'NO_MUTATING_OPTIONS')
    require(Path.cwd().resolve() == ROOT and ROOT.resolve() == ROOT, 'EXACT_PHYSICAL_PROJECT_ROOT')
    for path in [ROOT / 'scripts', ROOT / 'scripts/refactor', ROOT / 'apps', ROOT / 'apps/api',
                 ROOT / 'apps/web-vite', ROOT / 'packages', ROOT / 'packages/core']:
        safe_path(path)
    require(git('rev-parse', '--show-toplevel') == str(ROOT), 'EXACT_GIT_ROOT')
    require(git('branch', '--show-current') == 'vite', 'EXPECTED_GIT_BRANCH_VITE')
    safe_path(COMPILED, want_file=True)
    js = COMPILED.read_text()
    require('favoritedBy: true' not in js and
            bool(re.search(r'favoritedBy:\s*\{\s*where:\s*\{\s*userId:\s*userId', js)) and
            'course.favoritedBy.filter((member) => !!userId && member.userId === userId)' in js and
            'isFavorite: favoriteCourseIds.has(course.id)' in js,
            'ORIGINAL_CORE_COMPILED_PERSONAL_FAVORITES_PRIVACY')
    database_state()
    hono, web = 'http://127.0.0.1:3001', 'http://127.0.0.1:5173'
    for endpoint in ('/health', '/ready'):
        status, body = get_json(hono, endpoint)
        require(status == 200 and body.get('status') in ('ok', 'ready'),
                'ORIGINAL_HONO_' + endpoint.strip('/').upper() + '_200')
    for path in ('/api/v1/auth/me', '/api/v1/courses', '/api/v1/pets', '/api/v1/user/profile'):
        status, _ = get_json(hono, path)
        require(status == 401, 'HONO_GUEST_PROTECTED_401_' + path.rsplit('/', 1)[-1].upper())
    for endpoint in ('/api/v1/auth/me', '/api/v1/courses'):
        status, _ = get_json(web, endpoint)
        require(status == 401, 'VITE_REAL_HONO_PROXY_GUEST_401_' + endpoint.rsplit('/', 1)[-1].upper())
    hono_status, hono_courses = get_json(hono, '/api/v1/public/courses')
    web_status, web_courses = get_json(web, '/api/v1/public/courses')
    require(hono_status == web_status == 200, 'ORIGINAL_PUBLIC_CATALOG_BOTH_HTTP_200')
    require(isinstance(hono_courses.get('data'), list) and len(hono_courses['data']) > 0,
            'REAL_NONEMPTY_PUBLIC_CATALOG')
    require(hono_courses == web_courses, 'VITE_PROXY_SAME_PUBLIC_DATA_AS_ORIGINAL_HONO')
    print('E2E_ENTRY_READY_READ_ONLY_BASELINE_ONLY', flush=True)
    print('E2E_SIGNED_BROWSER_OWNER_MEDIA_DEVICE_G3_G4_NOT_VERIFIED', flush=True)


if __name__ == '__main__':
    main()
