#!/usr/bin/env python3
"""Safe, read-only external provider readiness. Never dispatches Jobs or purges media.

Run only from the exact Refactor root. Outputs statuses, never tokens/provider bodies.
Cloud.ru IAM credentials, if present, must live in a root-local private 0600
sandbox file. Existing production job names are explicitly rejected.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import stat
import subprocess
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path('/Users/asmtv1/Desktop/gafus-refactor')
BEGET_SERVICE = '96cd124e-767e-4af1-a568-c4d1f9b4e73f'
CLOUD_SANDBOX = ROOT / '.local-pg-scratch' / 'gallery-cloudru-sandbox.private.env'


def root_guard() -> None:
    if Path.cwd().resolve() != ROOT or ROOT.resolve() != ROOT or ROOT.is_symlink():
        raise ValueError('REFUSE_OUTSIDE_REFACTOR')
    for path in (ROOT / '.local-pg-scratch', ROOT / 'scripts/refactor'):
        if path.is_symlink() or path.resolve() != path:
            raise ValueError('REFUSE_LINK_ESCAPE')
    for cmd, expected in ((['git', '-C', str(ROOT), 'rev-parse', '--show-toplevel'], str(ROOT)),
                          (['git', '-C', str(ROOT), 'branch', '--show-current'], 'vite')):
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5, check=True)
        if result.stdout.strip() != expected:
            raise ValueError('REFUSE_WRONG_GIT_SCOPE')


def env_file(path: Path, private: bool = False) -> dict[str, str]:
    if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(ROOT):
        raise ValueError('SAFE_PROVIDER_ENV_MISSING')
    if private and (stat.S_IMODE(path.stat().st_mode) != 0o600 or path.stat().st_uid != os.getuid()):
        raise ValueError('SAFE_PROVIDER_ENV_PERMISSIONS')
    result: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        if re.fullmatch(r'[A-Z][A-Z0-9_]*', key):
            result[key] = value.strip().strip('"\'')
    return result


def fetch_json(url: str, *, data: dict | None = None, token: str | None = None) -> tuple[int, dict]:
    if not url.startswith(('https://api.beget.com/v1/cloud/', 'https://iam.api.cloud.ru/api/v1/auth/token')):
        raise ValueError('REFUSE_UNEXPECTED_PROVIDER_HOST')
    headers = {'Accept': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if data is not None:
        headers['Content-Type'] = 'application/json'
    request = Request(url, method='POST' if data is not None else 'GET',
                      headers=headers, data=json.dumps(data).encode() if data is not None else None)
    with urlopen(request, timeout=14) as response:
        body = response.read(250_000)
        parsed = json.loads(body)
        return response.status, parsed if isinstance(parsed, dict) else {}


def beget_readiness() -> bool:
    token = env_file(ROOT / '.env').get('BEGET_CDN_API_TOKEN', '')
    if len(token) < 24:
        print('BEGET_GALLERY=BLOCKED_MISSING_API_TOKEN')
        return False
    status, body = fetch_json('https://api.beget.com/v1/cloud/' + BEGET_SERVICE, token=token)
    service = body.get('service') or {}
    cdn = service.get('cdn') or {}
    result = (status == 200 and service.get('id') == BEGET_SERVICE and
              service.get('status') == 'RUNNING' and isinstance(cdn.get('source_domain'), dict))
    print('BEGET_GALLERY=' + ('LIVE_SERVICE_READY' if result else 'LIVE_SERVICE_UNEXPECTED'))
    print('BEGET_GALLERY_CACHING_SECONDS=' + str((cdn.get('settings') or {}).get('caching_time', 'unknown'))[:15])
    print('BEGET_GALLERY_EVICTION=NOT_PROVEN_WITHOUT_AN_OWNED_CACHED_TEST_OBJECT')
    return result


def cloudru_readiness() -> bool:
    if not CLOUD_SANDBOX.exists():
        print('CLOUDRU_GALLERY=BLOCKED_NO_ISOLATED_PROVIDER_CREDENTIALS')
        return False
    env = env_file(CLOUD_SANDBOX, private=True)
    project = env.get('CLOUDRU_PROJECT_ID', '')
    job = env.get('CLOUDRU_GALLERY_ISOLATED_JOB', '')
    if (env.get('GAFUS_REFACTOR_CLOUDRU_SANDBOX') != 'true' or
        not re.fullmatch(r'[0-9a-f-]{32,40}', project) or
        not re.fullmatch(r'gafus-refactor-gallery-[a-z0-9-]{3,60}', job) or
        len(env.get('CLOUDRU_KEY_ID', '')) < 10 or
        len(env.get('CLOUDRU_KEY_SECRET', '')) < 16):
        print('CLOUDRU_GALLERY=BLOCKED_UNVERIFIED_SANDBOX_SCOPE')
        return False
    status, body = fetch_json('https://iam.api.cloud.ru/api/v1/auth/token',
                              data={'keyId': env['CLOUDRU_KEY_ID'], 'secret': env['CLOUDRU_KEY_SECRET']})
    ok = status == 200 and isinstance(body.get('access_token'), str) and len(body['access_token']) >= 24
    print('CLOUDRU_IAM=' + ('LIVE_TOKEN_GRANTED' if ok else 'LIVE_TOKEN_FAILED'))
    print('CLOUDRU_JOB_EXECUTION=NOT_RUN_IAM_AUTH_ALONE_DOES_NOT_PROVE_DELIVERY')
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--provider', choices=('beget', 'cloudru', 'both'), default='both')
    args = parser.parse_args()
    try:
        root_guard()
        checks = []
        if args.provider in ('beget', 'both'):
            checks.append(beget_readiness())
        if args.provider in ('cloudru', 'both'):
            checks.append(cloudru_readiness())
        return 0 if all(checks) else 2
    except (ValueError, OSError, HTTPError, URLError, TimeoutError, subprocess.SubprocessError, json.JSONDecodeError) as error:
        # Never render provider bodies, URLs with auth, env values or raw exceptions.
        print('PROVIDER_READINESS=UNAVAILABLE_' + type(error).__name__)
        return 3


if __name__ == '__main__':
    raise SystemExit(main())
