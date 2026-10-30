#!/usr/bin/env python3
"""Questions Photo V2 PostgreSQL/Prisma smoke on a brand-new local test DB.

Fail closed on root/branch; no existing database, Cloud or production access.
Creates only project-local temp files and destroys exactly the temp instance
it just initialized. Requires Mac postgres, initdb, pg_ctl, psql and pnpm/tsx.
"""
from pathlib import Path
from urllib.parse import quote
import os
import secrets
import shutil
import subprocess
import tempfile

ROOT = Path("/Users/asmtv1/Desktop/gafus-refactor").resolve(strict=True)
assert ROOT == Path.cwd().resolve(strict=True)
assert subprocess.check_output(
    ["git", "-C", str(ROOT), "rev-parse", "--show-toplevel"], text=True
).strip() == str(ROOT)
assert subprocess.check_output(
    ["git", "-C", str(ROOT), "branch", "--show-current"], text=True
).strip() == "vite"
parent = ROOT / ".refactor-acceptance"
if parent.exists():
    assert parent.is_dir() and not parent.is_symlink()
    assert parent.resolve().is_relative_to(ROOT)
else:
    parent.mkdir()
temp = Path(tempfile.mkdtemp(prefix="qp-prisma-", dir=parent))
socket = parent / ("s" + secrets.token_hex(4))
socket.mkdir()
assert temp.resolve().is_relative_to(ROOT) and socket.resolve().is_relative_to(ROOT)
data = temp / "pgdata"
base = ["pg_ctl", "-D", str(data)]
db_user = os.environ.get("USER", "asmtv1")
url = f"postgresql://{quote(db_user, safe='')}@127.0.0.1:35439/postgres?schema=public"
env = dict(os.environ)
env.update(
    TMPDIR=str(temp),
    PGHOST=str(socket),
    PGPORT="35439",
    PGUSER=db_user,
    DATABASE_URL=url,
    DIRECT_URL=url,
    NODE_ENV="test",
    GAFUS_QUESTIONS_PG_ISOLATED="1",
    GAFUS_QUESTIONS_REDIS_ISOLATED="1",
    GAFUS_QUESTIONS_REDIS_PORT="35440",
)
started = False
redis_proc = None
redis_log = None
def start_test_redis():
    global redis_proc, redis_log
    redis_log = open(temp / "redis.log", "ab")
    redis_proc = subprocess.Popen([
        "redis-server", "--bind", "127.0.0.1", "--port", "35440",
        "--save", "", "--appendonly", "no", "--protected-mode", "yes",
        "--dir", str(temp),
    ], cwd=ROOT, env=env, stdout=redis_log, stderr=subprocess.STDOUT)
    import time
    for _ in range(45):
        if redis_proc.poll() is not None:
            raise AssertionError("LOCAL_REDIS_FAILED_TO_START")
        ping = subprocess.run(["redis-cli", "-h", "127.0.0.1", "-p", "35440", "PING"],
                              capture_output=True, text=True, timeout=1)
        if ping.returncode == 0 and ping.stdout.strip() == "PONG":
            return
        time.sleep(.1)
    raise AssertionError("LOCAL_REDIS_READY_TIMEOUT")
def stop_test_redis():
    global redis_proc, redis_log
    if redis_proc:
        redis_proc.terminate()
        redis_proc.wait(timeout=8)
        redis_proc = None
    if redis_log:
        redis_log.close()
        redis_log = None
try:
    init = subprocess.run(
        ["initdb", "-D", str(data), "-A", "trust", "--no-instructions"],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=35, check=False,
    )
    assert init.returncode == 0, init.stderr[-1000:]
    start = subprocess.run(
        base + [
            "-l", str(temp / "postgres.log"),
            "-o", f"-h 127.0.0.1 -p 35439 -k {socket}", "-w", "start",
        ],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=35, check=False,
    )
    assert start.returncode == 0, (temp / "postgres.log").read_text()[-1800:]
    started = True
    commands = [
        [
            "psql", "-X", "-v", "ON_ERROR_STOP=1", "-d", "postgres", "-f",
            str(ROOT / "packages/prisma/migrations/20261028134000_questions_photo_v2/migration.sql"),
        ],
        [
            "psql", "-X", "-v", "ON_ERROR_STOP=1", "-d", "postgres", "-c",
            '''CREATE TABLE "Question" ("id" TEXT PRIMARY KEY, "deletedAt" TIMESTAMP(3));
               CREATE TABLE "QuestionAnswer" ("id" TEXT PRIMARY KEY, "deletedAt" TIMESTAMP(3));
               CREATE TABLE "QuestionPhoto" ("id" TEXT PRIMARY KEY, "ownerId" TEXT,
                   "url" TEXT, "storagePath" TEXT, "questionId" TEXT, "answerId" TEXT,
                   "createdAt" TIMESTAMP(3));''',
        ],
    ]
    for command in commands:
        result = subprocess.run(
            command, cwd=ROOT, env=env, capture_output=True, text=True, timeout=30, check=False,
        )
        assert result.returncode == 0, result.stderr[-1600:]
    print("REAL_QUESTIONS_V2_MIGRATION=PASS")
    result = subprocess.run(
        ["pnpm", "exec", "tsx", "apps/api/src/test/questions-photo-pg-isolated.acceptance.mts"],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=65, check=False,
    )
    print(result.stdout[-2200:])
    if result.returncode:
        print("PRISMA_INTEGRATION_ERROR", result.stderr[-2000:])
    assert result.returncode == 0, "PRISMA_INTEGRATION_FAILED"
    start_test_redis()
    for phase in ("seed", "outage", "recover"):
        if phase == "outage":
            stop_test_redis()
        elif phase == "recover":
            start_test_redis()
        try:
            result = subprocess.run(
                ["pnpm", "exec", "tsx", "apps/api/src/test/questions-photo-pg-redis-isolated.acceptance.mts", phase],
                cwd=ROOT, env=env, capture_output=True, text=True, timeout=18, check=False,
            )
        except subprocess.TimeoutExpired as error:
            print("REDIS_TEST_TIMEOUT", phase, (error.stdout or b"")[-1300:],
                  (error.stderr or b"")[-1000:])
            raise
        print(result.stdout[-1500:])
        if result.returncode:
            print("REDIS_INTEGRATION_ERROR", result.stderr[-1800:])
        assert result.returncode == 0, "REDIS_INTEGRATION_FAILED_" + phase
finally:
    stop_test_redis()
    stop = None
    if started:
        stop = subprocess.run(
            base + ["-m", "immediate", "-w", "stop"],
            cwd=ROOT, env=env, capture_output=True, text=True, timeout=35, check=False,
        )
        print("POSTGRES_STOP", stop.returncode)
    if stop is None or stop.returncode == 0:
        assert temp.parent == parent and socket.parent == parent
        shutil.rmtree(temp)
        socket.rmdir()
        print("LOCAL_PG_TEST_FILES_CLEANED=YES")
