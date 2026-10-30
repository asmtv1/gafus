#!/usr/bin/env python3
"""Run only the isolated GAFUS Refactor Chat 2.0 manual-test stack.

Uses the EXISTING restricted Refactor WORK snapshot and JWT signer of local
Hono 3001, without restarting it, touching GAFUS Main or contacting production.
Never prints JWTs, database URLs, API keys or private object keys.
"""
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
from urllib.parse import urlparse, unquote
from urllib.request import urlopen

ROOT = Path('/Users/asmtv1/Desktop/gafus-refactor')
POSTGRES_DIR = ROOT / '.local-pg-scratch/production_snapshot_20261024/data'
SECRETS = ROOT / '.local-pg-scratch/chat2-realtime-secrets.json'
CENTRIFUGO = ROOT / '.local-pg-scratch/chat2-bin/centrifugo'
CONFIG = ROOT / '.local-pg-scratch/chat2-runtime.json'
children = []

def ensure(condition, code):
    if not condition:
        raise RuntimeError(code)

def read_local_api_env():
    process = subprocess.run(['lsof', '-nP', '-tiTCP:3001', '-sTCP:LISTEN'],
        text=True, capture_output=True, check=True)
    ids = [int(line) for line in process.stdout.splitlines() if line.isdigit()]
    ensure(len(ids) == 1, 'CHAT2_3001_PROCESS_NOT_UNIQUE')
    ps = subprocess.run(['ps', 'eww', '-p', str(ids[0]), '-o', 'command='],
        text=True, capture_output=True, check=True).stdout
    ensure(str(ROOT) in ps and 'src/index.ts' in ps, 'CHAT2_3001_NOT_REFACTOR_HONO')
    fields = dict(re.findall(r'(?:^|\s)([A-Z][A-Z0-9_]*)=([^\s]+)', ps))
    db = urlparse(fields.get('DATABASE_URL', ''))
    redis = urlparse(fields.get('REDIS_URL', ''))
    ensure((db.scheme, db.hostname, db.port, db.path, db.username) ==
        ('postgresql', '127.0.0.1', 55921, '/gafus_refactor_real_work_20261024',
         'gafus_refactor_local_real'), 'CHAT2_WORK_DB_NOT_ISOLATED')
    ensure((redis.scheme, redis.hostname, redis.port, redis.path) ==
        ('redis', '127.0.0.1', 55927, '/1'), 'CHAT2_REDIS_NOT_ISOLATED')
    ensure(fields.get('NODE_ENV') == 'development' and
           fields.get('GAFUS_LOCAL_ISOLATED_API') == '1' and
           fields.get('API_HOST') == '127.0.0.1', 'CHAT2_ISOLATION_FLAGS_MISSING')
    ensure(fields.get('JWT_SECRET') and fields.get('JWT_REFRESH_SECRET'),
           'CHAT2_LOCAL_JWT_UNAVAILABLE')
    return fields

def healthy(url):
    try:
        with urlopen(url, timeout=1.5) as response:
            return response.status == 200
    except Exception:
        return False

def stop(*_):
    for child in reversed(children):
        if child.poll() is None:
            child.terminate()
    for child in reversed(children):
        try:
            child.wait(timeout=8)
        except subprocess.TimeoutExpired:
            child.kill()
    print('CHAT2_MANUAL_STACK_STOPPED', flush=True)
    sys.exit(0)

def main():
    ensure(ROOT.resolve() == ROOT and not ROOT.is_symlink(), 'CHAT2_PROJECT_ROOT_INVALID')
    git = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', '--show-toplevel'], text=True).strip()
    branch = subprocess.check_output(['git', '-C', str(ROOT), 'branch', '--show-current'], text=True).strip()
    ensure(git == str(ROOT) and branch == 'vite', 'CHAT2_WRONG_REFACTOR_BRANCH')
    for path in (POSTGRES_DIR, SECRETS, CENTRIFUGO, CONFIG):
        ensure(path.exists() and not path.is_symlink() and
               path.resolve().is_relative_to(ROOT), 'CHAT2_UNSAFE_RUNTIME_PATH')
    ensure(SECRETS.stat().st_mode & 0o077 == 0, 'CHAT2_SECRETS_NOT_PRIVATE')
    running = subprocess.check_output(['ps', 'ax', '-o', 'command='], text=True)
    ensure(f'postgres -D {POSTGRES_DIR} ' in running, 'CHAT2_POSTGRES_OUTSIDE_PROJECT')
    ensure(healthy('http://127.0.0.1:9000/minio/health/live'), 'CHAT2_LOCAL_MINIO_MISSING')
    ensure(not healthy('http://127.0.0.1:8039/health') and
           not healthy('http://127.0.0.1:3003/health'), 'CHAT2_DEV_PORT_IN_USE')
    source = read_local_api_env()
    # This exact LOCAL trainer fixture is the only assigned recipient in the
    # manual stack. Do not guess among users or select a production account.
    from shutil import which
    ensure(which('psql') is not None, 'CHAT2_LOCAL_POSTGRES_CLIENT_MISSING')
    db = urlparse(source['DATABASE_URL'])
    trainer_query = subprocess.run([
        'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1',
        '-p', '55921', '-U', db.username, '-d', db.path[1:],
        '-c', 'SELECT id FROM "User" WHERE username=\'trainer\' AND role=\'TRAINER\'',
    ], env={**os.environ, 'PGPASSWORD': unquote(db.password or '')},
        capture_output=True, text=True, timeout=10)
    trainer_ids = [v.strip() for v in trainer_query.stdout.splitlines() if v.strip()]
    ensure(trainer_query.returncode == 0 and len(trainer_ids) == 1 and
           bool(re.fullmatch(r'[A-Za-z0-9_-]{1,128}', trainer_ids[0])),
           'CHAT2_LOCAL_TRAINER_NOT_VERIFIED')
    secrets = json.loads(SECRETS.read_text())
    ensure(set(secrets) == {'jwt', 'api'} and len(secrets['jwt']) >= 32 and
           len(secrets['api']) >= 32, 'CHAT2_SECRETS_INVALID')
    # A strict allowlist prevents inheriting the unrelated application's
    # payments, mail, external storage, analytics or production credentials.
    safe_names = {'PATH', 'HOME', 'TMPDIR', 'USER', 'SHELL', 'LANG'}
    env = {k: v for k, v in os.environ.items() if k in safe_names}
    source_names = {
        'DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET',
        'GAFUS_LOCAL_BROWSER_AUTH', 'GAFUS_LOCAL_READONLY_CDN',
        'GAFUS_LOCAL_MEDIA_HTTP_ACCEPTANCE', 'GAFUS_ISOLATED_NONPROD_S3',
        'GAFUS_ISOLATED_S3_ENDPOINT', 'GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET',
        'GAFUS_ISOLATED_S3_QUESTIONS_BUCKET', 'GAFUS_ISOLATED_S3_GALLERY_BUCKET',
        'GAFUS_ISOLATED_S3_FEED_BUCKET',
        'CLOUDRU_MEDIA_JOBS_ENABLED', 'GALLERY_MEDIA_FALLBACK_ENABLED',
        'FEED_MEDIA_FALLBACK_ENABLED', 'CDN_HEALTH_MONITOR_ENABLED', 'APP_ENV',
    }
    env.update({k: v for k, v in source.items() if k in source_names})
    env.update({
        'API_HOST': '127.0.0.1', 'API_PORT': '3003', 'NODE_ENV': 'development',
        'GAFUS_LOCAL_ISOLATED_API': '1', 'GAFUS_CHAT2_LOCAL_MANUAL_TEST': '1',
        'CHAT2_API_ENABLED': 'enabled', 'CHAT2_WORKER_ENABLED': 'enabled',
        'CYNOLOGIST_CHAT_TRAINER_USER_ID': trainer_ids[0],
        'CHAT2_PRIVATE_MEDIA_ENABLED': 'isolated-dev-only',
        'CHAT2_CENTRIFUGO_TOKEN_SECRET': secrets['jwt'],
        'CHAT2_CENTRIFUGO_API_KEY': secrets['api'],
        'CHAT2_CENTRIFUGO_HTTP_API': 'http://127.0.0.1:8039/api/publish',
        'CHAT2_PUBLIC_WS_URL': 'ws://127.0.0.1:8039/connection/websocket',
    })
    ensure(env.get('GAFUS_ISOLATED_NONPROD_S3') == 'enabled' and
           env.get('GAFUS_ISOLATED_S3_ENDPOINT') == 'http://127.0.0.1:9000' and
           env.get('GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET') ==
           'gafus-refactor-documents-test' and
           env.get('CLOUDRU_MEDIA_JOBS_ENABLED') == 'false',
           'CHAT2_MEDIA_NOT_ISOLATED')
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    centrifugo_env = {
        **env,
        'CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY': secrets['jwt'],
        'CENTRIFUGO_CLIENT_TOKEN_ISSUER': 'gafus-chat2',
        'CENTRIFUGO_HTTP_API_KEY': secrets['api'],
    }
    commands = [
        ([str(CENTRIFUGO), '--config', str(CONFIG),
          '--http_server.address=127.0.0.1', '--http_server.port=8039',
          '--health.enabled'], ROOT, centrifugo_env),
        (['pnpm', 'exec', 'tsx', 'src/index.ts'], ROOT / 'apps/api', env),
        (['pnpm', 'exec', 'tsx', 'src/chat2-manual-worker.ts'], ROOT / 'packages/worker', env),
    ]
    for argv, cwd, child_env in commands:
        child = subprocess.Popen(argv, cwd=cwd, env=child_env)
        children.append(child)
    for _ in range(90):
        if any(child.poll() is not None for child in children):
            raise RuntimeError('CHAT2_MANUAL_SUBPROCESS_EXITED')
        if healthy('http://127.0.0.1:3003/health') and healthy('http://127.0.0.1:8039/health'):
            print('CHAT2_MANUAL_STACK_READY api=127.0.0.1:3003 realtime=127.0.0.1:8039', flush=True)
            break
        time.sleep(0.5)
    else:
        raise RuntimeError('CHAT2_MANUAL_STARTUP_TIMEOUT')
    while all(child.poll() is None for child in children):
        time.sleep(2)
    raise RuntimeError('CHAT2_MANUAL_COMPONENT_EXITED')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('CHAT2_MANUAL_START_FAILED', str(error).splitlines()[0][:160], flush=True)
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()
        sys.exit(1)
