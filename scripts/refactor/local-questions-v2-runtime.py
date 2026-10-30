#!/usr/bin/env python3
"""Restore Questions V2 only on isolated WORK PostgreSQL + localhost MinIO.

Reads local MinIO credentials from private ignored file. Secrets are never
printed, written into source or git, nor put in command-line arguments.
"""
import json
import os
import re
import signal
import socket
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

ROOT = Path("/Users/asmtv1/Desktop/gafus-refactor")
CREDS = ROOT / ".local-pg-scratch/nonprod-s3/credentials.json"
MODE = sys.argv[1:] if len(sys.argv) == 2 else []
if ROOT.resolve() != Path.cwd().resolve() or MODE not in (["--restart-api"], ["--worker"], ["--e2e"]):
    sys.exit("LOCAL_QUESTIONS_RUNTIME_BAD_INVOCATION")
if not CREDS.is_file() or CREDS.is_symlink() or CREDS.stat().st_mode & 0o777 != 0o600:
    sys.exit("LOCAL_QUESTIONS_RUNTIME_PRIVATE_CREDENTIAL_GUARD")
keys = json.loads(CREDS.read_text())
if set(keys) != {"accessKeyId", "secretAccessKey"}:
    sys.exit("LOCAL_QUESTIONS_RUNTIME_CREDENTIAL_FORMAT_DENIED")
p = subprocess.run(["lsof","-nP","-iTCP:3001","-sTCP:LISTEN","-t"],
                   capture_output=True,text=True,timeout=5)
pids = [int(item) for item in p.stdout.splitlines() if item.isdecimal()]
if len(pids) != 1:
    sys.exit("LOCAL_QUESTIONS_RUNTIME_API_NOT_UNIQUE")
pid = pids[0]
ps = subprocess.check_output(["ps","eww","-p",str(pid),"-o","command="],
                             text=True,timeout=5)
if "tsx" not in ps or "src/index.ts" not in ps:
    sys.exit("LOCAL_QUESTIONS_RUNTIME_API_NOT_REFACTOR")
current = dict(re.findall(r"(?<!\S)([A-Za-z_][A-Za-z_0-9]*)=([^\s]+)",ps))
pg = urllib.parse.urlsplit(current.get("DATABASE_URL",""))
redis = urllib.parse.urlsplit(current.get("REDIS_URL",""))
if not ((pg.hostname,pg.port,pg.path) ==
    ("127.0.0.1",55921,"/gafus_refactor_real_work_20261024") and
    (redis.hostname,redis.port) == ("127.0.0.1",55927) and
    current.get("API_HOST") == "127.0.0.1" and
    current.get("API_PORT") == "3001" and
    current.get("GAFUS_LOCAL_ISOLATED_API") == "1" and
    current.get("NODE_ENV") == "development" and
    current.get("GAFUS_ISOLATED_NONPROD_S3") == "enabled" and
    current.get("GAFUS_ISOLATED_S3_ENDPOINT") == "http://127.0.0.1:9000" and
    current.get("GAFUS_ISOLATED_S3_FEED_BUCKET") == "gafus-refactor-feed-test"):
    sys.exit("LOCAL_QUESTIONS_RUNTIME_ENV_GUARD")
# Never reuse a credentialed production Questions endpoint from a prior run.
if current.get("QUESTIONS_V2_S3_ENDPOINT", "") not in ("", "http://127.0.0.1:9000"):
    sys.exit("LOCAL_QUESTIONS_RUNTIME_FOREIGN_ENDPOINT_DENIED")
if current.get("QUESTIONS_V2_S3_BUCKET", "") not in ("", "gafus-refactor-questions-test"):
    sys.exit("LOCAL_QUESTIONS_RUNTIME_FOREIGN_BUCKET_DENIED")
q = {
    "QUESTIONS_V2_MEDIA_ENABLED": "true",
    "QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED": "true",
    "QUESTIONS_V2_S3_ENDPOINT": "http://127.0.0.1:9000",
    "QUESTIONS_V2_S3_BUCKET": "gafus-refactor-questions-test",
    "QUESTIONS_V2_S3_REGION": "ru-central-1",
    "QUESTIONS_V2_S3_ACCESS_KEY_ID": keys["accessKeyId"],
    "QUESTIONS_V2_S3_SECRET_ACCESS_KEY": keys["secretAccessKey"],
    "QUESTIONS_V2_CDN_BASE_URL": "",
}
# Explicitly disable external Jobs in this standalone local-only profile.
if current.get("QUESTIONS_V2_JOB_ENABLED") == "true" or \
   current.get("CLOUDRU_MEDIA_JOBS_ENABLED") == "true":
    sys.exit("LOCAL_QUESTIONS_RUNTIME_CLOUD_JOB_DENIED")
env = {**os.environ, **current, **q}
if MODE == ["--worker"]:
    os.execvpe("pnpm", ["pnpm", "exec", "tsx",
                "scripts/refactor/local-questions-v2-worker.ts","--serve"], env)
if MODE == ["--e2e"]:
    os.execvpe("pnpm", ["pnpm", "exec", "tsx",
                "scripts/refactor/local-questions-v2-e2e.ts"], env)

def listening():
    sock = socket.socket()
    sock.settimeout(0.3)
    try:
        return sock.connect_ex(("127.0.0.1",3001)) == 0
    finally:
        sock.close()

print("Validated isolated WORK PostgreSQL, Redis, MinIO Questions bucket")
os.kill(pid, signal.SIGTERM)
for _ in range(100):
    if not listening():break
    time.sleep(0.15)
if listening():sys.exit("LOCAL_QUESTIONS_RUNTIME_OLD_API_STILL_RUNNING")
log = ROOT / ".local-pg-scratch/questions-v2-isolated-api-20261029.log"
fd = os.open(str(log),os.O_CREAT|os.O_WRONLY|os.O_APPEND,0o600)
with os.fdopen(fd,"ab",buffering=0) as out:
    new = subprocess.Popen(["pnpm","--filter","@gafus/api","exec","tsx","src/index.ts"],
             cwd=ROOT,env=env,stdin=subprocess.DEVNULL,stdout=out,
             stderr=subprocess.STDOUT,start_new_session=True,close_fds=True)
for _ in range(120):
    if listening():break
    if new.poll() is not None:sys.exit("LOCAL_QUESTIONS_RUNTIME_API_EXITED")
    time.sleep(0.2)
if not listening():sys.exit("LOCAL_QUESTIONS_RUNTIME_API_NOT_STARTED")
print("LOCAL_QUESTIONS_V2_LOOPBACK_API_RESTARTED")
