#!/usr/bin/env python3
"""Independent A3 package-coverage receipts for a FUTURE integrated checkout.
check is read-only. init/architecture/extras/no-test/verify are future gates.
No historical PASS is accepted, and logs stay outside the shared repository.
"""
import argparse, datetime as dt, hashlib, json, os, pathlib, re, subprocess, sys
ROOT=pathlib.Path(os.environ.get('GAFUS_ACCEPTANCE_REPO','/Users/asmtv1/Desktop/gafus-refactor')).resolve()
CAT=pathlib.Path(__file__).resolve().parent
MATRIX_FILE=CAT/'coverage-matrix.json'
MATRIX=json.loads(MATRIX_FILE.read_text())
MATRIX_SHA=hashlib.sha256(MATRIX_FILE.read_bytes()).hexdigest()
LOG_ROOT=pathlib.Path.home()/'Library/Logs/gafus-refactor-regression'
OTHER_GATES={'architecture','workspace-graph','monitoring','build','runtime','types','whitespace'}

def bad(message): raise RuntimeError('A3_COVERAGE_DENIED:'+message)
def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def when(iso): return dt.datetime.fromisoformat(iso).timestamp()
def git(*args): return subprocess.check_output(['git',*args],cwd=ROOT)
def write_json(p,value):
    p.parent.mkdir(parents=True,exist_ok=True)
    with p.open('x') as f: json.dump(value,f,indent=2,ensure_ascii=False);f.write('\n')

def testfiles(sub):
    src=ROOT/sub/'src'
    if not src.exists():return []
    return sorted(p.relative_to(ROOT).as_posix() for p in src.rglob('*')
       if p.is_file() and re.search(r'\.(test|spec)\.[cm]?[jt]sx?$',p.name)
       and not any(x in p.parts for x in ('dist','build','node_modules','coverage','.turbo')))

def packages():
    result={}
    for parent in ('apps','packages'):
        for folder in sorted((ROOT/parent).iterdir()):
            f=folder/'package.json'
            if not f.is_file(): continue
            o=json.loads(f.read_text());name=o['name'];rel=f'{parent}/{folder.name}'
            result[name]={'dir':rel,'testScript':o.get('scripts',{}).get('test'),
               'buildScript':o.get('scripts',{}).get('build'),
               'typecheckScript':o.get('scripts',{}).get('typecheck'),
               'lintScript':o.get('scripts',{}).get('lint'),
               'discoveredSourceTests':testfiles(pathlib.Path(rel))}
    return result

def check():
    current=packages();plan=MATRIX['packages']
    if len(current)!=69 or len(plan)!=69:bad('WORKSPACE_INVENTORY_DRIFT')
    src=(ROOT/'scripts/qa/architecture-final-regression.sh').read_text()
    if hashlib.sha256(src.encode()).hexdigest()!=MATRIX['mainRunnerSha256']:bad('ARCH_RUNNER_CHANGED_REGENERATE_AND_REVIEW_MATRIX')
    m=re.search(r'for pkg in (core api worker[^\n]*); do',src)
    if not m or 'for pkg in mobile trainer-panel admin-panel; do' not in src or 'run_gate web node scripts/qa/web-vite-chunked-regression.mjs' not in src:bad('ARCH_RUNNER_SHAPE_CHANGED')
    main={'@gafus/'+name for name in m.group(1).split()}
    main|={'@gafus/web-vite','@gafus/mobile','@gafus/trainer-panel','@gafus/admin-panel'}
    count={'architecture':0,'extras':0,'no-test':0};orphan=0;seen=set()
    for p in plan:
        name=p['name'];v=current.get(name)
        if name in seen or v is None:bad('DUPLICATE_OR_MISSING:'+name)
        seen.add(name)
        for key in ('dir','testScript','buildScript','typecheckScript','lintScript','discoveredSourceTests'):
            if p[key]!=v[key]:bad('PACKAGE_OR_TEST_FILE_DRIFT:'+name+':'+key)
        stage=('architecture' if name in main else 'extras') if p['testScript'] else 'no-test'
        if p['stage']!=stage:bad('STAGE_DRIFT:'+name)
        suffix=name.removeprefix('@gafus/')
        gate=('web' if name=='@gafus/web-vite' else 'test-'+suffix) if stage=='architecture' else ('extra-'+suffix if stage=='extras' else 'no-test-'+suffix)
        if p['gate']!=gate:bad('GATE_DRIFT:'+name)
        if p['testScript'] and 'passWithNoTests' in p['testScript']:bad('SKIP_ALL_OPT_IN:'+name)
        count[stage]+=1
        if not p['testScript']:orphan+=len(p['discoveredSourceTests'])
    if count!={'architecture':26,'extras':31,'no-test':12} or len(main)!=26 or orphan!=29 or sum(bool(p['discoveredSourceTests']) for p in plan if p['stage']=='no-test')!=5:bad('BASELINE_COUNTS_DRIFT')
    return dict(workspace=69,testScripts=57,architecture=26,extras=31,noTestScripts=12,missingScriptSourceTests=orphan)

def source_state():
    h=hashlib.sha256();head=git('rev-parse','HEAD').decode().strip();h.update(head.encode())
    h.update(git('diff','--binary','HEAD'))
    extra=sorted(x.decode('utf-8','surrogateescape') for x in git('ls-files','--others','--exclude-standard','-z').split(b'\0') if x)
    for rel in extra:
        p=ROOT/rel;h.update(rel.encode('utf-8','surrogateescape')+b'\0')
        if p.is_symlink():h.update(os.readlink(p).encode())
        elif p.is_file():
            with p.open('rb') as f:
                while buf:=f.read(1024*1024):h.update(buf)
    return dict(head=head,digest=h.hexdigest(),untrackedFiles=len(extra))

def no_secrets():
    if os.environ.get('NODE_ENV')=='production':bad('PRODUCTION_NODE_ENV_NOT_ALLOWED')
    for k,v in os.environ.items():
        if v and re.match(r'(?:DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL|REDIS_URL|CLOUDRU_|BEGET_|AWS_|S3_|GAFUS_STAGING_)',k):bad('SHARED_PROVIDER_ENV:'+k)

def session(run_id):
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,32}',run_id or ''):bad('VALID_UNIQUE_RUN_ID_REQUIRED')
    d=LOG_ROOT/run_id;p=d/'a3-coverage-session.json'
    if not p.is_file():bad('FRESH_SESSION_MISSING:'+run_id)
    s=json.loads(p.read_text())
    if s['id']!=run_id or s['matrixSha']!=MATRIX_SHA or s['repo']!=str(ROOT):bad('SESSION_FROM_DIFFERENT_MATRIX_OR_REPO')
    return d,s

def stable(s):
    if source_state()!=s['source']:bad('SOURCE_DRIFT_REQUIRES_NEW_FULL_RUN')

def fresh(p,s):
    if not p.is_file():bad('RECEIPT_MISSING:'+str(p))
    if p.stat().st_mtime+2 < when(s['createdAt']):bad('HISTORICAL_RECEIPT_REJECTED:'+str(p))

def launch(cmd,p):
    with p.open('x') as output:
        try:r=subprocess.run(cmd,cwd=ROOT,stdout=output,stderr=subprocess.STDOUT,timeout=14400,check=False)
        except subprocess.TimeoutExpired:return 124
    return r.returncode

def full_build_proof(d,s):
    f=d/'a3-full-build-driver.json';fresh(f,s)
    o=json.loads(f.read_text());log=d/'a3-full-build-driver.log';fresh(log,s)
    if o['id']!=s['id'] or o['exitCode']!=0 or when(o['startedAt'])<when(s['createdAt']) or o.get('command')!='pnpm exec turbo run build --force':bad('FULL_WORKSPACE_BUILD_MISSING_OR_STALE')

def arch_proof(d,s):
    receipt=d/'results.tsv';fresh(receipt,s)
    lines=[line.split('\t') for line in receipt.read_text().splitlines() if line]
    expected=OTHER_GATES|{x['gate'] for x in MATRIX['packages'] if x['stage']=='architecture'}
    if len(lines)!=33 or len(expected)!=33:bad('ARCH_COUNT_NOT_33')
    actual=set()
    for row in lines:
        if len(row)!=2 or row[0] not in expected or row[0] in actual or row[1]!='PASS':bad('ARCH_STAGE_NOT_CONFIRMED:'+repr(row))
        actual.add(row[0]);fresh(d/(row[0]+'.log'),s)
    driver=d/'a3-architecture-driver.json';fresh(driver,s)
    info=json.loads(driver.read_text())
    if info['id']!=s['id'] or info['exitCode']!=0 or when(info['startedAt'])<when(s['createdAt']) or not info.get('finishedAt'):bad('ARCH_FINAL_EXIT_MISSING')
    log=d/'a3-architecture-driver.log';fresh(log,s)
    if 'ALL ARCHITECTURE LOCAL REGRESSION GATES PASS' not in log.read_text(errors='replace'):bad('ARCH_DRIVER_SUCCESS_MARKER_MISSING')
    web=LOG_ROOT/(s['id']+'-web-chunks')/'completion.json';fresh(web,s)
    c=json.loads(web.read_text())
    if c['runId']!=s['id'] or c['state']!='passed' or c['filesDiscovered']<300 or c['filesPassed']+c['filesSkipped']!=c['filesDiscovered']:bad('WEB_CHUNK_DISCOVERY_INCOMPLETE')
    return c

def parse_tests(log):
    text=log.read_text(errors='replace')
    text=re.sub(r'\x1b\[[0-9;]*m','',text)
    file_rows=re.findall(r'Test Files\s+[^\n]*?\((\d+)\)',text)
    if not file_rows or int(file_rows[-1])<1 or re.search(r'No test files found|No tests found|No test suites found',text,re.I):bad('VITEST_NO_TESTS:'+str(log))
    summary={'totalFiles':int(file_rows[-1]),'skippedFiles':0,'skippedTests':0}
    for pattern,key in [(r'Test Files[^\n]*?\b(\d+) skipped\b','skippedFiles'),(r'\bTests\s+[^\n]*?\b(\d+) skipped\b','skippedTests')]:
        rows=re.findall(pattern,text)
        if rows:summary[key]=int(rows[-1])
    if not re.search(r'\bTests\s+[^\n]*\b(\d+) passed\b',text):bad('VITEST_PASSED_TESTS_UNCONFIRMED:'+str(log))
    return summary

def stage_receipts(d,s,stage,expected):
    f=d/stage/'results.json';fresh(f,s)
    data=json.loads(f.read_text())
    if data['id']!=s['id'] or data['stage']!=stage or len(data['entries'])!=len(expected):bad('STAGE_ID_COUNT_INVALID:'+stage)
    seen=set()
    for item in data['entries']:
        name=item['name'];jobs=item['jobs']
        if name in seen or name not in expected:bad('UNEXPECTED_OR_DUPLICATE_PACKAGE:'+name)
        seen.add(name)
        if item['exitCode']!=0 or when(item['startedAt'])<when(s['createdAt']) or not item.get('finishedAt') or not jobs:bad('PACKAGE_EXECUTION_UNCONFIRMED:'+name)
        for job in jobs:
            if job['exitCode']!=0:bad('PACKAGE_JOB_FAILED:'+name+':'+job['label'])
            fresh(d/job['log'],s)
    return data

def stage_plan(kind):
    return [p for p in MATRIX['packages'] if p['stage']==kind]

def do_stage(kind,d,s):
    if kind=='extras':arch_proof(d,s);full_build_proof(d,s)
    if kind=='no-test':
        arch_proof(d,s);full_build_proof(d,s)
        stage_receipts(d,s,'extras',{p['name'] for p in stage_plan('extras')})
    stable(s);no_secrets()
    folder=d/kind
    if folder.exists():bad('STAGE_ALREADY_STARTED_NEW_RUN_ID_REQUIRED:'+kind)
    folder.mkdir()
    report={'id':s['id'],'stage':kind,'startedAt':now(),'entries':[]}
    failures=0
    for p in stage_plan('extras' if kind=='extras' else 'no-test'):
        name=p['name'];slug=name.removeprefix('@gafus/')
        entry={'name':name,'startedAt':now(),'finishedAt':None,'exitCode':None,'jobs':[]}
        def job(label,command):
            nonlocal failures
            rel=f'{kind}/{slug}-{label}.log';log=d/rel
            code=launch(command,log)
            entry['jobs'].append({'label':label,'command':command,'exitCode':code,'log':rel})
            if code!=0:failures+=1
            return code==0
        if kind=='extras':job('test',['pnpm','--filter',name,'test'])
        else:
            if job('build',['pnpm','--filter',name,'build']):
                if p['typecheckScript']:job('typecheck',['pnpm','--filter',name,'typecheck'])
                if p['lintScript']:job('lint',['pnpm','--filter',name,'lint'])
                if p['discoveredSourceTests']:
                    job('direct-vitest',['pnpm','exec','vitest','run','--config','vitest.config.ts',*p['discoveredSourceTests'],'--maxWorkers=1','--fileParallelism=false'])
        entry['finishedAt']=now();entry['exitCode']=0 if entry['jobs'] and all(x['exitCode']==0 for x in entry['jobs']) else 1
        report['entries'].append(entry)
        (folder/'results.json').write_text(json.dumps(report,indent=2)+'\n')
        print(('PASS ' if entry['exitCode']==0 else 'FAIL ')+name+f' jobs={len(entry["jobs"])}',flush=True)
    if failures or any(x['exitCode']!=0 for x in report['entries']):bad(f'{kind.upper()}_FAILED:{failures}')
    print(f'{kind.upper()}_STAGE_COMPLETE:{len(report["entries"])}')

def verify(d,s,review_path):
    check();stable(s);web=arch_proof(d,s);full_build_proof(d,s)
    extras=stage_receipts(d,s,'extras',{p['name'] for p in stage_plan('extras')})
    none=stage_receipts(d,s,'no-test',{p['name'] for p in stage_plan('no-test')})
    extras_by={x['name']:x for x in extras['entries']}; none_by={x['name']:x for x in none['entries']}
    skipped=[];checked=0;fallback_files=0
    for p in MATRIX['packages']:
        name=p['name']
        if p['testScript']:
            if p['stage']=='architecture':
                log=d/(p['gate']+'.log')
                summary=({'totalFiles':web['filesDiscovered'],'skippedTests':web['testsSkipped'],'skippedFiles':web['filesSkipped']}
                      if name=='@gafus/web-vite' else parse_tests(log))
            else:
                job=extras_by[name]['jobs'][0]
                if job['label']!='test' or job['command']!=['pnpm','--filter',name,'test']:bad('EXTRA_COMMAND_MISMATCH:'+name)
                summary=parse_tests(d/job['log'])
            checked+=1
        else:
            e=none_by[name]
            wanted=['build',*(['typecheck'] if p['typecheckScript'] else []),*(['lint'] if p['lintScript'] else []),*(['direct-vitest'] if p['discoveredSourceTests'] else [])]
            if [j['label'] for j in e['jobs']]!=wanted:bad('NO_TEST_MISSING_BUILD_TYPECHECK_OR_DIRECT_TEST:'+name)
            cmds={'build':['pnpm','--filter',name,'build'],'typecheck':['pnpm','--filter',name,'typecheck'],'lint':['pnpm','--filter',name,'lint']}
            for j in e['jobs']:
                if j['label']!='direct-vitest' and j['command']!=cmds[j['label']]:bad('NO_TEST_COMMAND_MISMATCH:'+name)
            if not p['discoveredSourceTests']:continue
            j=e['jobs'][-1]
            want=['pnpm','exec','vitest','run','--config','vitest.config.ts',*p['discoveredSourceTests'],'--maxWorkers=1','--fileParallelism=false']
            if j['command']!=want:bad('DIRECT_TEST_FILE_LIST_MISMATCH:'+name)
            summary=parse_tests(d/j['log'])
            if summary['totalFiles']!=len(p['discoveredSourceTests']):bad('ORPHANED_TEST_FILES_UNCOUNTED:'+name)
            fallback_files+=len(p['discoveredSourceTests'])
        if summary['skippedTests'] or summary['skippedFiles']:
            skipped.append(dict(package=name,skippedTests=summary['skippedTests'],skippedFiles=summary['skippedFiles']))
    if checked!=57 or len(extras_by)!=31 or len(none_by)!=12 or fallback_files!=29:bad('COVERAGE_NOT_EXHAUSTIVE')
    approval='NOT_NEEDED' if not skipped else 'PENDING_REVIEW'
    if skipped and review_path:
        q=pathlib.Path(review_path);fresh(q,s);a=json.loads(q.read_text())
        if a.get('sessionId')!=s['id'] or a.get('sourceDigest')!=s['source']['digest'] or not a.get('approvedBy'):bad('SKIP_REVIEW_SCOPE_MISMATCH')
        expected={x['package']:(x['skippedTests'],x['skippedFiles']) for x in skipped}
        got={x['package']:(x['skippedTests'],x['skippedFiles']) for x in a.get('accepted',[])}
        if expected!=got or any(len(x.get('reason',''))<15 for x in a.get('accepted',[])):bad('SKIP_REVIEW_UNEXPLAINED_OR_INCOMPLETE')
        approval='REVIEWED_EXACT_COUNTS'
    report={'schema':'a3-postint-test-coverage-report-v1','runId':s['id'],'verifiedAt':now(),
      'sourceHash':s['source']['digest'],'archGates':33,'architecturePackageCount':26,
      'extraPackageCount':31,'directPackageTests':checked,'testlessPackageCount':12,
      'testlessPackagesWithDirectSourceTests':5,'separatelyDiscoveredSourceTestFiles':fallback_files,
      'packagesWithoutAnyOwnTests':7,'skipped':skipped,'skipReviewStatus':approval,
      'result':'PACKAGE_COVERAGE_PASS_WITH_KNOWN_7_NO_UNIT_TEST_GAPS' if approval!='PENDING_REVIEW' else 'UNREVIEWED_SKIPS_BLOCK_FULL_PASS',
      'overallProjectAcceptance':'NOT_ASSERTED: REALPG_CHAOS_A2_STAGING_CLOUDRU_BEGET_EXTERNAL_GATES_NOT_INCLUDED'}
    p=d/('a3-coverage-provisional.json' if approval=='PENDING_REVIEW' else 'a3-coverage-verification.json')
    if p.exists() and approval!='PENDING_REVIEW':bad('VERIFICATION_ALREADY_RECORDED_START_FRESH_ID')
    if approval=='PENDING_REVIEW':p.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    else:write_json(p,report)
    print('FRESH_57_PACKAGE_COVERAGE',json.dumps(report,ensure_ascii=False))
    if approval=='PENDING_REVIEW':bad('SKIP_REVIEW_REQUIRED_BEFORE_QUALIFIED_PACKAGE_PASS')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=('check','init','architecture','full-build','extras','no-test','verify'))
    parser.add_argument('--id')
    parser.add_argument('--review-skips')
    args=parser.parse_args();kind=args.action
    if kind=='check':print('MATRIX_69_57_12_MATCH',json.dumps(check()),'RUN_STATUS=NOT_RUN');return
    if kind=='init':
        check();no_secrets()
        run_id=args.id
        if not re.fullmatch(r'[a-z][a-z0-9-]{0,32}',run_id or ''):bad('NEW_RUN_ID_REQUIRED')
        d=LOG_ROOT/run_id
        if d.exists() or (LOG_ROOT/(run_id+'-web-chunks')).exists():bad('RUN_ID_ALREADY_HAS_RESULTS_REFUSE_HISTORICAL')
        snap=source_state();d.mkdir(mode=0o700)
        write_json(d/'a3-coverage-session.json',{'id':run_id,'createdAt':now(),'matrixSha':MATRIX_SHA,'repo':str(ROOT),'source':snap})
        print('FRESH_SESSION_CREATED',run_id,snap);return
    d,s=session(args.id)
    if kind=='architecture':
        stable(s);no_secrets()
        if (d/'a3-architecture-driver.json').exists() or (d/'results.tsv').exists():bad('ARCH_ALREADY_ATTEMPTED_NEW_ID_REQUIRED')
        startedAt=now();code=launch(['bash','scripts/qa/architecture-final-regression.sh',s['id']],d/'a3-architecture-driver.log')
        write_json(d/'a3-architecture-driver.json',{'id':s['id'],'startedAt':startedAt,'finishedAt':now(),'exitCode':code})
        if code!=0:bad('ARCH_DRIVER_FAILED:'+str(code))
        print('ARCH_DRIVER_EXIT_0_RESULTS_REQUIRE_VERIFY');return
    if kind=='full-build':
        arch_proof(d,s);stable(s);no_secrets()
        if (d/'a3-full-build-driver.json').exists() or (d/'a3-full-build-driver.log').exists():bad('BUILD_ALREADY_ATTEMPTED_NEW_ID_REQUIRED')
        cmd=['pnpm','exec','turbo','run','build','--force'];startedAt=now()
        code=launch(cmd,d/'a3-full-build-driver.log')
        write_json(d/'a3-full-build-driver.json',{'id':s['id'],'startedAt':startedAt,'finishedAt':now(),'exitCode':code,'command':' '.join(cmd)})
        if code!=0:bad('FULL_BUILD_DRIVER_FAILED:'+str(code))
        print('FULL_BUILD_ALL_WORKSPACES_EXIT_0');return
    if kind in ('extras','no-test'):do_stage(kind,d,s);return
    if kind=='verify':verify(d,s,args.review_skips);return

if __name__=='__main__':
    try:main()
    except Exception as e:print('COVERAGE_REJECTED',str(e),file=sys.stderr);sys.exit(2)
