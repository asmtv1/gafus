#!/usr/bin/env python3
"""Move historical agent handoffs into a local, checksum-verified, git-ignored archive.

Default mode is dry-run. Readonly discovery uses the 2026-10-29 cleanup ledger;
operational fixtures are preserved byte-identically, including known path relocations.
Historical JSON contracts and their pinned source hashes are not mutated.
"""
from pathlib import Path
from collections import Counter, defaultdict
from datetime import datetime, timezone
import argparse
import hashlib
import json
import os
import re
import subprocess

ROOT = Path('/Users/asmtv1/Desktop/gafus-refactor')
assert Path.cwd().resolve() == ROOT and (ROOT / '.git').is_dir(), 'GAFUS Refactor ONLY'
DOCS = ROOT / 'docs'
ARCHIVE = DOCS / 'archive' / 'agents'
LEDGER = DOCS / 'maintenance' / 'LEGACY_AGENT_REPORTS_CLEANUP_2026-10-29.md'
parser = argparse.ArgumentParser()
parser.add_argument('--apply', action='store_true')
parser.add_argument('--verify', action='store_true')
parser.add_argument('--resolve', metavar='OLD_PATH', help='Locate an original historical path from existing contracts')
args = parser.parse_args()
def sha(data):
    return hashlib.sha256(data).hexdigest()
def rel(p):
    return p.relative_to(ROOT).as_posix()
def list_50():
    text = LEDGER.read_text()
    section = text.split('## Сохранено в месте использования', 1)[1].split('## Заархивировано и удалено', 1)[0]
    return sorted([ROOT / s for s in re.findall(r'\x60([^\x60]+)\x60', section)])

targets = list_50()
assert len(targets) == 50, 'Expected 50 original records'
assert all(p.is_relative_to(ROOT) and not p.is_symlink() for p in targets)
keep = {
 'apps/api/G1_PRISMA_SHARED_BASELINE_MANIFEST.json',
 'apps/mobile/docs/refactor/AG3_G05_REAL_MOBILE_HONO_PG_AG3_DONE_V13_20261017.json',
 'apps/mobile/docs/refactor/AG3_G05_RESOURCE_DONE_CANONICAL_WEB_V1_20261017.json',
 'apps/web-vite/migration/AG2_PROFILE_HONO_SYNTHETIC_FIXTURES_20261018.json',
 'apps/web-vite/migration/AG2_REMINDER_V2_REAL_CHROME_INDEXEDDB_CAS_WEBLOCKS12_EVIDENCE_20261018.json',
 'apps/web-vite/migration/AG2_WEB_URL005_ACHIEVEMENTS_SOURCE_EVIDENCE_20261018.json',
 'apps/web-vite/migration/AG2_WEB_URL019_POST_DETAIL_SOURCE_EVIDENCE_20261018.json',
 'apps/web-vite/migration/AG2_WEB_URL024_PUBLIC_AUTHOR_PARITY_EVIDENCE_20261018.json',
 'apps/web-vite/migration/AG2_WEB_URL027_WALLET_SOURCE_EVIDENCE_20261018.json',
 'apps/web-vite/migration/G05_AG2_WEB_REAL_CONSUMER_DONE_R01_R06_20261017.json',
}
assert all(rel(ROOT / x) in [rel(p) for p in targets] for x in keep)
# Post-archive documentation relocation: preserve original manifest keys and immutable SHA-256.
# These are the only two intentionally relocated active historical receipts.
RELOCATED_RETAINED = {
 'apps/mobile/docs/refactor/AG3_G05_REAL_MOBILE_HONO_PG_AG3_DONE_V13_20261017.json':
     'docs/archive/agents/receipts/mobile-g05/AG3_G05_REAL_MOBILE_HONO_PG_AG3_DONE_V13_20261017.json',
 'apps/mobile/docs/refactor/AG3_G05_RESOURCE_DONE_CANONICAL_WEB_V1_20261017.json':
     'docs/archive/agents/receipts/mobile-g05/AG3_G05_RESOURCE_DONE_CANONICAL_WEB_V1_20261017.json',
}
assert set(RELOCATED_RETAINED).issubset(keep)
def preserved_location(original):
    return RELOCATED_RETAINED.get(original, original)


to_move = [p for p in targets if rel(p) not in keep]
assert len(to_move) == 40 and sum(p.suffix == '.md' for p in to_move) == 38
tracked = set(subprocess.run(['/usr/bin/git', 'ls-files', '-z'], cwd=ROOT, capture_output=True, check=True).stdout.decode(errors='replace').split('\x00'))
assert all(rel(p) not in tracked for p in to_move), 'Refuse to move Git-tracked content'

def manifest():
    assert (ARCHIVE / 'manifest.json').is_file()
    m = json.loads((ARCHIVE / 'manifest.json').read_text())
    assert m['format_version'] == 1 and len(m['moved']) == 40 and len(m['retained_in_workdirs']) == 10
    return m

if args.resolve:
    m = manifest()
    target = args.resolve.removeprefix('./')
    source = next((x for x in m['moved'] if x['original_path'] == target), None)
    if source is not None:
        print(source['archive_path'])
    elif any(x['original_path'] == target for x in m['retained_in_workdirs']):
        print(preserved_location(target))
    else:
        raise SystemExit('Not in this manifest; consult the earlier private 312-file archive')
    raise SystemExit(0)

if args.verify:
    m = manifest()
    for row in m['moved']:
        p = ROOT / row['archive_path']
        assert p.is_file() and sha(p.read_bytes()) == row['sha256'] and p.stat().st_size == row['bytes'], row['archive_path']
        assert not (ROOT / row['original_path']).exists(), row['original_path']
    for row in m['retained_in_workdirs']:
        p = ROOT / preserved_location(row['original_path'])
        assert p.is_file() and not p.is_symlink() and sha(p.read_bytes()) == row['sha256'] and p.stat().st_size == row['bytes'], row['original_path']
        if row['original_path'] in RELOCATED_RETAINED:
            assert not (ROOT / row['original_path']).exists(), row['original_path']
    paths = {row['original_path']:row for row in m['moved']}
    pinned = []
    def find_pinned(obj):
        if isinstance(obj, dict):
            for k,v in obj.items():
                if k in paths and isinstance(v,dict) and isinstance(v.get('sha256'),str):
                    yield (k,v['sha256'])
                yield from find_pinned(v)
        elif isinstance(obj, list):
            for v in obj:
                yield from find_pinned(v)
    for dirname, dirnames, filenames in os.walk(ROOT / 'apps'):
        dirnames[:] = [d for d in dirnames if d not in ('node_modules','dist','build','Pods','output','.cache')
                       and not d.startswith(('.ag','.admin','.chat2','.g16','.g1','.ag2','.ag3'))]
        for n in filenames:
            if not n.endswith('.json'):
                continue
            p = Path(dirname) / n
            try:
                if p.stat().st_size > 350000:
                    continue
                data = json.loads(p.read_text())
            except (OSError, json.JSONDecodeError):
                continue
            pinned.extend((str(p.relative_to(ROOT)),key,value) for key,value in find_pinned(data))
    errors = [(contract,source,pinned_hash) for contract,source,pinned_hash in pinned if paths[source]['sha256'] != pinned_hash]
    # One V1 contract pins an earlier version of its source. V1_1 pins the current content.
    older_pin = (
        'apps/api/g1-off021-v2-journal-local-v1/G1_OFF021_V2_TRAINING_JOURNAL_LOCAL.contract.v1.json',
        'apps/api/G1_AG1_OFF021_V2_JOURNAL_SOURCE_SCOPE_AG4_AG3_HANDOFF_20261017.md',
        'cc7745a30ea7e92129a3096d6209098b01cdeebad82066dec6ad9ddfea10b397',
    )
    assert errors == [older_pin], 'Unexpected archived historical contract SHA256 mismatch: '+str(errors[:3])
    print('HISTORICAL CONTRACT SHA256:',len(pinned)-len(errors),'matching archived bytes;',
          len(errors),'documented older version pin (unchanged)')
    print('ARCHIVE SHA256 VERIFIED:',len(m['moved']),'moved +',len(m['retained_in_workdirs']),'active fixtures')
    exit(0)

print('MODE', 'APPLY' if args.apply else 'DRY-RUN')
print('HISTORICAL DOCUMENTS TO MOVE:',len(to_move),'total bytes:',sum(p.stat().st_size for p in to_move))
print('ACTIVE TEST DATA TO KEEP:',len(keep))
for p in to_move[:8]:
    print('MOVE',rel(p),'->',rel(ARCHIVE / p.relative_to(ROOT)))
if not args.apply:
    exit(0)
assert not ARCHIVE.exists(), 'Archive already exists; refusing to overwrite'
assert all(p.is_file() for p in targets), 'Some original files are missing'
# Write verified byte-identical copies; only then remove source files.
ARCHIVE.mkdir(parents=True)
(ARCHIVE / '.gitignore').write_text('/apps/\n')
moved = []
for p in to_move:
    original_path = rel(p)
    data = p.read_bytes()
    dest = ARCHIVE / p.relative_to(ROOT)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open('xb') as f:
        f.write(data)
    assert dest.read_bytes() == data
    moved.append({'original_path':original_path,'archive_path':rel(dest),'sha256':sha(data),'bytes':len(data)})
retained = []
for s in sorted(keep):
    p = ROOT / preserved_location(s)
    data = p.read_bytes()
    retained.append({'original_path':s,'sha256':sha(data),'bytes':len(data),'reason':'Referenced by executable test/audit code: preserve path'})
for row in moved:
    p = ROOT / row['original_path']
    assert sha(p.read_bytes()) == row['sha256'], row['original_path']
# Move is strictly local to Refactor and all bytes are now mirrored.
for row in moved:
    (ROOT / row['original_path']).unlink()
m = {
    'format_version':1,
    'date':'2026-10-29',
    'policy':'Historical source contracts are immutable; their old source paths resolve via moved.original_path to moved.archive_path. SHA-256 is of unchanged file bytes.',
    'moved':moved,
    'retained_in_workdirs':retained,
    'earlier_archived_reports':'.local-pg-scratch/archives/legacy-agent-reports-20261029.tar.gz',
}
(ARCHIVE / 'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
backtick = chr(96)
readme = [
 '# Архив исторических отчётов агентов AG1–AG4',
 '',
 '**Исторические данные, не актуальная архитектура и не инструкции для запуска.**',
 'Текущую архитектуру см. в [docs/current](../../current/ARCHITECTURE.md), а актуальное состояние QA — в [CURRENT_RELEASE_STATUS](../../qa/CURRENT_RELEASE_STATUS.md).',
 '',
 'Материалы 16–23 октября 2026 перенесены из корней приложений сюда без изменения байтов. '
 'Первые 312 неподключённых отчётов находятся в локальном приватном архиве '
 +backtick+'.local-pg-scratch/archives/legacy-agent-reports-20261029.tar.gz'+backtick+'; '
 'ещё 40 файлов находятся в этом каталоге. ',
 '',
 '**Исторические контракты и зафиксированные в них хэши не переписывались:** '
 'их пути соответствуют исходному состоянию проекта. '
 'Таблица '+backtick+'manifest.json'+backtick+' отображает исходный путь в новое местоположение, '
 'при этом SHA-256 содержимого не изменился.',
 '',
 '10 JSON-файлов, используемых исполняемыми тестовыми или аудиторскими скриптами, оставлены '
 'на прежних местах и перечислены в '+backtick+'manifest.json'+backtick+'.',
 '',
 'Содержимое '+backtick+'apps/'+backtick+' здесь исключено из Git: исторические файлы могут содержать '
 'внутренние данные тестов. Не добавляйте их в коммиты без отдельной проверки.',
 '',
 'Проверка контрольных сумм:',
 '',
 backtick*3+'sh',
 'python3 scripts/docs/archive_agent_handoffs.py --verify',
 backtick*3,
 '',
 '## Перенесённые файлы',
 '',
]
for row in moved:
    target = row['archive_path'].removeprefix('docs/archive/agents/')
    readme.append('- ['+row['original_path']+'](./'+target+')')
readme += ['', '## Действующие тестовые входные данные, оставленные в исходных папках','']
for row in retained:
    readme.append('- '+backtick+row['original_path']+backtick)
(ARCHIVE / 'README.md').write_text('\n'.join(readme)+'\n')
print('MOVED',len(moved),'CHECKSUMS',len(moved),'COMPLETE')
