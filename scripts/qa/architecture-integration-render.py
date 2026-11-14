#!/usr/bin/env python3
"""Render machine-triaged A1/A3/A2 snapshots as human-readable file decisions.

Runs offline and writes ONLY docs/audit/ untracked handoff files. Do not use
suggested source decisions to overwrite a live tree without manual review.
"""
from __future__ import annotations
import csv
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
AUDIT=ROOT/'docs/audit'
DATA=json.loads((AUDIT/'gafus-agents-integration-triage-20261112.json').read_text())
PAYMENT_PATH=AUDIT/'gafus-agents-integration-payment-overlay-20261112.json'
PAYMENT=json.loads(PAYMENT_PATH.read_text()) if PAYMENT_PATH.exists() else None
R37_PATH=AUDIT/'gafus-agents-integration-a1-r37-coverage-20261112.json'
R37=json.loads(R37_PATH.read_text()) if R37_PATH.exists() else None
INVENTORY=json.loads((AUDIT/'gafus-agents-integration-inventory-20261112.json').read_text())
md=AUDIT/'gafus-agents-integration-file-matrix-20261112.md'
tsv=AUDIT/'gafus-agents-integration-file-matrix-20261112.tsv'


def clean(s):
    return str(s).replace('|','\\|').replace('\n',' ')


def level(entry):
    p=entry['path']; c=entry['category']
    if p in ('pnpm-lock.yaml','packages/prisma/schema.prisma'):
        return 'P0'
    if entry['kind']=='delete-vs-present':
        return 'P0'
    if c in ('consultation/transactions','courses/progress','security/boundaries','worker/cron','shared-contracts'):
        return 'P1' if p.endswith(('.test.ts','.test.tsx','.contract.test.ts')) else 'P0'
    if c in ('admin/routes','api/ports','core/policy','package/exports'):
        return 'P1'
    return 'P2'


special={
    'AUTO_REUSE_A1_VERIFIED_A3_FINAL_HUNK':'АВТО: A1 совпадает с финальной SHA A3; не копировать старый A3',
    'MANUAL_SEMANTIC_OR_OVERLAPPING_HUNKS':'РУЧНО: пересечение базовых hunks или критичный контракт',
    'MANUAL_BOTH_ADDED':'РУЧНО: оба файла появились без базового Git-объекта',
    'MANUAL_DELETE_VS_PRESENT':'РУЧНО: удаление/сохранение старого фасада',
    'AUTO_A1_ONLY_CHANGED_BASE':'АВТО: A3 остался базовым; брать A1',
    'AUTO_A3_ONLY_CHANGED_BASE':'АВТО: A1 остался базовым; брать A3',
    'CANDIDATE_DISJOINT_HUNKS_REVIEW':'РУЧНО ПРОВЕРИТЬ: независимые hunks по базовому тексту',
}

lines=[
 '# GAFUS: точная пофайловая матрица интеграции A1/A3/A2',
 '',
 f'Источник: `gafus-agents-integration-triage-20261112.json` от `{DATA["recordedAtUtc"]}`; исходный inventory `{DATA["inventoryObservedAt"]}`. Файловое содержимое проверено SHA-256; общее основание A1 и A3 `0dcd18c13`. **Ни один патч не применялся.**',
 '',
 '### Правила чтения',
 '',
 '- **АВТО** означает совпадение полного файла или доказанное соответствие финальной SHA A3 в текущем общем A1. Это *решение по выбору источника для будущего переноса*, а не выполненное слияние и не автоматическое принятие поведения.',
 '- **РУЧНО** — потенциальный трёхсторонний конфликт или новые файлы с различным содержимым; источник ниже — рекомендованная сторона, но требуется просмотр hunks и обязательный тест.',
 f'- Исходно было **99** отличающихся файлов, при следующем снимке 101, сейчас **{len(DATA["differentFiles"])}**. A1 продолжает работать; более ранние расхождения не считаются закрытыми без SHA-проверки. Из новых документальных различий — `docs/audit/core-server-bulk-progress-20261111.md` и `docs/audit/core-server-facade-baseline.json`. Ниже все различия **текущего** снимка + {len(DATA["deleteVsPresent"])} delete-vs-present.',
 f'- Вне матрицы ещё **{DATA["counts"]["matchedAutoWithoutConflict"]} побайтно совпадающих путей** и **{DATA["counts"]["deletedIdentically"]} одинаковых удалений** — кандидаты автоматического совпадения, но должны пройти общий QA. У 16 путей A2 отдельный приоритетный разбор.',
 '',
 '## Первая очередь: 16 пересечений с четырьмя A2-коммитами',
 '',
 '| Приоритет | Файл | Три стороны | Рекомендуемый источник/действие | Обязательная проверка |',
 '|---|---|---|---|---|',
]
for e in DATA['a2Prioritized']:
    lines.append(f"| {e['priority']} | `{clean(e['path'])}` | `{e['status']}` | {clean(e['preferredSource'])} | {clean(e['requiredVerification'])} |")
if PAYMENT:
    assert PAYMENT['fileCount']==18 and PAYMENT['A1CurrentFilesMatchManifest']
    lines.extend(['',
       '## Новая платёжная группа A1: 18 файлов, до финального архитектурного реестра',
       '',
       f'Источник: `gafus-agent-1-to-agent-2-payment-composition-20261112.json`, SHA-256 `{PAYMENT["paymentManifestSha256"]}`, снимок `{PAYMENT["manifestGeneratedAtUtc"]}`. Все **18/18 текущих after-SHA** сверены; удалённый Core Apple JWS отсутствует. **Прямые пересечения с P0 A2: {len(PAYMENT["directA2P0Paths"])}; с полными 16 A2: {len(PAYMENT["directA2CommittedPaths"])}; с финальными 39 A3: {len(PAYMENT["directA3FinalSetPaths"])}.** Риски косвенные: Prisma generator, lockfile, telemetry, Worker cron, admin ACL.',
       '',
       '| Статус | Файл A1 | Источник | Требуемая адресная проверка |',
       '|---|---|---|---|',
    ])
    for item in PAYMENT['files']:
        lines.append(f'| `{item["changeType"]}` | `{clean(item["path"])}` | {clean(item["sourceOfTruth"])} | {clean("; ".join(item["qaGateIds"]))} |')
    lines.extend(['',
       '**Важно:** четыре новых файла и одно удаление — часть одного связанного переноса. A3 старый worktree отличается от всех 18 платёжных файлов, но финальный manifest A3 не объявляет владельцем ни одного из них. А1 — единственный подтверждённый источник новой платёжной композиции. `before` SHA есть в резервном манифесте для 11 файлов; отсутствуют записи резервного манифеста для трёх исходных файлов (удалённый Apple JWS и два admin-users). Это не ставит под сомнение проверенные **18 after-SHA**, но восстановление именно этих before-файлов по данной резервной квитанции не доказано.',
       f'**Уточнение P0 Prisma на проверенном текущем коде:** A2 **committed** schema отличается от A1 не только `previewFeatures=["metrics"]`: в A1 есть отсутствующая в A2 committed модель `{", ".join(PAYMENT["P0SchemaAndLockVerifiedInputs"]["A1OnlyModelsMissingInA2Committed"])}` и новые поля `Chat2OutboxEvent` ({", ".join(PAYMENT["P0SchemaAndLockVerifiedInputs"]["A1OnlyOutboxFieldsMissingInA2Committed"])}). В A2 **working tree** схема совпадает с A1 плюс `metrics`, но это незакоммиченный соседний overlay, не источник для слепого переноса. Сохранить **все** A1 модели/поля/index и добавить **только** metrics feature из A2, затем проверить Prisma generate, Chat2 lease/fencing/DB и payment.',
       f'**P0 lockfile:** A1 и A2 committed различаются; A1 содержит `@gafus/subscription-payment-server` и ссылки на expo-modules-core, react-native-reanimated, compressor patches (их файлы существуют). После согласования всех package manifests нужна единая регенерация lock, а не копирование старого A2.',

       '',
       '### Восемь косвенных точек интеграции с A2/A3',
       '',
       '| Приоритет | Связанный файл | Решение | Минимальные группы QA |',
       '|---|---|---|---|',
    ])
    for crossing in PAYMENT['semanticCrossings']:
        lines.append(f'| {crossing["priority"]} | `{clean(crossing["relatedPath"])}` | {clean(crossing["decision"])} | {clean("; ".join(crossing["minimumGateIds"]))} |')
    lines.extend(['',
       'Полные команды QA (на **каждый** платёжный путь), точные SHA и missing-before-backup: `gafus-agents-integration-payment-overlay-20261112.json` и `.tsv`. Платёжная группа проверена адресно (Core 50, API 134, Worker 13, server 5), **но после неё не запускалась единая 33/5 регрессия**, а provider sandbox и isolated real PG payment concurrency ещё PENDING.',
       '',
    ])
if R37:
    assert R37['ratchet']=={'frozen':41,'current':37,'resolved':4,'newForbidden':0,'final':False}
    assert R37['uniquePaths']==49 and R37['manifestEntryCount']==51
    assert not R37['unaccountedNewA1Paths']
    lines.extend(['',
      '## A1 после двух новых кластеров — 37 оставшихся зависимостей (до финального реестра)',
      '',
      'Дополнительный машинный регистр: `gafus-agents-integration-a1-r37-coverage-20261112.json`, полная пофайловая матрица `gafus-agents-integration-a1-r37-matrix-20261112.tsv` (49 уникальных файлов + 6 companion-manifest documents). **Предыдущая интеграционная матрица A1/A3 не заменяется**: она отражает отдельный frozen снимок.',
      '',
      f'- **37 remaining**: frozen 41, 4 resolved, 0 new forbidden. Манифесты: payment 18, reminder 7, feature flags/subscription 26 = 51 записи / {R37["uniquePaths"]} уникальных путей; 2 audit-файла менялись в двух последовательных группах.',
      f'- **SHA_REQUIRED:** {R37["statusCounts"]["SHA_REQUIRED"]}; **REGENERATE_APPROVED_LOCK:** {R37["statusCounts"]["REGENERATE_APPROVED_LOCK"]}; **EXCLUDE_AUDIT_ONLY:** {R37["statusCounts"]["EXCLUDE_AUDIT_ONLY"]} файлов из манифестов и {len(R37["excludedCompanionDocs"])} companion-manifest docs с отдельными исходными SHA.',
      f'- Новые пути после предыдущего frozen inventory: {R37["newlyDirtyCount"]}; **unaccounted: {len(R37["unaccountedNewA1Paths"])}**.',
      f'- Пересечения с 6 P0 A2: **{", ".join(R37["A2P0DirectOverlaps"])}**. Прямые совпадения с A3 final-39: **{len(R37["A3FinalDirectOverlaps"])}**.',
      '- **Важные косвенные/ручные:** `apps/api/src/app.ts` (порядок install flags + subscription access перед route imports, сохранять A2 instrumentation), `packages/core/package.json`, `packages/types/src/index.ts`, `scripts/check-core-server-boundary.mjs`. Для lockfile — ручная регенерация после всех package manifests; нельзя брать committed A2 lock или нарушать Expo/RN patches.',
      '',
      '| Файл A1 | Статус переноса | SHA/удаление | A2 P0 | A3 final |',
      '|---|---|---|---|---|',
    ])
    for rel,entry in R37['fileDecisions'].items():
        lines.append(f'| `{clean(rel)}` | `{entry["decision"]}` | `{(entry["sha256"] or "ABSENT")[:16]}` | {"да" if entry["a2P0Direct"] else "нет"} | {"да" if entry["a3FinalDirect"] else "нет"} |')
    for excluded in R37['excludedCompanionDocs']:
        lines.append(f'| `{clean(excluded["path"])}` | `EXCLUDE_AUDIT_ONLY` | `{excluded["sha256"][:16]}` | нет | нет |')
    lines.extend(['',
      'Принцип приёмки: каждый новый A1 путь должен иметь SHA в последнем манифесте или явный audit-only exclusion; источники и поле `newlyDirtyPaths` сравниваются механически. **Прежний payment-only preflight не достаточен:** нужен `gafus-agents-integration-preflight-policy-20261112-r37.json`, который требует ещё 7+26 записи и блокирует любую интеграцию без окончательного A1 реестра.',
      '',
    ])
lines.extend(['',
    '**P0 решение:** сначала `schema.prisma`, `pnpm-lock.yaml`, API operation-observability, logger telemetry, Prometheus config и alerts; это нельзя разрешать выбором `ours/theirs` для файла целиком. Для `pnpm-lock.yaml` пересчитать от согласованного набора package manifests, не копировать A1/A3/A2 слепо.',
    '',
    '## 5 delete-vs-present: выбрать A1-архитектурную границу, но проверить контракт',
    '',
    '| Приоритет | Файл | Состояние сторон | Рекомендуемый источник | Проверка |',
    '|---|---|---|---|---|',
])
for e in DATA['deleteVsPresent']:
    state=f"A1 {'отсутствует' if e['sourceFileMissing']['A1'] else 'есть'}, A3 {'отсутствует' if e['sourceFileMissing']['A3'] else 'есть'}"
    lines.append(f"| {level(e)} | `{clean(e['path'])}` | {state} | {clean(e['preferredSource'])} | {clean(e['requiredVerification'])} |")
lines.extend(['',
    f'## {len(DATA["differentFiles"])} различных файлов: полный перечень с категорией/источником/проверкой',
    '',
    '| Приоритет | Категория | Файл | Решение | Рекомендуемый источник | Проверка после переноса |',
    '|---|---|---|---|---|---|',
])
for e in sorted(DATA['differentFiles'],key=lambda x:(level(x),x['category'],x['path'])):
    lines.append(f"| {level(e)} | `{clean(e['category'])}` | `{clean(e['path'])}` | {clean(special.get(e['classification'],e['classification']))} | `{clean(e['preferredSource'])}` | {clean(e['requiredVerification'])} |")
lines.extend(['',
    '## Окончательное условие принятия',
    '',
    'Эта матрица — **проект для будущего разрешённого локального объединения**. После появления финального манифеста агента 1 повторить `python3 scripts/qa/architecture-integration-inventory.py` и `python3 scripts/qa/architecture-integration-triage.py`, проверить `sourceSnapshotConsistentWithInventory=true`, затем повторно сгенерировать матрицу. Сохранять A1 ACL/ports/transactions, A3 worker/outbox/fencing и A2 метрики. До подтверждения внешних проверок Cloud.ru/Beget/OTLP/Alertmanager/нагрузка остаются `PENDING`.',
    '',
])
md.write_text('\n'.join(lines)+'\n')
with tsv.open('w',newline='') as f:
    wr=csv.writer(f,delimiter='\t')
    wr.writerow(['priority','kind','category','path','classification','preferred_source','required_verification','A1_sha256','A3_sha256','base_sha256'])
    for e in DATA['deleteVsPresent']+DATA['differentFiles']:
        wr.writerow([level(e),e['kind'],e['category'],e['path'],e['classification'],e['preferredSource'],
                     e['requiredVerification'],e['sha256']['A1'],e['sha256']['A3'],e['sha256']['base']])
assert len(DATA['a2Prioritized'])==16
assert len(DATA['differentFiles'])>=99
assert len(DATA['deleteVsPresent'])==5
assert len(lines)>100
print('INTEGRATION_MATRIX_RENDERED',md,'lines=',len(lines),'TSV_rows=',len(DATA['deleteVsPresent'])+len(DATA['differentFiles']))
