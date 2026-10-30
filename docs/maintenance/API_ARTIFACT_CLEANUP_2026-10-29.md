# Адресная очистка `apps/api` — 29 октября 2026

Рабочая копия: только `gafus-refactor` (ветка `vite`). Production, Main, базы данных, секреты, исходный код `apps/api/src`, Git staging/push не затрагивались.

## Методика

- Сопоставлены пути с отслеживаемыми Git файлами, исходниками API, Mobile/Web, тестами, пакетами, скриптами, конфигурацией CI и актуальными справочниками. Директории, от которых зависят активные либо opt-in сценарии, сохранены.
- Для кандидатов подтверждены отсутствие Git-tracked файлов, ссылок из исходников/активных сценариев, открытых процессов, файлов баз данных/дампов/медиа/секретов.
- Каталог `.g16-gallery-db-ag4-20261017` — **не PostgreSQL**, а изолированный Prisma Client с бинарными движками, логами и snapshot миграций. Все 141 файла в копии `migrations` побайтно (SHA-256) совпали с `packages/prisma/migrations` (140 папок); новых миграций там не было.
- `apps/api/dist` и `node_modules` оставлены как стандартные генерируемые окружения, `src`, `scripts`, `__tests__` и конфигурации сборки не удалялись.

## Физически удалено

**42 исторических каталога и отдельная неиспользуемая QA-конфигурация**, всего 2670 файлов (~86.76 MiB логического размера): старые stdout/stderr/exit, снимки HTTP-ответов, одноразовые mjs и SQL review-only, временные compiled JavaScript, устаревшие изолированные Prisma binaries. Никаких данных из canonical migrations не удалено.

| Каталог | Файлов | Размер, КиБ |
|---|---:|---:|
| `.chat2-avatar-verify-20261027/` | 2 | 1891.8 |
| `.chat2-verify-20261027/` | 2 | 1885.8 |
| `.g16-gallery-db-ag4-20261017/` | 189 | 78531.7 |
| `.g21-s03s04-ag1-local-20261017/` | 19 | 8.8 |
| `.guest-cleanup-private-build-20261026/` | 2 | 1524.5 |
| `g1-achievements-entitlement-v1/` | 48 | 26.0 |
| `g1-admin-json-v1/` | 23 | 11.3 |
| `g1-booking-readback-source-v1/` | 125 | 88.2 |
| `g1-booking-realpg-v1/` | 48 | 49.3 |
| `g1-daily-course-get-readonly-v1/` | 191 | 648.7 |
| `g1-feed-author-producer-v1/` | 105 | 675.4 |
| `g1-g03-username-privacy-error-delta-v1/` | 43 | 144.0 |
| `g1-g03-username-producer-current-v1/` | 45 | 112.5 |
| `g1-g05-web-consumer-v1/` | 128 | 487.7 |
| `g1-json-mutators-v1/` | 21 | 16.1 |
| `g1-native-offline-sync-realpg-v1/` | 105 | 231.2 |
| `g1-native-offline-sync-wire-v1/` | 47 | 59.2 |
| `g1-notif050-realpg-v1/` | 24 | 16.1 |
| `g1-notif050-v1/` | 7 | 7.6 |
| `g1-off021-esm-normal-startup-v1/` | 26 | 123.0 |
| `g1-off021-journal-gate-v1/` | 37 | 70.4 |
| `g1-off021-journal-realpg-acceptance-v1/` | 50 | 99.0 |
| `g1-off021-journal-schema-proposal-v1/` | 2 | 4.3 |
| `g1-off021-prevention-v2-acceptance-v1/` | 110 | 128.5 |
| `g1-off021-reward-gafus-ack-proposal-v1/` | 24 | 57.6 |
| `g1-off021-v3-cas-realpg-v1/` | 29 | 56.5 |
| `g1-off021-video-position-source-v1/` | 93 | 157.5 |
| `g1-pet-profile-v35-v36-20261018/` | 14 | 21.6 |
| `g1-prisma-isolation/` | 8 | 20.2 |
| `g1-profile-hono-v1/` | 9 | 12.6 |
| `g1-subscription-snapshot-v1/` | 28 | 68.1 |
| `g1-vet-visit-detail-review-v1/` | 117 | 102.9 |
| `g1-wallet-producer-v1/` | 31 | 75.4 |
| `g1-wallet-read-audit-v1/` | 14 | 9.5 |
| `g15-chat-contract-v1/` | 246 | 339.1 |
| `g15-jwt11-privacy-evidence-20261017/` | 12 | 22.0 |
| `g16-gallery-contract-v1/` | 77 | 116.0 |
| `g20-vk-browser-contract-v1/` | 135 | 180.4 |
| `g21-excuses-contract-v1/` | 127 | 185.9 |
| `w1-email-change-contract-v1/` | 178 | 304.1 |
| `w1-fourpost-auth-origin-contract-v1/` | 56 | 147.3 |
| `w1-password-g02-contract-v1/` | 72 | 129.3 |
| `.guest-cleanup-build-20261026.config.ts` | 1 | 0.3 |

## Сохранено намеренно

- `apps/api/.g1-g03-username-producer-ag1-20261017/` — данные, исходники или снимки, используемые opt-in тестами, source-only проверками либо скриптом контроля архивных SHA.
- `apps/api/.g1-off021-real-http-e2e-ag1-20261017/` — данные, исходники или снимки, используемые opt-in тестами, source-only проверками либо скриптом контроля архивных SHA.
- `apps/api/.g16-gallery-ag1-isolated-20261017/` — данные, исходники или снимки, используемые opt-in тестами, source-only проверками либо скриптом контроля архивных SHA.
- `apps/api/g1-g03-username-realpg-v1/` — данные, исходники или снимки, используемые opt-in тестами, source-only проверками либо скриптом контроля архивных SHA.
- `apps/api/g1-g05-mobile-consumer-v1/` — данные, исходники или снимки, используемые opt-in тестами, source-only проверками либо скриптом контроля архивных SHA.
- `apps/api/g1-g05-pet-create-source-v1/` — данные, исходники или снимки, используемые opt-in тестами, source-only проверками либо скриптом контроля архивных SHA.
- `apps/api/g1-off021-v2-journal-local-v1/` — данные, исходники или снимки, используемые opt-in тестами, source-only проверками либо скриптом контроля архивных SHA.


## Проверка после уборки

- Пересчитать размер `apps/api` и выполнить `git diff --check`.
- Запустить `@gafus/api` typecheck/build и безопасные тесты из `apps/api/src` без включения real-PG/prod env.
- Не удалять оставшиеся фикстуры без переноса контрактов и обновления тестов.

Никаких действий с `gafus1`, production, Cloud.ru и push не выполнялось.

## Дополнительная очистка внутри сохранённых фикстур

Удалено **508** одноразовых файлов с суффиксами `.stdout`, `.stderr`, `.exit`, `.pid` из восьми сохранённых каталогов (в сумме ~308 КиБ). Проверено отсутствие прямых ссылок на эти имена из активных исходников, скриптов и актуальных документов; Git их не отслеживал. JSON capture, `.sql`, `.ts`, `.mjs` и другие проверочные материалы не трогались.

## Фикстуры тестов перенесены в поддерживаемое место

Из `apps/api/g1-reminder-idempotency-review-v1` перемещены четыре единственные нужные source-only тестам файла (SQL исключительно REVIEW_ONLY, patch, JSON contract, mjs gate) в `apps/api/src/test/fixtures/reminder-review/`. Исправлены строки путей в двух `g1-reminder-*.test.ts`. Остальные **96** устаревших файлов этого каталога (~877 КиБ) удалены, сам каталог ликвидирован. Эти 4 фикстуры теперь не подпадают под игнорирование агентских root-каталогов, поэтому доступны для будущего добавления в Git после review.

## Final checks and portability (after additional cleanup)

- Seven legacy opt-in/capture directories remain; the eighth (reminder review) was eliminated after moving its 4 required text fixtures into `apps/api/src/test/fixtures/reminder-review/`.
- `@gafus/api typecheck`: PASS. `@gafus/api build`: PASS.
- After moving fixtures and removing generated logs: 49/49 PASS across five targeted API test files (Reminder/Gallery/G05). No production or real-PG tests executed.
- Generated code references were refreshed with `python3 scripts/docs/generate_reference.py`; the regenerated ENV_NAMES index contains zero broken `apps/api` paths.
- `git diff --check`: PASS.
- `apps/api` went from about 105 MiB to 9.2 MiB. In total 3,274 temporary/old files were deleted; 4 required source-only test fixtures were moved, not deleted.
- Four new fixtures and their test files must be included deliberately in a future commit; no Git staging, push, merge or deployment has been done.
- Project-wide release readiness remains NO pending the separate QA and security gates.
