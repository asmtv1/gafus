#!/usr/bin/env python3
"""Conservative cleanup in GAFUS Refactor only. Dry-run by default."""
import argparse
import os
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REQUIRED = Path('/Users/asmtv1/Desktop/gafus-refactor')
if ROOT != REQUIRED or not (ROOT/'.git').is_dir():
    raise SystemExit('REFUSED: this script is scoped exclusively to GAFUS Refactor')
parser = argparse.ArgumentParser()
parser.add_argument('--apply',action='store_true',help='delete listed stale generated artifacts')
args=parser.parse_args()
CUTOFF=datetime(2026,10,27).timestamp()
protected={'PG_VERSION','.env','.env.local','.env.production','postmaster.pid'}
protected_ext={'.sqlite','.sqlite3','.db','.dump','.bak','.sql','.key','.pem','.p12'}
candidates=[]
preserved=[]
def size(path):
    if path.is_file():return path.stat().st_size
    total=0
    for cur,dirs,files in os.walk(path,followlinks=False):
        for name in files:
            f=Path(cur)/name
            if not f.is_symlink():
                try:total+=f.stat().st_size
                except OSError:pass
    return total
def keep_data(path):
    if path.is_symlink():return True
    if path.is_dir():
        for cur,dirs,files in os.walk(path,followlinks=False):
            for name in files:
                p=Path(cur)/name
                if name in protected or p.suffix.lower() in protected_ext:return True
    return False
def add(p,why):
    if not p.exists() or p.is_symlink():return
    try:
        rp=p.resolve().relative_to(ROOT)
    except ValueError:raise SystemExit('REFUSED out-of-project path '+str(p))
    if any(x in {'.git','.local-pg-scratch','.ag1-course-pg','node_modules','gafus dump','secrets','docker-data','Pods'} for x in rp.parts):
        preserved.append((p,'protected location'));return
    if keep_data(p):
        preserved.append((p,'database/dump/secret marker'));return
    candidates.append((p,why,size(p)))
# Old per-design generated bundles/screenshots; preserve nested database clusters.
design=ROOT/'.design-verify'
if design.is_dir():
    for p in design.iterdir():
        if p.stat().st_mtime<CUTOFF:add(p,'stale design-verify artifact')
        else:preserved.append((p,'recent QA file'))
# Safe, regenerable root caches (not browser profiles/QA logs)
for name in ('.turbo','.cache'):
    add(ROOT/name,'regenerable root build cache')
# Old auth build logs, not doc-linked or live QA state.
for p in ROOT.glob('.auth-*-20261026.log'):
    add(p,'old root build log')
# Historical browser console logs before 2026-10-27; preserve all more recent QA evidence.
browser_artifacts=ROOT/'.local-browser-mcp/artifacts'
if browser_artifacts.is_dir():
    for p in browser_artifacts.rglob('console-*.log'):
        if p.is_file() and p.stat().st_mtime < CUTOFF and p.name[:18] < 'console-2026-10-27':
            add(p,'stale browser console log (old QA output)')
# Finder metadata outside protected runtime directories
add(ROOT/'.DS_Store','Finder metadata (root)')
for section in ('docs','scripts','apps','packages','infra','docker','output','assets','ci-cd','ios','.github'):
    top=ROOT/section
    if not top.is_dir():continue
    for cur,dirs,files in os.walk(top):
        dirs[:]=[d for d in dirs if d not in {'node_modules','Pods','.terraform','.git','dist','.local-pg-scratch'} and not d.startswith('.ag')]
        if '.DS_Store' in files:add(Path(cur)/'.DS_Store','Finder metadata')
print('Scope:',ROOT)
print('Mode:','APPLY' if args.apply else 'DRY-RUN')
print('Deletion candidates:',len(candidates),'bytes:',sum(x[2] for x in candidates),'MiB:',round(sum(x[2] for x in candidates)/1048576,1))
print('Protected from design sweep:',len(preserved))
print('Largest:',[(str(p.relative_to(ROOT)),round(sz/1048576,1)) for p,_,sz in sorted(candidates,key=lambda x:x[2],reverse=True)[:9]])
if args.apply:
    failures=[]
    for p,why,n in candidates:
        try:
            if p.is_dir():shutil.rmtree(p)
            else:p.unlink()
        except Exception as e:failures.append((str(p.relative_to(ROOT)),str(e)))
    print('Deleted successfully:',len(candidates)-len(failures),'failed:',len(failures))
    for p,e in failures[:20]:print('FAILED',p,e)
    if failures:raise SystemExit(2)
