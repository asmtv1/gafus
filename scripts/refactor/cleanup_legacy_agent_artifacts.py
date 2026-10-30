#!/usr/bin/env python3
"""Clean unreferenced historical agent artifacts; preview is the default."""
from pathlib import Path
from collections import defaultdict
import argparse
import datetime
import os
import re
import shutil
import subprocess

R=Path(__file__).resolve().parents[2]
assert R == Path('/Users/asmtv1/Desktop/gafus-refactor') and (R/'.git').is_dir()
a=argparse.ArgumentParser()
a.add_argument('--apply',action='store_true')
args=a.parse_args()
threshold=datetime.datetime(2026,10,27).timestamp()
protected={'PG_VERSION','postmaster.pid','pg_control'}
protected_suffixes={'.dump','.bak','.pem','.key','.p12','.pfx'}
candidates=[]
for app in ('apps/admin-panel','apps/api','apps/mobile','apps/trainer-panel'):
 for d in (R/app).iterdir():
  if not d.is_dir() or not d.name.startswith(('.ag4','.admin2','.admin3','.ag2-tmp','.ag3-tmp','.g1-','.g16-','.guest-')):continue
  if d.is_symlink() or d.stat().st_mtime>=threshold:continue
  has_protected=False
  for path,dirs,files in os.walk(d,followlinks=False):
   for name in files:
    p=Path(path)/name
    if name in protected or name.startswith('.env') or p.suffix.lower() in protected_suffixes:
     has_protected=True;break
   if has_protected:break
  if not has_protected:candidates.append(d)
# Historical test/build logs at app roots only; never touch new QA captures.
for app in ('apps/api','apps/mobile','apps/trainer-panel','apps/web-vite'):
 for f in (R/app).iterdir():
  if not f.is_file() or f.is_symlink() or f.suffix!='.log':continue
  if not f.name.startswith(('.ag1-','.ag2-','.ag3-','.ag4-','.g1-')):continue
  if f.stat().st_mtime>=threshold:continue
  candidates.append(f)

processes=subprocess.run(['ps','-axo','command'],capture_output=True,text=True).stdout
skip={'node_modules','.git','.terraform','Pods','dist','build','.local-pg-scratch','.ag1-course-pg','.design-verify','.local-browser-mcp'}
names={p.name:p for p in candidates}
pat=re.compile('|'.join(re.escape(n) for n in sorted(names,key=len,reverse=True))) if names else None
refs=defaultdict(set)
if pat:
 for base in ('apps','packages','scripts','docs','infra','ci-cd','.github'):
  for path,dirs,files in os.walk(R/base):
   dirs[:]=[d for d in dirs if d not in skip and not d.startswith(('.ag','.admin','.chat2','.notes','.trainer','.guest','.g16','.g1','.ag2','.ag3'))]
   for name in files:
    f=Path(path)/name
    if f in candidates or f.suffix.lower() not in ('.js','.mjs','.cjs','.ts','.tsx','.json','.md','.py','.sh','.yml','.yaml','.sql','.toml'):continue
    try:
     if f.stat().st_size>500000:continue
     body=f.read_text(errors='replace')
    except OSError:continue
    for m in pat.finditer(body):refs[m.group(0)].add(str(f.relative_to(R)))
tracked=set(subprocess.run(['git','ls-files','-z'],capture_output=True).stdout.decode(errors='replace').split('\0'))
def tracked_path(p):
 rel=str(p.relative_to(R))
 return rel in tracked if p.is_file() else any(x.startswith(rel+'/') for x in tracked)
def size(p):
 if p.is_file():return p.stat().st_size
 total=0
 for cur,ds,fs in os.walk(p):
  for n in fs:
   f=Path(cur)/n
   try:
    if not f.is_symlink():total+=f.stat().st_size
   except OSError:pass
 return total
remove=[]
keep=[]
for p in candidates:
 blockers=[]
 if refs[p.name]:blockers.append('source references')
 if str(p) in processes:blockers.append('active process')
 if tracked_path(p):blockers.append('tracked source')
 if blockers:keep.append((p,blockers))
 else:remove.append(p)
print('SCOPE:',R,'MODE:',('APPLY' if args.apply else 'DRY-RUN'))
print('CANDIDATES:',len(candidates),'REMOVE:',len(remove),'KEEP:',len(keep))
print('CANDIDATE BY TYPE: dirs',sum(x.is_dir() for x in remove),'logs',sum(x.is_file() for x in remove))
total=sum(size(p) for p in remove)
print('POTENTIAL SIZE MiB:',round(total/1048576,1))
for p in sorted(remove,key=size,reverse=True)[:15]:print('CANDIDATE',round(size(p)/1048576,1),p.relative_to(R))
for p,why in keep[:12]:print('KEEP',p.relative_to(R),','.join(why))
if args.apply:
 rows=['# Уборка архивов агентов — 29.10.2026','',
       'Область: только GAFUS Refactor. Сканировались имена используемых файлов в apps/packages/scripts/docs/infra/CI; вне этой области динамические ссылки теоретически возможны.',
       'Удалены только старые (до 27.10.2026) untracked каталоги/логи без прямых ссылок в текущих исходниках/тестах/документации и без совпадений с командами работающих процессов.',
       'Каталоги с PostgreSQL markers, дампами, .env или ключами были исключены до сканирования. Скрипты SQL не запускались.',
       '',f'Кандидатов: {len(candidates)}; удалено: {len(remove)}; сохранено из кандидатов: {len(keep)}; логический размер удаляемого: {total} байт.','','## Удалено','']
 rows.extend('- '+chr(96)+str(p.relative_to(R))+chr(96) for p in remove)
 rows.extend(['','## Сохранено по ссылкам/защите Git/активности',''])
 rows.extend('- '+chr(96)+str(p.relative_to(R))+chr(96)+' — '+', '.join(reasons) for p,reasons in keep)
 report=R/'docs/maintenance/LEGACY_AGENT_ARTIFACTS_CLEANUP_2026-10-29.md'
 report.parent.mkdir(parents=True,exist_ok=True)
 report.write_text('\n'.join(rows)+'\n')
 fail=[]
 for p in remove:
  try:
   if p.is_dir():shutil.rmtree(p)
   else:p.unlink()
  except Exception as e:fail.append((str(p.relative_to(R)),str(e)))
 print('REMOVED:',len(remove)-len(fail),'FAILURES:',len(fail))
 for p,e in fail[:15]:print('ERROR',p,e)
 if fail:raise SystemExit(2)
