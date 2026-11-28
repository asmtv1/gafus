#!/usr/bin/env python3
"""Disposable PostgreSQL 18 profile of the actual mail monitor SQL.
Uses synthetic data only, a private UNIX socket and no production environment.
Run: python3 scripts/qa/sql-mail-attempt-profile.py --pg-bin /path/to/pg/bin
"""
import argparse
import json
import pathlib
import re
import statistics
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = ROOT / "packages/statistics/src/infra/mailDeliveryMonitor.ts"
TIMES = {
    "stalledCutoff": "2026-11-27 11:55:00",
    "idempotencyCutoff": "2026-11-26 13:00:00",
    "recentCutoff": "2026-11-26 12:00:00",
    "resetStart": "2026-11-27 11:00:00",
}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=pathlib.Path)
    args = parser.parse_args()
    pg = args.pg_bin.resolve()
    for binary in ("initdb", "pg_ctl", "psql"):
        if not (pg / binary).is_file():
            raise SystemExit("Required PostgreSQL binary missing: " + binary)
    source = SOURCE.read_text()
    match = re.search(r'prisma\.\$queryRaw<AttemptHealth\[\]>`([^`]+)`', source)
    if not match:
        raise SystemExit("MAIL_ATTEMPT_QUERY_NOT_FOUND")
    # Substitute only known, fixed diagnostic timestamp parameters; this
    # executes exactly the new source query, not a parallel reimplementation.
    new = re.sub(r'\$\{(\w+)\}', lambda m: "timestamp '" + TIMES[m[1]] + "'", match[1]).strip()
    if PLACE_LITERAL in new:
        raise SystemExit("UNRESOLVED_SOURCE_PARAMETER")
    old = [
        '''SELECT count(*) FROM "TransactionalMailAttempt" WHERE status='PENDING' AND "createdAt"<'2026-11-27 11:55' ''',
        '''SELECT count(*) FROM "TransactionalMailAttempt" WHERE status='UNKNOWN' AND "createdAt"<'2026-11-27 11:55' ''',
        '''SELECT count(*) FROM "TransactionalMailAttempt" WHERE status='UNKNOWN' AND "createdAt"<'2026-11-26 13:00' ''',
        '''SELECT count(*) FROM "TransactionalMailAttempt" WHERE status='FAILED' AND "createdAt">='2026-11-26 12:00' ''',
        '''SELECT count(*),count(*) FILTER(WHERE status IN ('PENDING','UNKNOWN')) FROM "TransactionalMailAttempt" WHERE category='password_reset' AND "createdAt">='2026-11-27 11:00' AND "createdAt"<'2026-11-27 11:55' ''',
    ]
    with tempfile.TemporaryDirectory(prefix="gafus-mail-sql-", dir="/tmp") as tmp:
        data = pathlib.Path(tmp) / "data"
        def run(binary, *argv):
            return subprocess.check_output([str(pg/binary), *map(str, argv)], text=True)
        run("initdb", "-D", data, "-A", "trust", "-U", "gafus_perf", "--no-locale", "--no-instructions")
        try:
            run("pg_ctl", "-D", data, "-o", "-h '' -k " + tmp + " -p 5432", "-l", pathlib.Path(tmp)/"postgres.log", "-w", "start")
            def query(statement):
                return run("psql", "-h", tmp, "-p", "5432", "-U", "gafus_perf", "-d", "postgres", "-XAt", "-v", "ON_ERROR_STOP=1", "-c", statement).strip()
            query('''
              CREATE TABLE "TransactionalMailAttempt" (
                "id" text PRIMARY KEY, "status" text NOT NULL, "category" text NOT NULL DEFAULT 'general',
                "createdAt" timestamp NOT NULL, "providerMessageId" text UNIQUE, "recipientCount" int NOT NULL,
                "errorCode" text, "acceptedAt" timestamp);
              CREATE INDEX ON "TransactionalMailAttempt"("createdAt");
              CREATE INDEX ON "TransactionalMailAttempt"("category","createdAt");
              INSERT INTO "TransactionalMailAttempt" ("id","status","category","createdAt","recipientCount")
              SELECT 'a'||i,
                CASE WHEN i%503=0 THEN 'UNKNOWN' WHEN i%401=0 THEN 'PENDING' WHEN i%97=0 THEN 'FAILED' ELSE 'ACCEPTED' END,
                CASE WHEN i%7=0 THEN 'password_reset' ELSE 'general' END,
                timestamp '2026-11-27 12:00' - (i%259200)*interval '10 seconds',1
              FROM generate_series(1,300000) i;
            ''')
            query("VACUUM ANALYZE")
            # Add exact-boundary examples and valid recent reset failures;
            # the initial large synthetic distribution is intentionally sparse.
            query('''INSERT INTO "TransactionalMailAttempt" ("id","status","category","createdAt","recipientCount") VALUES
              ('reset-stuck','UNKNOWN','password_reset','2026-11-27 11:30',1),
              ('reset-cutoff','PENDING','password_reset','2026-11-27 11:55',1),
              ('reset-start','PENDING','password_reset','2026-11-27 11:00',1),
              ('reset-old','UNKNOWN','password_reset','2026-11-27 10:59:59',1),
              ('reset-failed','FAILED','password_reset','2026-11-27 11:30',1),
              ('unknown-idempotency-boundary','UNKNOWN','general','2026-11-26 13:00',1)''')
            query("ANALYZE")
            expected = "|".join(query(s) for s in old)
            actual = query(new)
            if expected != actual:
                raise SystemExit("MAIL_SQL_SEMANTICS_MISMATCH: " + expected + " != " + actual)
            def sample(statements):
                plans = [json.loads(query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "+s))[0] for s in statements]
                return {
                    "ms": sum(p["Execution Time"] for p in plans),
                    "sharedBlocks": sum(p["Plan"].get("Shared Hit Blocks",0)+p["Plan"].get("Shared Read Blocks",0) for p in plans),
                    "tempBlocks": sum(p["Plan"].get("Temp Read Blocks",0)+p["Plan"].get("Temp Written Blocks",0) for p in plans),
                    "plans": [p["Plan"] for p in plans],
                }
            a, b = [], []
            for i in range(7):
                if i % 2 == 0:
                    a.append(sample(old)); b.append(sample([new]))
                else:
                    b.append(sample([new])); a.append(sample(old))
            def stats(samples):
                return {k: round(statistics.median(s[k] for s in samples), 3) for k in ("ms","sharedBlocks","tempBlocks")}
            result = {"scope":"synthetic PostgreSQL; summed statement cost, not API latency",
                      "rows":300006,"equalCounts":actual,"old":stats(a),"new":stats(b),
                      "oldStatements":5,"newStatements":1,"newPlan":b[-1]["plans"][0]}
            print(json.dumps(result,indent=2))
            query('TRUNCATE "TransactionalMailAttempt"')
            if query(new) != "0|0|0|0|0|0":
                raise SystemExit("MAIL_SQL_EMPTY_COHORT_MISMATCH")
            print("MAIL_SQL_EXACT_SOURCE_PARITY_PASS")
        finally:
            subprocess.run([str(pg/"pg_ctl"),"-D",str(data),"-m","immediate","stop"],
                           stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)

PLACE_LITERAL = "$" + "{"
if __name__ == "__main__":
    main()
