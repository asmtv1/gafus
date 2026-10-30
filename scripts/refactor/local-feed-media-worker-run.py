#!/usr/bin/env python3
"""Recover the already running isolated API's local WORK DB URL without persisting secrets."""
import os
import re
import subprocess
import sys
import urllib.parse
from pathlib import Path

ROOT = Path("/Users/asmtv1/Desktop/gafus-refactor")
if Path.cwd().resolve() != ROOT or len(sys.argv) != 2 or sys.argv[1] not in ("--once","--serve","--verify"):
    sys.exit("LOCAL_FEED_WORKER_BAD_INVOCATION")
p = subprocess.run(["lsof","-nP","-iTCP:3001","-sTCP:LISTEN","-t"],capture_output=True,text=True,timeout=5)
ids = [x.strip() for x in p.stdout.splitlines() if x.strip().isdigit()]
if len(ids) != 1: sys.exit("LOCAL_FEED_WORKER_API_UNAVAILABLE")
ps = subprocess.check_output(["ps","eww","-p",ids[0],"-o","command="],text=True,timeout=5)
def get(k):
    m = re.search(r"(?:^|\s)" + re.escape(k) + r"=(\S+)", ps)
    return m.group(1) if m else None
db = get("DATABASE_URL")
if not db: sys.exit("LOCAL_FEED_WORKER_NO_DATABASE")
u = urllib.parse.urlsplit(db)
if (u.hostname,u.port,u.path) != ("127.0.0.1",55921,"/gafus_refactor_real_work_20261024") or get("GAFUS_LOCAL_ISOLATED_API") != "1":
    sys.exit("LOCAL_FEED_WORKER_DATABASE_DENIED")
if get("GAFUS_ISOLATED_NONPROD_S3") != "enabled" or get("GAFUS_ISOLATED_S3_ENDPOINT") != "http://127.0.0.1:9000":
    sys.exit("LOCAL_FEED_WORKER_STORAGE_DENIED")
env = {
    "PATH": os.environ.get("PATH","/opt/homebrew/bin:/usr/bin:/bin"),
    "HOME": str(ROOT / ".local-pg-scratch"),
    "DATABASE_URL": db, "NODE_ENV": "development",
    "GAFUS_LOCAL_ISOLATED_API": "1",
    "GAFUS_ISOLATED_NONPROD_S3": "enabled",
    "GAFUS_ISOLATED_S3_ENDPOINT": "http://127.0.0.1:9000",
    "GAFUS_ISOLATED_S3_FEED_BUCKET": "gafus-refactor-feed-test",
    "GAFUS_ISOLATED_S3_GALLERY_BUCKET": "gafus-refactor-gallery-test",
}
entry = ("scripts/refactor/verify-local-comment-media.ts" if sys.argv[1] == "--verify"
         else "scripts/refactor/local-feed-media-worker.ts")
argv = ["pnpm","exec","tsx",entry]
if sys.argv[1] != "--verify": argv.append(sys.argv[1])
os.execve("/opt/homebrew/bin/pnpm", argv, env)
