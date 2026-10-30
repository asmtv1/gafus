#!/usr/bin/env python3
"""Manage the *local-only* Refactor Questions V2 worker, no production resources."""
from pathlib import Path
import os, re, signal, subprocess, sys, time
from urllib.parse import urlsplit

ROOT=Path('/Users/asmtv1/Desktop/gafus-refactor')
SCRIPT='scripts/qa/questions-photo-v2-real-work-worker.mts'
STATE=ROOT/'.local-pg-scratch/questions-v2-local-20261029'
PIDFILE=STATE/'real-work-worker.pid'
LOG=STATE/'real-work-worker.log'
if Path.cwd().resolve()!=ROOT or len(sys.argv)!=2 or sys.argv[1] not in ('start','stop','status'):
    raise SystemExit('LOCAL_SCOPE_DENIED')

def running(pid):
    if not pid or pid<=1: return False
    try: os.kill(pid,0)
    except ProcessLookupError: return False
    proc=subprocess.run(['ps','-p',str(pid),'-o','command='],text=True,capture_output=True,timeout=5)
    return proc.returncode==0 and SCRIPT in proc.stdout

def existing():
    if not PIDFILE.exists(): return None
    try: pid=int(PIDFILE.read_text().strip())
    except ValueError: raise SystemExit('INVALID_LOCAL_WORKER_PIDFILE')
    return pid if running(pid) else None

if sys.argv[1]=='status':
    print('QUESTIONS_LOCAL_WORKER_RUNNING' if existing() else 'QUESTIONS_LOCAL_WORKER_NOT_RUNNING')
    raise SystemExit(0)
if sys.argv[1]=='stop':
    pid=existing()
    if not pid: raise SystemExit('NO_OWNED_WORKER_TO_STOP')
    os.killpg(pid,signal.SIGTERM)
    PIDFILE.unlink(missing_ok=True)
    print('QUESTIONS_LOCAL_WORKER_STOP_REQUESTED')
    raise SystemExit(0)

if existing():
    print('QUESTIONS_LOCAL_WORKER_ALREADY_RUNNING')
    raise SystemExit(0)
output=subprocess.run(['lsof','-nP','-tiTCP:3001','-sTCP:LISTEN'],capture_output=True,text=True,timeout=5)
if output.returncode!=0 or not output.stdout.strip().isdigit():
    raise SystemExit('LOCAL_API_3001_NOT_RUNNING')
proc=subprocess.run(['ps','eww','-p',output.stdout.strip(),'-o','command='],capture_output=True,text=True,timeout=5)
env=dict(re.findall(r'(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)=([^\s]+)',proc.stdout))
url=urlsplit(env.get('DATABASE_URL',''))
if (url.hostname!='127.0.0.1' or url.port!=55921 or
        url.path!='/gafus_refactor_real_work_20261024' or
        env.get('GAFUS_LOCAL_ISOLATED_API')!='1' or
        env.get('QUESTIONS_V2_MEDIA_ENABLED')!='true' or
        env.get('QUESTIONS_V2_S3_ENDPOINT')!='http://127.0.0.1:9000' or
        env.get('QUESTIONS_V2_S3_BUCKET')!='gafus-refactor-questions-test'):
    raise SystemExit('LOCAL_REAL_WORK_SAFETY_CHECK_FAILED')
STATE.mkdir(mode=0o700,parents=True,exist_ok=True)
os.chmod(STATE,0o700)
log_start=LOG.stat().st_size if LOG.exists() else 0
fd=os.open(LOG,os.O_WRONLY|os.O_CREAT|os.O_APPEND,0o600)
try:
    worker=subprocess.Popen(['/opt/homebrew/bin/pnpm','exec','tsx',SCRIPT],cwd=ROOT,
        env={**os.environ,**env},stdin=subprocess.DEVNULL,stdout=fd,stderr=subprocess.STDOUT,
        start_new_session=True)
finally: os.close(fd)
os.umask(0o077)
PIDFILE.write_text(str(worker.pid)+'\n')
for _ in range(30):
    if worker.poll() is not None: raise SystemExit('LOCAL_WORKER_FAILED_TO_START')
    # The startup log contains no credentials; it prints only local endpoints.
    with LOG.open('rb') as log:
        log.seek(log_start)
        new_log=log.read(200000)
    if b'QUESTIONS_REAL_WORK_WORKER_READY' in new_log:
        print('QUESTIONS_LOCAL_WORKER_STARTED')
        break
    time.sleep(.2)
else: raise SystemExit('LOCAL_WORKER_STARTUP_UNCONFIRMED')
