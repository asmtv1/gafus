#!/usr/bin/env python3
"""Attach only loopback Questions V2 settings to the already isolated Hono launch.

No credentials are written or printed. Never selects production/cloud S3.
"""
import json
import os
import sys
import urllib.parse
from pathlib import Path

ROOT = Path("/Users/asmtv1/Desktop/gafus-refactor")
CREDS = ROOT / ".local-pg-scratch/nonprod-s3/credentials.json"
e = os.environ
pg = urllib.parse.urlsplit(e.get("DATABASE_URL",""))
redis = urllib.parse.urlsplit(e.get("REDIS_URL",""))
if (ROOT.resolve() != Path.cwd().resolve() or
    (pg.hostname,pg.port,pg.path) !=
        ("127.0.0.1",55921,"/gafus_refactor_real_work_20261024") or
    (redis.hostname,redis.port) != ("127.0.0.1",55927) or
    e.get("GAFUS_LOCAL_ISOLATED_API") != "1" or
    e.get("NODE_ENV") != "development" or
    e.get("GAFUS_ISOLATED_NONPROD_S3") != "enabled" or
    e.get("GAFUS_ISOLATED_S3_ENDPOINT") != "http://127.0.0.1:9000" or
    e.get("GAFUS_ISOLATED_S3_QUESTIONS_BUCKET") !=
        "gafus-refactor-questions-test" or
    e.get("CLOUDRU_MEDIA_JOBS_ENABLED") != "false" or
    e.get("QUESTIONS_V2_JOB_ENABLED","false") == "true" or
    not CREDS.is_file() or CREDS.is_symlink() or
    CREDS.stat().st_mode & 0o777 != 0o600 or
    (e.get("QUESTIONS_V2_S3_ENDPOINT") not in
      (None,"","http://127.0.0.1:9000"))):
    sys.exit("LOCAL_QUESTIONS_V2_STARTUP_ISOLATION_DENIED")
keys = json.loads(CREDS.read_text())
if set(keys) != {"accessKeyId","secretAccessKey"}:
    sys.exit("LOCAL_QUESTIONS_V2_STARTUP_CREDS_DENIED")
e.update({
    "QUESTIONS_V2_MEDIA_ENABLED":"true",
    "QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED":"true",
    "QUESTIONS_V2_S3_ENDPOINT":"http://127.0.0.1:9000",
    "QUESTIONS_V2_S3_BUCKET":"gafus-refactor-questions-test",
    "QUESTIONS_V2_S3_REGION":"ru-central-1",
    "QUESTIONS_V2_S3_ACCESS_KEY_ID":keys["accessKeyId"],
    "QUESTIONS_V2_S3_SECRET_ACCESS_KEY":keys["secretAccessKey"],
    "QUESTIONS_V2_CDN_BASE_URL":"",
    "QUESTIONS_V2_JOB_ENABLED":"false",
    "QUESTIONS_V2_PROCESSOR_READY":"false",
})
os.execvpe("/opt/homebrew/bin/pnpm", ["pnpm","--filter","@gafus/api","exec",
    "tsx","src/index.ts"], e)
