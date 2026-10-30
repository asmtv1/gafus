#!/usr/bin/env python3
"""Start only the existing isolated Refactor MinIO storage on loopback."""
import json
import os
from pathlib import Path
import socket
import subprocess

ROOT = Path('/Users/asmtv1/Desktop/gafus-refactor')
assert ROOT.resolve() == ROOT and not ROOT.is_symlink()
assert subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', '--show-toplevel'], text=True).strip() == str(ROOT)
assert subprocess.check_output(['git', '-C', str(ROOT), 'branch', '--show-current'], text=True).strip() == 'vite'
S3 = ROOT / '.local-pg-scratch/nonprod-s3'
for path in [S3, S3/'bin/minio', S3/'data', S3/'credentials.json']:
    assert path.exists() and not path.is_symlink() and path.resolve().is_relative_to(ROOT)
assert S3.joinpath('credentials.json').stat().st_mode & 0o077 == 0
for port in [9000, 9001]:
    with socket.socket() as s:
        s.settimeout(0.8)
        assert s.connect_ex(('127.0.0.1', port)) != 0, 'MINIO_PORT_ALREADY_OCCUPIED'
creds=json.loads((S3/'credentials.json').read_text())
assert set(creds) == {'accessKeyId','secretAccessKey'}
assert all(isinstance(x, str) and len(x)>=3 for x in creds.values())
env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','TMPDIR','LANG','USER')}
env.update({'MINIO_ROOT_USER':creds['accessKeyId'],'MINIO_ROOT_PASSWORD':creds['secretAccessKey'],
            'MINIO_BROWSER':'off','MINIO_PROMETHEUS_AUTH_TYPE':'public'})
print('REFRACTOR_ISOLATED_MINIO_STARTING port=9000 host=127.0.0.1',flush=True)
os.execve(str(S3/'bin/minio'), [str(S3/'bin/minio'), 'server', str(S3/'data'),
    '--address','127.0.0.1:9000','--console-address','127.0.0.1:9001'],env)
