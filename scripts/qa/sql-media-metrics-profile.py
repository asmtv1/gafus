#!/usr/bin/env python3
"""Compare real source media metric query with eight prior COUNTs.
Private PostgreSQL, synthetic rows, exact current index shapes. No prod data.
"""
import argparse
import json
import os
import pathlib
import re
import statistics
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = ROOT / "packages/statistics/src/infra/mediaProcessingMetrics.ts"
TABLES = [("Chat2V2MediaTask","chat2","PROCESSING","FAILED"),
          ("QuestionV2MediaTask","questions","PROCESSING","FAILED"),
          ("FeedUpload","feed","processing","failed"),
          ("GalleryUpload","gallery","processing","failed")]
NOW = "timestamp '2026-11-27 12:00:00'"

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=pathlib.Path)
    args = parser.parse_args()
    pg = args.pg_bin.resolve()
    match = re.search(r'prisma\.\$queryRaw<MediaHealth\[\]>`([^`]+)`', SOURCE.read_text())
    if not match or match[1].count("${now}") != 4:
        raise SystemExit("MEDIA_METRIC_SOURCE_QUERY_NOT_FOUND")
    new = match[1].replace("${now}", NOW).strip()
    old = []
    for table,_,processing,failed in TABLES:
        old += [f'''SELECT count(*)::int FROM "{table}" WHERE status='{processing}' AND ("leaseUntil" IS NULL OR "leaseUntil"<{NOW})''',
                f'''SELECT count(*)::int FROM "{table}" WHERE status='{failed}' ''']
    with tempfile.TemporaryDirectory(prefix="gafus-media-sql-",dir="/tmp") as tmp:
        data=pathlib.Path(tmp)/"data"
        env={**os.environ,"LC_ALL":"C","LANG":"C","TZ":"UTC"}
        for key in list(env):
            if key.startswith("PG"):del env[key]
        def run(binary,*argv):
            return subprocess.check_output([str(pg/binary),*map(str,argv)],env=env,text=True)
        run("initdb","-D",data,"-A","trust","-U","gafus_perf","--no-locale","--no-instructions")
        try:
            run("pg_ctl","-D",data,"-o",f"-h '' -k {tmp} -p 5432 -c shared_buffers=64MB","-l",pathlib.Path(tmp)/"pg.log","-w","start")
            def query(statement):
                return run("psql","-h",tmp,"-p","5432","-U","gafus_perf","-d","postgres","-XqAt","-v","ON_ERROR_STOP=1","-c",statement).strip()
            for table,_,processing,failed in TABLES:
                enum = table in ["FeedUpload","GalleryUpload"]
                status_type="text"
                if enum:
                    status_type='"'+table+'Status"'
                    query(f"CREATE TYPE {status_type} AS ENUM ('reserved','uploaded','processing','ready','failed','cancelled','expired')")
                ready="ready" if enum else "READY"
                query(f'''CREATE TABLE "{table}" (id bigint PRIMARY KEY,status {status_type} NOT NULL,
                  "leaseUntil" timestamp, "nextAttemptAt" timestamp NOT NULL,
                  "createdAt" timestamp NOT NULL, "reservationExpiresAt" timestamp NOT NULL,
                  "ownerId" text NOT NULL, "conversationId" text NOT NULL, "postId" text NOT NULL,
                  "purpose" text NOT NULL, payload text NOT NULL)''')
                if enum:
                    query(f'''CREATE INDEX ON "{table}"(status,"reservationExpiresAt","leaseUntil")''')
                    if table=="FeedUpload":
                        query(f'''CREATE INDEX ON "{table}"("postId",status); CREATE INDEX ON "{table}"(purpose,"createdAt")''')
                else:
                    query(f'''CREATE INDEX ON "{table}"(status,"nextAttemptAt","createdAt")''')
                    if table=="Chat2V2MediaTask":
                        query(f'''CREATE INDEX ON "{table}"("conversationId","ownerId",status)''')
                    else:
                        query(f'''CREATE INDEX ON "{table}"("ownerId",status)''')
                # Sparse active/failed records amongst history; include null,
                # exactly-on-cutoff and both sides of lease boundary.
                query(f'''INSERT INTO "{table}"
                  SELECT i,(CASE WHEN i%113=0 THEN '{processing}' WHEN i%251=0 THEN '{failed}' ELSE '{ready}' END)::{status_type},
                  CASE WHEN i%4=0 THEN NULL WHEN i%4=1 THEN {NOW} WHEN i%4=2 THEN {NOW}-interval '1 millisecond' ELSE {NOW}+interval '1 millisecond' END,
                  {NOW}+i*interval '1 second',{NOW}-i*interval '1 second',{NOW}+i*interval '1 second',
                  'owner-'||(i%1000),'room-'||(i%600),'post-'||(i%3000),'post',repeat('x',240)
                  FROM generate_series(1,120000) i''')
                query(f'VACUUM (ANALYZE) "{table}"')
            def parity():
                counts=[int(query(q)) for q in old]
                expected={p:counts[2*i:2*i+2] for i,(_,p,_,_) in enumerate(TABLES)}
                actual={r.split("|")[0]:list(map(int,r.split("|")[1:])) for r in query(new).splitlines()}
                assert actual==expected,(actual,expected)
                return actual
            counts=parity()
            def sample(queries):
                results=[json.loads(query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "+q))[0] for q in queries]
                return {"execution_ms":sum(r["Execution Time"] for r in results),
                        "planning_ms":sum(r["Planning Time"] for r in results),
                        "blocks":sum(r["Plan"].get("Shared Hit Blocks",0)+r["Plan"].get("Shared Read Blocks",0) for r in results),
                        "temp":sum(r["Plan"].get("Temp Read Blocks",0)+r["Plan"].get("Temp Written Blocks",0) for r in results)}
            sample(old);sample([new])
            measurements={"old":[],"new":[]}
            for i in range(7):
                for k,qs in ([("old",old),("new",[new])] if i%2==0 else [("new",[new]),("old",old)]):
                    measurements[k].append(sample(qs))
            report={k:{metric:round(statistics.median(x[metric] for x in rows),3) for metric in rows[0]} for k,rows in measurements.items()}
            # Check empty-table behavior and all four rows still present.
            query("TRUNCATE "+",".join('"'+t[0]+'"' for t in TABLES))
            assert all(v==[0,0] for v in parity().values())
            print(json.dumps({"rows":480000,"rounds":7,"counts":counts,"statements":{"old":8,"new":1},
                              "median":report,"emptyParity":True},indent=2))
        finally:
            run("pg_ctl","-D",data,"-m","immediate","-w","stop")
if __name__=="__main__":
    main()
