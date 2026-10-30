#!/usr/bin/env python3
"""Archive and remove historical unreferenced agent handoff notes/receipts."""
from pathlib import Path
from collections import defaultdict, Counter
import argparse
import datetime
import hashlib
import io
import json
import os
import re
import subprocess
import tarfile

R=Path(__file__).resolve().parents[2]
assert R==Path('/Users/asmtv1/Desktop/gafus-refactor') and (R/'.git').is_dir()
p=argparse.ArgumentParser()
p.add_argument('--apply',action='store_true')
args=p.parse_args()
cutoff=datetime.datetime(2026,10,24).timestamp()
candidates=[]
for base in ('apps/api','apps/web-vite/migration','apps/mobile/docs/refactor','apps/trainer-panel','apps/admin-panel'):
 for f in (R/base).iterdir():
  if not f.is_file() or f.is_symlink() or f.stat().st_mtime>=cutoff:continue
  if base=='apps/api' and f.name.startswith(('G1_','G2_','G21_','AG1_','AG2_','AG3_','AG4_')) and f.suffix in ('.md','.json','.tsv'):candidates.append(f)
  elif base=='apps/web-vite/migration' and f.name.startswith(('G1_','AG2_','G05_')) and f.suffix in ('.md','.json'):candidates.append(f)
  elif base=='apps/mobile/docs/refactor' and f.name.startswith(('G1_','AG3_')) and f.suffix in ('.md','.json'):candidates.append(f)
  elif base=='apps/trainer-panel' and f.name=='AG4_G1_MATRIX.md':candidates.append(f)
  elif base=='apps/admin-panel' and f.name.startswith('AG4_') and f.suffix=='.exit':candidates.append(f)
tracked=set(subprocess.run(['git','ls-files','-z'],capture_output=True).stdout.decode(errors='replace').split('\0'))
refs=defaultdict(set);names={f.name for f in candidates}
if len(names)!=len(candidates):
 raise SystemExit('duplicate basenames: refuse ambiguous reference audit')
pattern=re.compile('|'.join(re.escape(n) for n in sorted(names,key=len,reverse=True))) if names else None
skip={'node_modules','.git','.terraform','Pods','dist','build','.local-pg-scratch','.ag1-course-pg','.design-verify','.local-browser-mcp'}
if pattern:
 for base in ('apps','packages','scripts','docs','infra','ci-cd','.github'):
  for path,dirs,files in os.walk(R/base):
   dirs[:]=[d for d in dirs if d not in skip and not d.startswith(('.ag','.admin','.chat2','.notes','.trainer','.guest','.g16','.g1','.ag2','.ag3'))]
   for name in files:
    f=Path(path)/name
    if f in candidates or f.suffix.lower() not in ('.js','.mjs','.cjs','.ts','.tsx','.json','.md','.py','.sh','.yml','.yaml','.sql','.toml'):continue
    try:
     if f.stat().st_size>500000:continue
     content=f.read_text(errors='replace')
    except OSError:continue
    for m in pattern.finditer(content):
     refs[m.group(0)].add(str(f.relative_to(R)))
removable=[f for f in candidates if not refs[f.name] and str(f.relative_to(R)) not in tracked]
protected=[f for f in candidates if f not in removable]
total=sum(f.stat().st_size for f in removable)
print('MODE', 'APPLY' if args.apply else 'DRY-RUN','CANDIDATES',len(candidates),'REMOVE',len(removable),'KEEP',len(protected),'SIZE MiB',round(total/1048576,2))
for base,qty in Counter(str(f.parent.relative_to(R)) for f in removable).items():print('GROUP',base,qty)
if args.apply and removable:
 archive=R/'.local-pg-scratch/archives/legacy-agent-reports-20261029.tar.gz'
 archive.parent.mkdir(parents=True,exist_ok=True)
 if archive.exists():raise SystemExit('ARCHIVE EXISTS: refuse to overwrite preexisting backup')
 # Read all inputs and stage the compressed archive before removing anything.
 with tarfile.open(archive,'w:gz') as tar:
  for f in sorted(removable):
   data=f.read_bytes()
   info=tarfile.TarInfo(str(f.relative_to(R)))
   info.size=len(data);info.mode=0o600
   tar.addfile(info,io.BytesIO(data))
 archive.chmod(0o600)
 with tarfile.open(archive,'r:gz') as tar:
  entries={x.name for x in tar.getmembers() if x.isfile()}
  expected={str(f.relative_to(R)) for f in removable}
  if entries!=expected:raise SystemExit('ARCHIVE VERIFY FAILED; no deletion')
 print('PRIVATE ARCHIVE VERIFIED:',archive.relative_to(R),'bytes',archive.stat().st_size,'files',len(entries))
 report=R/'docs/maintenance/LEGACY_AGENT_REPORTS_CLEANUP_2026-10-29.md'
 b=chr(96)
 lines=['# Сокращение одноразовых отчётов AG1–AG4 (29.10.2026)','',
        'В исходниках приложений найдены старые (до 24.10.2026) handoff/evidence/receipt документы. Неподключённые, неотслеживаемые Git файлы перенесены в приватный tar.gz (chmod 0600), оригиналы удалены.',
        'Архив находится в '+b+str(archive.relative_to(R))+b+'. Архив НЕ публиковать и не коммитить: отчёты могут содержать внутреннюю тестовую информацию.',
        'Удаление файлов выполнено только после подтверждения полного набора архивных записей. Важные файлы с обнаруженными прямыми ссылками оставлены.',
        f'Кандидатов {len(candidates)}, архивировано и убрано {len(removable)}, оставлено {len(protected)}, исходный размер {total} байт.','',
        '## Сохранено в месте использования','']
 lines.extend('- '+b+str(f.relative_to(R))+b for f in sorted(protected))
 lines.extend(['','## Заархивировано и удалено',''])
 lines.extend('- '+b+str(f.relative_to(R))+b for f in sorted(removable))
 report.write_text('\n'.join(lines)+'\n')
 for f in removable:f.unlink()
 print('FILES DELETED',sum(not f.exists() for f in removable),'PROTECTED',len(protected))
