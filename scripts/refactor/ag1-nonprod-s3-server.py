#!/usr/bin/env python3
"""Start only the locally built MinIO binary. Run via OneShot job_start, never nohup."""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path('/Users/asmtv1/Desktop/gafus-refactor')
BASE = ROOT / '.local-pg-scratch/nonprod-s3'
CREDS = BASE / 'credentials.json'
BIN = BASE / 'bin/minio'
DATA = BASE / 'data'
LOG = BASE / 'minio-runtime.private.log'


def stop(reason: str) -> None:
    print('ISOLATED_NONPROD_S3_STARTUP_DENIED:' + reason, file=sys.stderr)
    sys.exit(23)


if Path.cwd().resolve() != ROOT or ROOT.resolve() != ROOT:
    stop('project_root')
if subprocess.run(['git', '-C', str(ROOT), 'rev-parse', '--show-toplevel'],
                  capture_output=True, text=True, timeout=5).stdout.strip() != str(ROOT):
    stop('git_root')
if subprocess.run(['git', '-C', str(ROOT), 'branch', '--show-current'],
                  capture_output=True, text=True, timeout=5).stdout.strip() != 'vite':
    stop('branch')
for path, mode in ((BASE, 0o700), (DATA, 0o700), (CREDS, 0o600)):
    if not path.exists() or path.is_symlink() or path.resolve() != path:
        stop('private_paths')
    if (path.stat().st_mode & 0o777) != mode or path.stat().st_uid != os.getuid():
        stop('private_modes')
if not BIN.is_file() or BIN.is_symlink() or BIN.resolve() != BIN or not os.access(BIN, os.X_OK):
    stop('local_binary')
# Do not reuse another actor's bound endpoint, or pick a different port.
try:
    for port in (9000, 9001):
        result = subprocess.run(['/usr/sbin/lsof', '-nP', f'-iTCP:{port}', '-sTCP:LISTEN'],
                                capture_output=True, timeout=5)
        if result.returncode == 0:
            stop('port_occupied')
    secrets = json.loads(CREDS.read_text())
    if set(secrets) != {'accessKeyId', 'secretAccessKey'}:
        stop('credentials_format')
    for key, length in (('accessKeyId', 32), ('secretAccessKey', 64)):
        val = secrets[key]
        if not isinstance(val, str) or len(val) != length or any(ch not in '0123456789abcdef' for ch in val):
            stop('credentials_format')
except (OSError, ValueError, KeyError, subprocess.TimeoutExpired):
    stop('runtime_preflight')
# Logs may contain MinIO startup diagnostics: private file, never ChatGPT output.
fd = os.open(LOG, os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
if os.fstat(fd).st_mode & 0o777 != 0o600:
    stop('private_log_mode')
os.dup2(fd, 1)
os.dup2(fd, 2)
os.close(fd)
env = {
    'PATH': '/usr/bin:/bin', 'HOME': str(BASE), 'TMPDIR': str(BASE) + '/',
    'MINIO_ROOT_USER': secrets['accessKeyId'],
    'MINIO_ROOT_PASSWORD': secrets['secretAccessKey'],
    'MINIO_BROWSER': 'off', 'MINIO_UPDATE': 'off',
}
os.execve(str(BIN), [str(BIN), 'server', '--address', '127.0.0.1:9000',
                       '--console-address', '127.0.0.1:9001', str(DATA)], env)
