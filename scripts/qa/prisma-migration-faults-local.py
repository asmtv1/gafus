#!/usr/bin/env python3
"""Disposable PostgreSQL 18 SQL cancellation/replay + strict historical Prisma failure.
Never connects to user/local default DB, remote hosts or production.
"""
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
BIN=Path('/opt/homebrew/opt/postgresql@18/bin')
QA_ROOT=ROOT/'.qa'/'testing'/('qa-prisma-faults-'+str(uuid.uuid4()))
QA_ROOT.mkdir(parents=True,exist_ok=False,mode=0o700)
TMP=Path(tempfile.mkdtemp(prefix='gafus-qa-prisma-faults.',dir='/tmp'))
assert TMP.name.startswith('gafus-qa-prisma-faults.') and not TMP.is_symlink()
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0))
    PORT=sock.getsockname()[1]
DB='gafus_migration_fault_qa'
STRICT_DB='gafus_strict_fault_qa'
USER='gafus_qa_fault'
PATH=str(BIN)+os.pathsep+os.environ.get('PATH','/usr/bin:/bin')
ENV={key:os.environ[key] for key in ('PATH','HOME','LANG','LC_ALL','TZ') if key in os.environ}
ENV['PATH']=PATH
ENV.update({'PGCONNECT_TIMEOUT':'5','PGHOST':'127.0.0.1','PGPORT':str(PORT),
            'PGUSER':USER,'NODE_ENV':'test','PRISMA_HIDE_UPDATE_MESSAGE':'true'})
started=False
cases=[]
def call(args,*,env=None,timeout=35,check=True,stdin=None):
    r=subprocess.run([str(x) for x in args],cwd=str(ROOT),
                     env=env or ENV,input=stdin,text=True,capture_output=True,timeout=timeout)
    if check and r.returncode!=0:
        raise RuntimeError('QA_CMD_FAILED:'+Path(str(args[0])).name+':'+str(r.returncode)+':'+r.stderr[-850:])
    return r
def sql(query,db=DB):
    return call([BIN/'psql','-X','-A','-t','-v','ON_ERROR_STOP=1','-d',db,'-c',query]).stdout.strip()
def named(name,detail=None):
    cases.append({'name':name,'status':'passed','detail':detail})
    print('QA_MIGRATION_PASS',name,flush=True)
def is_port_free():
    with socket.socket() as s:
        try: s.bind(('127.0.0.1',PORT))
        except OSError:return False
        return True
failure=None
cleaned=False
try:
    call([BIN/'initdb','-D',TMP/'pg','-A','trust','-U',USER,'--no-instructions'],timeout=35)
    call([BIN/'pg_ctl','-D',TMP/'pg','-l',TMP/'postgres.log','-o',
          '-h 127.0.0.1 -p '+str(PORT)+' -c timezone=UTC -c client_connection_check_interval=1000',
          '-w','start'],timeout=35)
    started=True
    call([BIN/'createdb',DB])
    call([BIN/'createdb',STRICT_DB])
    assert sql("SELECT current_database()||'/'||(current_setting('server_version_num')::integer >= 180000)::text")==DB+'/true'
    named('owned empty PostgreSQL18 databases on random localhost port',{'port':PORT})
    # An interrupted uncommitted DDL cannot survive the loss of its original SQL session.
    sql_env=dict(ENV, PGAPPNAME='gafus_qa_sql_interruption')
    sql_client=subprocess.Popen([str(BIN/'psql'),'-X','-v','ON_ERROR_STOP=1','-d',DB,'-c',
        'BEGIN; CREATE TABLE qa_interrupt_ddl (id integer); SELECT pg_sleep(30); COMMIT;'],
        env=sql_env,cwd=str(ROOT),stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
    try:
        saw=False
        for i in range(140):
            if sql_client.poll() is not None:break
            active=sql("""SELECT count(*) FROM pg_stat_activity WHERE
                    application_name='gafus_qa_sql_interruption' AND state='active'
                    AND query LIKE '%pg_sleep(30)%'""")
            if active=='1':saw=True;break
            time.sleep(0.1)
        assert saw,'DDL_TRANSACTION_NEVER_REACHED_ACTIVE_QUERY'
        sql_client.send_signal(signal.SIGTERM)
        assert sql_client.wait(timeout=12)!=0,'CANCELLED_SQL_RETURNED_SUCCESS'
        # Only the exact synthetic client/DB are involved.
        for i in range(60):
            remaining=sql("""SELECT count(*) FROM pg_stat_activity
              WHERE application_name='gafus_qa_sql_interruption'""")
            if remaining=='0':break
            time.sleep(0.1)
        assert sql("SELECT to_regclass('public.qa_interrupt_ddl') IS NULL")=='t'
        named('SIGTERM on owned SQL client rolls back its uncommitted DDL')
    finally:
        if sql_client.poll() is None:
            sql_client.terminate()
            sql_client.wait(timeout=12)
    # Atomic multi-DDL: a deliberate error must undo all earlier statements.
    broken=TMP/'invalid-atomic.sql'
    broken.write_text('CREATE TABLE qa_atomic_first (id integer);\nSELECT 1/0;\nCREATE TABLE qa_atomic_last (id integer);\n')
    result=call([BIN/'psql','-X','-v','ON_ERROR_STOP=1','--single-transaction',
         '-d',DB,'-f',broken],check=False)
    assert result.returncode!=0 and ('division by zero' in result.stderr),'BROKEN_SQL_MUST_FAIL'
    assert sql("SELECT to_regclass('public.qa_atomic_first') IS NULL")=='t'
    assert sql("SELECT to_regclass('public.qa_atomic_last') IS NULL")=='t'
    named('failed multi-statement migration rolls back all SQL DDL atomically')
    # Ordinary versioned migrations are NOT idempotent: a second install must reject
    # a duplicate without damaging the first committed result.
    once=TMP/'once.sql'
    once.write_text('CREATE TABLE qa_once (id integer PRIMARY KEY);\nINSERT INTO qa_once VALUES (1);\n')
    call([BIN/'psql','-X','-v','ON_ERROR_STOP=1','--single-transaction','-d',DB,'-f',once])
    replay=call([BIN/'psql','-X','-v','ON_ERROR_STOP=1','--single-transaction','-d',DB,'-f',once],check=False)
    assert replay.returncode!=0 and 'already exists' in replay.stderr
    assert sql('SELECT count(*) FROM qa_once')=='1'
    named('duplicate migration replay fails closed and preserves one committed row')
    # On a distinct fresh DB, original historic chain is still blocked: this
    # expected failure is not confused with the previously proven Option A bootstrap.
    strict_env=dict(ENV,DATABASE_URL='postgresql://'+USER+'@127.0.0.1:'+str(PORT)+'/'+STRICT_DB+'?schema=public')
    strict=call(['pnpm','--filter','@gafus/prisma','exec','prisma','migrate','deploy'],
                env=strict_env,timeout=130,check=False)
    combined=strict.stdout+' '+strict.stderr
    assert strict.returncode!=0,'STRICT_MIGRATION_UNEXPECTED_GREEN'
    assert re.search(r'P3018|42P01',combined),'STRICT_MIGRATION_MISSING_KNOWN_FAILURE:'+combined[-850:]
    assert sql("SELECT count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NULL",STRICT_DB)=='1'
    named('unmodified strict Prisma history returns expected P3018, never false PASS')
except Exception as ex:
    failure=str(ex)
    print('QA_MIGRATION_FAILED',failure,flush=True)
finally:
    cleanup_error=None
    if started:
        try:
            call([BIN/'pg_ctl','-D',TMP/'pg','-m','immediate','-w','stop'],timeout=35)
        except Exception as ex:
            cleanup_error='OWNED_POSTGRES_STOP_FAILED:'+str(ex)
    try:
        if TMP.name.startswith('gafus-qa-prisma-faults.') and TMP.parent==Path('/tmp') and not TMP.is_symlink():
            shutil.rmtree(TMP)
        else:
            cleanup_error='OWNED_TEMP_DIR_NOT_SAFE'
    except Exception as ex:
        cleanup_error='OWNED_TEMP_DIR_NOT_REMOVED:'+str(ex)
    cleaned=cleanup_error is None and not TMP.exists() and is_port_free()
    if not cleaned and failure is None: failure=cleanup_error or 'OWNED_POSTGRES_PORT_STILL_LISTENING'
    if cleaned: print('QA_MIGRATION_OWNED_RESOURCES_CLEANED',PORT,flush=True)
    receipt={'schema':1,'kind':'prisma-migration-faults-local',
       'status':'passed' if failure is None and len(cases)==5 and cleaned else 'failed',
       'casesExpected':5,'casesPassed':len(cases),
       'postgres18':True,'port':PORT,'ownedResourcesCleaned':cleaned,
       'strictHistoricalReplay':'expected-P3018-not-fixed',
       'prismaOptionABootstrap':'not-executed-here',
       'scope':'disposable localhost databases only','cases':cases,
       'reason':failure}
    (QA_ROOT/'summary.json').write_text(json.dumps(receipt,indent=2,ensure_ascii=False)+'\n')
    print('QA_MIGRATION_REPORT',receipt['status'],str(QA_ROOT/'summary.json'),flush=True)
if receipt['status']!='passed':raise SystemExit(1)
