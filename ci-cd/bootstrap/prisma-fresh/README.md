# Выбран вариант A: versioned fresh-only bootstrap v1 (04.11.2026)

**Решение владельца: A утверждён для новых установок.** Реализованный и локально проверенный путь ограничен **абсолютно новой собственной PostgreSQL 18 на `127.0.0.1`**. Никакой запуск на production, staging, Cloud.ru или существующей БД в рамках этой задачи не выполнен и не разрешён. Ни одна из 163 исторических миграций не изменена. Старый раздел ниже описывает путь разработки кандидата ДО решения и оставлен ради аудита.

## Контракт первой установки и дальнейших миграций

1. Неизменяемый bootstrap `gafus-fresh-v1`: `schema.v1.prisma` (снимок текущей исходной схемы), `fresh-only-bootstrap.candidate.sql` (186 таблиц, 65 CHECK, 12 триггеров, 9 собственных функций + функции `uuid-ossp`, 9 дополнительных исторических индексов, 6 системных singleton rows), `inventory.review.json` и `fresh-v1.lock.json` с SHA256 исходных SQL-файлов. Суффикс `.candidate.sql` оставлен **для совместимости с уже проверенным артефактом** и замороженным SHA; текущий способ использования выбирается версионированным installer, а не именем SQL-файла.
2. Установщик `fresh-v1-installer.mjs` сначала проверяет строгий URL, UTF8, PG18, адрес `127.0.0.1`, собственную QA-роль, *полностью пустую* БД и версии всех 163 baseline-миграций, текущий source и его точную temporary копию. SQL precondition и bootstrap выполняются в **одной** транзакции. Если БД уже имеет пользовательские объекты или `_prisma_migrations`, он отказывается **до DDL и journal writes**.
3. После создания полной структуры **только в НОВОЙ БД** штатно выполняется `prisma migrate resolve --applied <name>` для **ровно 163** неизменённых исторических миграций. Скрипт не выполняет ручные `INSERT` в `_prisma_migrations`. Он проверяет реальные 163 пары `migration_name`/SHA256, дату завершения и отсутствие rollback.
4. Все новые папки миграций **позже** `20261103180000_step_multiple_video_urls` считаются **forward migrations**, не маркируются выполненными: `prisma migrate deploy` применяет их по порядку, а `migrate status` подтверждает актуальную историю. Последняя проверка сверяет контрольные суммы и `finished_at` каждой применённой новой миграции. **Сам v1 snapshot остаётся неизменным, даже если текущая `schema.prisma` позже изменится.** Если schema изменена, но нет ни одной новой forward migration, blocking CI source gate выдаёт отказ.
5. Если процесс прерван после части `migrate resolve`, **не повторяйте установку поверх этой БД**. Отдельно утилизируйте только свою одноразовую новую БД и создайте новую пустую; existing DB/recovery/production никогда не исправляются автоматически.

## Как проверить и использовать только на локальной новой базе

```sh
cd /Users/asmtv1/Desktop/gafus-refactor
# Always source-only, blocking in `.github/workflows/ci-cd.yml` -> security:
node ci-cd/bootstrap/prisma-fresh/fresh-v1-source-gate.mjs
node --test ci-cd/bootstrap/prisma-fresh/fresh-v1-installer.contract.test.mjs
# Read-only resource probe (does not start PG):
node ci-cd/bootstrap/prisma-fresh/verify-owned-baseline-pg18.mjs
# Real one-shot E2E with OWN ephemeral PG18 and automatic OWN-only cleanup:
node ci-cd/bootstrap/prisma-fresh/verify-owned-baseline-pg18.mjs --run
```

Для установки в **заранее вручную созданную свою НОВУЮ localhost-БД** (она останется существовать, unlike ephemeral E2E) предусмотрен отдельный manual opt-in `install-fresh-v1-owned-local.mjs`. Требуется собственная случайная QA-роль `qa_<32hex>`, база `archqa_fresh_<12hex>`, нестандартный порт (не `5432`), PostgreSQL 18 UTF8, пустой `public`, **без пароля/удалённого адреса** и явное совпадение подтверждённого имени БД. Ни одна переменная `DATABASE_URL` production по умолчанию не используется. Пример с подстановкой собственных данных:

```sh
NEW_DB_BOOTSTRAP=1 \
GAFUS_NEW_DB_BOOTSTRAP_URL='postgresql://qa_<32hex>@127.0.0.1:<nondefault-port>/archqa_fresh_<12hex>?schema=public' \
GAFUS_NEW_DB_CONFIRM_NAME='archqa_fresh_<12hex>' \
node ci-cd/bootstrap/prisma-fresh/install-fresh-v1-owned-local.mjs --apply
```

Этот путь не создаёт/не удаляет DB, а при отказе оставляет её нетронутой. Для реального нового сервера или удалённой managed PostgreSQL понадобится **отдельно утверждённый release adapter**, определяющий надёжное удостоверение новизны БД, роль, сетевой контур, restore/rollback и оператора. Отсутствие такого адаптера **не препятствует** локальному подтверждению выбора A и не даёт права переподключить этот установщик к production.

**CI:** Always-on `security` запускает новый `fresh-v1-source-gate.mjs` и unit contracts без DB/секретов; в начальной версии source gate также запускает исторические Python 14 contracts, а после появления forward migrations проверяет замороженный v1 и возрастающую последовательность новых папок. Настоящее E2E PostgreSQL18 пока подтверждается отдельной локальной `--run` проверкой; GitHub CI без нового push не перезапускался.

---

# GAFUS Prisma `P3018`: отдельный review-кандидат bootstrap для НОВОЙ БД

**Статус:** `REVIEW_READY_STATIC_AND_DISPOSABLE_PG18_PASS / NOT_APPROVED_FOR_DEPLOY` (03.11.2026). Этот каталог **не** является `packages/prisma/migrations`. Он **не заменяет** и не исправляет задним числом 163 применённые миграции. Папка не подключена к CI/CD deploy workflow. Никакой выбор production-стратегии не сделан.

## Что включено и зачем

| Артефакт | Назначение |
|---|---|
| `000-current-prisma-schema.candidate.sql` | Детерминированный `prisma migrate diff --from-empty --to-schema-datamodel ... --script`; **186 таблиц** и текущие Prisma enum/FK/default/indexes. Сгенерирован до этой работы, SHA256 зафиксирован в manifest. |
| `010-live-historical-invariants.candidate.sql` | Только актуальные из исторического SQL **9 функций, 12 триггеров, 65 CHECK, 9 дополнительных индексов, 1 extension**; сохраняет тело функций/триггеров и частичных индексов побайтно из **неизменённых** migration SQL. `AccountStorageCleanup` 2 `CHECK` эквивалентно восстановлены из latest `DO $guard$`. |
| `020-synthetic-singletons.candidate.sql` | **Шесть только статических записей**: `AccountDeletionCounter/global`, `AppSubscriptionSettings/default`, `RewardedAdSettings/default`, `CourseContentRevision/1`, `MobileAppReleasePolicy/default`, `AppFeatureFlag/mobile_rewarded_ads_ios`. Значения адаптированы к ТЕКУЩИМ столбцам и defaults; не импортируются пользователи, транзакции или персональные данные. |
| `fresh-only-bootstrap.candidate.sql` | Порядок 000 → 010 → 020; SQL для **только новой пустой** PostgreSQL, НИКОГДА не для существующей БД. Никакой записи `_prisma_migrations` и `migrate resolve`. |
| `inventory.review.json` | SHA256 исходной схемы и **163 неизменённых миграций**, точные имена/хэши каждого пропущенного из Prisma объекта, решения для **471 исторического активного индекса** (437 прежних имён совпадают с Prisma, 9 восстановлены, 22 относятся к удалённым таблицам и 3 к устаревшим колонкам), **34 top-level DML** и **18 DO** с документированным disposition. |
| `sql_inventory.py` / `assemble.py` / `test_contracts.py` | Read-only inventory, явная материализация **только** новых candidate-файлов, 14 контрактных тестов. PostgreSQL и S3 не используются. |
| `verify-owned-local-pg18.mjs` | **Выполненный реальный** fresh-only PostgreSQL 18.4 E2E на временном каталоге внутри QA scratch и случайном `127.0.0.1` порту. Без Docker, backup, existing databases, `migrate resolve`. Дисковый gate: **12 GiB available** (8 GiB резерв + 4 GiB запас для стенда). | |

### Откуда восстановлены критические функции/триггеры

- `20260812120000_add_app_subscription_promo_codes`: 3 функции + 3 триггера — неизменность идентичности промокодов, immutable promo event, price snapshot платежей.
- `20261010180000_smart_feed`: 1 функция + 1 триггер — синхронизация `UserProfile.cityKey`.
- `20261010200000_smart_feed_events`: 2 функции + 1 триггер — нормализация `Pet.breedKey`.
- `20261015020000_course_content_revision`: 1 функция + 5 statement-level triggers — атомарная инвалидация кэша курсов через singleton revision.
- `20261022153000_course_version_global_trigger`: 1 функция + 1 row-level trigger — увеличение `Course.version`; дополнительно восстановлен `Course_version_positive`.
- `20261027011000_chat2_media_deletion_ledger`: 1 функция + 1 триггер — запись `Chat2MediaDeletionIntent` внутри той же транзакции, включая каскадные SQL DELETE.
- `20260126000000` + `20260126010000`: extension `uuid-ossp`. Старые `INSERT...SELECT` для миграции существующих Notes **не выполняются** на пустой базе; extension остаётся для parity. Требуются соответствующие права bootstrap-роли.

### Правила/индексы, не представленные моделью Prisma

- **65 CHECK**: 63 именованных final-version условий из исторических миграций плюс `AccountStorageCleanup_status_check` и **последний** `AccountStorageCleanup_scope_check` с `questions/documents`. Таблица и все цитируемые колонки проверены против текущей структуры, истории dropped/replaced CHECK учтены.
- **9 дополнительных индексов**: `ConsultationBooking_slotId_active_key`, `AppSubscription_userId_provider_active_unique`, `AppSubscriptionEvent_providerEventKey_unique`, `AppSubscriptionEvent_idempotencyKey_unique`, `StepNotification_active_bound_unique`, `Chat2V2MediaTask_cleanup_pending_idx`, `PetDocument_petId_ownerId_idx`, `AppSubscription_provider_status_cancelAtPeriodEnd_currentPeriodEnd_idx`, `AppSubscriptionPayment_subscriptionId_status_succeededAt_idx`. 6 из них partial; совпадающие с Prisma 437 SQL index definitions не дублируются.
- **Исключения:** `Payment_userId_courseId_pending_key` и связанные с полностью удалённой `Payment` остальные индексы; `DiaryEntry_dayOnCourseId_idx`, `DiaryEntry_userId_dayOnCourseId_key` (ныне `dayId`), `Course_appleIapProductId_key` (этого поля нет). Не восстанавливать старые колонки ради индекса.

### Исторические seed/backfill решения

- **Шесть постоянных singleton seeds** записаны в актуальном виде. `AppSubscriptionSettings` использует текущие DB-дефолты тарифов **200/1465/1185/2470 RUB**, **7/30/30/30 дней**; `RewardedAdSettings` не пытается писать удалённые web-флаги, `dailyAdLimit=1`, `testMode=true`; `AppFeatureFlag` не открывает iOS review mode.
- `TrainerNoteStudent`, `TrainerNoteEntry`, `AppSubscriptionTrial`, `RewardedTargetAccess` — `INSERT ... SELECT` из **существующих пользовательских данных**; для новой пустой БД нет исходных строк. Выполнять их в bootstrap запрещено. Другие исторические UPDATE/DELETE, архивные DO data/DDL guards также не перепускаются; эффект актуальных настроек отражён в последней схеме и static seeds. Manifest содержит SHA256 и классификацию всех **34 top-level DML + 18 DO**. Внутренние SQL в сохранённых триггерах/функциях не являются top-level data-migration statements.
- `20260813180000` заменил старое `RewardedAdSettings_daily_limit_allowed (1,2,3)` на **0–100**. `20260813201000` заменил promo scope; `20261021135000` добавил ARTICLE в Gafus target check; `20261022190000` обновил NPD interval. Используются **последние** ограничения, не конфликтующие historical version-дубликаты.

## Проверки, которые можно безопасно запускать сейчас (без Docker/БД)

```bash
cd /Users/asmtv1/Desktop/gafus-refactor
PYTHONDONTWRITEBYTECODE=1 python3 ci-cd/bootstrap/prisma-fresh/assemble.py --verify
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s ci-cd/bootstrap/prisma-fresh -p 'test_*.py' -v
node ci-cd/bootstrap/prisma-fresh/verify-disposable-pg.mjs  # только df: отказ при нехватке места
```

### Реальное исполнение на полностью собственной PostgreSQL 18.4 — PASS

**03.11.2026, финальный прогон:** `node ci-cd/bootstrap/prisma-fresh/verify-owned-local-pg18.mjs --run` завершился **exit 0**; лог `.gafus-refactoring/architecture-qa-20261103-local/qa/fresh-bootstrap-own-pg18-behavior-v7.log`.

- При запуске реально свободно **48 877 492 KiB (~46,6 GiB)**; guard требует **12 582 912 KiB (12 GiB)**, резерв 8 GiB сохранён. Никакой очистки чужих образов/кеша.
- Использованы локальные **PostgreSQL 18.4 Homebrew binaries**, собственный `initdb` в `archqa_.../bootstrap/fresh-pg18-own-*`, случайный localhost TCP-port, SQL `UTF8` database encoding, собственный synthetic-username + database `archqa_fresh_*`. Existing local PG14/PG18 процессы/папки **НЕ тронуты**. После выполнения временный сервер корректно остановлен, удалён **только его собственный** каталог. Никакой production/cloud/SSH.
- Реальные PG каталоги: **186 tables, 65 CHECK constraints, 12 user triggers, 9 historical functions, 1 `uuid-ossp` extension, 9 extra active historical indexes, 6 static singleton rows**, `_prisma_migrations` **0**.
- **Prisma diff != empty, намеренно:** `prisma migrate diff --from-url ... --to-schema-datamodel ... --script` хочет удалить два **не описанных Prisma** исторических индекса: `AppSubscriptionPayment_subscriptionId_status_succeededAt_idx`, `PetDocument_petId_ownerId_idx`. Контракт разрешает **ТОЛЬКО** два названных `DROP INDEX` в *diff report* и **НЕ исполняет ни один из них**; любые иные SQL-команды в diff — FAIL. Нельзя писать «Prisma datamodel diff EMPTY» для итогового кандидата: он сознательно содержит extra raw SQL объекты.
- **Поведение реально проверено:** `UserProfile.cityKey`, `Pet.breedKey` заполняются SQL trigger; Course version и CourseContentRevision увеличиваются в одной транзакции, запрещённый version change и `ROLLBACK` не оставляют эффектов; промокод нельзя переименовать, state change требует правильную revision, promo event нельзя мутировать; payment amount/original snapshot неизменяем; два активных YOOKASSA subscription не могут сосуществовать; статус `CANCELED` освобождает частичный уникальный слот; webhook providerEventKey/idempotencyKey повторить нельзя (уже существующий Prisma unique index может сработать первым); Chat2Media direct delete создаёт intent, DONE intent переходит назад в PENDING при повторном удалении, rollback не пишет intent, FK cascade по Chat2Conversation пишет intents; невалидный RewardedAdSettings `dailyAdLimit=101` отклоняется; шестёрка seed записей может повторно применяться без сброса настроек и дублей.
- **Сборка семи образов не запускалась.** Это реальная database-only local acceptance, а не production backup/migration/journal, staging deploy, distributed race или полный video/CDN acceptance.

Отдельная попытка `verify-disposable-pg.mjs --run` завершилась до создания контейнера: cached `postgres:18-alpine` отсутствовал (`NO_CACHED_POSTGRES18`), Docker/registry не изменены. Сохранённая Docker-based команда остаётся опциональной, но **не является блокером** для выполненного Homebrew PG18 smoke.

**Воспроизведение (всё ещё только на новой собственной ephemeral БД):**

```bash
cd /Users/asmtv1/Desktop/gafus-refactor
PYTHONDONTWRITEBYTECODE=1 python3 ci-cd/bootstrap/prisma-fresh/assemble.py --verify
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s ci-cd/bootstrap/prisma-fresh -p 'test_*.py' -v
node ci-cd/bootstrap/prisma-fresh/verify-owned-local-pg18.mjs  # dry probe, без создания БД
node ci-cd/bootstrap/prisma-fresh/verify-owned-local-pg18.mjs --run  # только собственный fresh PG18, авто-cleanup
```

## До использования где-либо дальше

1. **Выполнено локально:** реальная fresh PostgreSQL 18 + negative SQL-guards, rollback, Chat2 cascade, `Course.version`, promo/payment immutable и seed re-apply. Для большей уверенности в релизе всё ещё желательно повторить в CI с отдельной ephemeral PostgreSQL и проверить `pg_dump/pg_restore` перед cutover.
2. Отдельно согласовать **проект миграционного bootstrap-механизма** для новых БД: candidate нельзя запускать на существующих production/staging схемах; `migrate resolve` пока **никогда не выполнялся** и не разрешён. Подтверждённая эквивалентность SQL не означает согласия на регистрацию migration history.
3. Прогнать parity на отдельной disposable БД с разрешённым структурным checkpoint, если нужен точный исторический prod parity. Не использовать реальные пользовательские данные без отдельного разрешения.
4. Для реального cutover/production необходимы отдельное решение пользователя по A/B и самостоятельное разрешение на deploy — данный кандидат ничего не пушит и не деплоит.

**Итог:** статически и реально на ephemeral PostgreSQL 18 проверенный review-ready кандидат, **NOT MIGRATION-READY** для существующей БД и **NOT PRODUCTION-READY**. Возвращать `READY=YES` запрещено.

## 2026-11-04: single-command read-only review gate (no database)

The candidate already passed **real behavior verification** on a fresh owned PG18 (`verify-owned-local-pg18.mjs --run`, evidence `fresh-bootstrap-own-pg18-behavior-v7.log`; 186 tables, 65 CHECK, 12 triggers, 9 funcs, six seeds, two intentional extra raw-index differences). Subsequent structural application-policy changes did not change `schema.prisma` or the 163 original migrations.

A new review entry point checks all SHA256s and the complete immutable set of 163 migration scripts, then runs the SQL assembler's deterministic `--verify`, Python static contracts and syntax checks. It **does not** open Postgres, mutate files, run migrations, or mark history applied:

```sh
cd /Users/asmtv1/Desktop/gafus-refactor
node ci-cd/bootstrap/prisma-fresh/review-gate.mjs
# PASS BOOTSTRAP_REVIEW_GATE migration_files=163 static_tests=14
# PASS source SHA256 locked ... no DB opened
```

When a reviewer needs *fresh behavioral proof* rather than the prior saved log, the only approved local command is:

```sh
node ci-cd/bootstrap/prisma-fresh/verify-owned-local-pg18.mjs  # read-only resource probe
node ci-cd/bootstrap/prisma-fresh/verify-owned-local-pg18.mjs --run
```

`--run` creates an independently verified, empty, isolated loopback PostgreSQL 18 cluster in its own temporary folder and cleans up only that cluster. It checks real trigger/function/CHECK/partial-index/seed semantics and fail-closed schema drift. The two raw `DROP INDEX` lines in the Prisma structural diff are **inspection only** and NEVER executed.

**Deployment decision remains OPEN.** Option A: a distinct fresh-only, empty-database bootstrap SQL entrypoint plus independently reviewed migration-journal inauguration; Option B: an approved clean checkpoint/baseline replacing long-term fresh setup after full parity review. Neither option may rewrite applied historical migrations, backfill an existing database by inference, or automatically call `migrate resolve --applied`. Production rollout, existing DB access and new Git push require separate authorization. A green local review gate is **not** migration activation.

## РЕШЕНИЕ ПОЛЬЗОВАТЕЛЯ 04.11.2026: Option A выбрана и реализована локально

**Этот раздел актуальнее прежних статусов выше**, относящихся к review-only SQL-кандидату до согласования. Пользователь утвердил A: версионированный fresh-only SQL bootstrap и штатную Prisma baseline history **исключительно для новой изолированной базы**. Production/Cloud, старые пользовательские БД, реальный перенос данных, push/deploy по-прежнему не разрешены.

### Зафиксированная версия v1

- `schema-v1.prisma` — побайтный frozen datamodel snapshot (SHA256 закреплён в `inventory.review.json`), исходная схема для baseline **v1**. Не менять вместе с будущей `packages/prisma/schema.prisma`.
- `000-current-prisma-schema.candidate.sql` + `010-live-historical-invariants.candidate.sql` + `020-synthetic-singletons.candidate.sql` → `fresh-only-bootstrap.candidate.sql` — неизменяемые в рамках v1 SQL: 186 tables, 65 CHECK, 12 triggers, 9 user functions, 9 raw indexes, `uuid-ossp`, 6 static singletons. Название `.candidate` сохраняется как историческая review-метка, содержимое и SHA не менялись; запуск теперь допустим **только** через защищённый локальный orchestrator.
- `inventory.review.json` — 163 исторических имен/SQL SHA256, manifest SHA256 v1. `review-gate.mjs`, `sql_inventory.py` и `assemble.py --verify` проверяют frozen **v1** без БД. SQL-инвентарь учитывает только историю до `20261103180000_step_multiple_video_urls`; следующие миграции считаются обычными forward migrations. Если добавлена миграция после baseline, текущая schema.prisma может эволюционировать; историческая схема `schema-v1.prisma` остаётся замороженной. Если текущая schema изменится **без** новой forward миграции, review gate откажет.

### Единственный исполняемый локальный путь новой БД

**До любой записи** новая DB должна быть абсолютно пустой, принадлежать явно указанному owner, иметь уникальное имя `gafus_fresh_*` или `archqa_fresh_*` (либо `gafus_fresh` для изолированного CI), находиться только на `127.0.0.1`/`localhost`, иметь явный порт и schema `public`, быть writable PostgreSQL 16–18, а `GAFUS_FRESH_BOOTSTRAP_CONFIRM` должен **в точности** совпадать с названием БД. Проброшенные через SSH порты production или внешние DB, даже если доступны через localhost, **запрещены операторским регламентом**. Удалённый/production запуск не предусмотрен кодом; для него необходим отдельный review и явное разрешение.

**Исключение только для GitHub CI:** при обращении к одноразовому сервису `postgres:16` через `localhost:5432` сервер видит Docker bridge (`172.16.0.0/12`), а не loopback. Проверка принимает такой адрес только при `GITHUB_ACTIONS=true`, явном `GAFUS_FRESH_CI_POSTGRES_SERVICE=github-actions-disposable-postgres-16`, роли `gafus_ci`, базе `gafus_fresh` и адресе клиента из той же Docker-подсети. Проверки пустоты, владельца, точного подтверждения, checksum и атомарного SQL остаются обязательными. Для любого локального запуска вне CI продолжает действовать строгая проверка loopback-адреса сервера.


```bash
cd /Users/asmtv1/Desktop/gafus-refactor
node ci-cd/bootstrap/prisma-fresh/review-gate.mjs
node ci-cd/bootstrap/prisma-fresh/apply-new-empty-db.mjs --check   # без БД и записей

# Только заранее созданная ОТДЕЛЬНАЯ пустая localhost-БД, без внешних данных:
export DATABASE_URL='postgresql://<own-local-owner>@127.0.0.1:55432/gafus_fresh_local_test?schema=public'
export GAFUS_FRESH_BOOTSTRAP_CONFIRM='gafus_fresh_local_test'
bash packages/prisma/scripts/bootstrap-fresh-postgres.sh
```

`bootstrap-fresh-postgres.sh` больше **не использует `prisma db push`**: он вызывает `apply-new-empty-db.mjs --apply`. Orchestrator выполняет locked `review-gate`, повторяет проверку пустоты в **одной PostgreSQL-транзакции** с полным SQL, проверяет 186/65/12/9 и `uuid-ossp`, затем **163 раза вызывает официальный `prisma migrate resolve --applied`**, сверяет каждую `migration_name` и checksum с историческим manifest. Только после этого запускается `prisma migrate deploy` на все **добавленные** после frozen v1 миграции, затем второй deploy (NOOP) и `migrate status`. Проверка schema drift разрешает только два специально задокументированных `DROP INDEX` в направлении `DB → Prisma schema` (эти DROP **никогда не выполняются**): `PetDocument_petId_ownerId_idx` и `AppSubscriptionPayment_subscriptionId_status_succeededAt_idx`.

**В случае отказа/обрыва после SQL или посередине 163 `resolve`:** состояние частичное; **запрещено** повторять bootstrap на той же БД или ручным SQL дописывать Prisma ledger. Изолированную новую тестовую БД пересоздаёт исключительно её владелец; existing/prod DB не очищать. Не запускать bootstrap при подозрении, что БД уже используется.

### Реальная изолированная проверка

```bash
node ci-cd/bootstrap/prisma-fresh/verify-option-a-pg18.mjs        # только ресурсный probe
node ci-cd/bootstrap/prisma-fresh/verify-option-a-pg18.mjs --run  # собственный временный PG18
node --test ci-cd/bootstrap/prisma-fresh/option-a.contract.test.mjs
```

`verify-option-a-pg18.mjs --run` создаёт собственный уникальный PostgreSQL 18-кластер в `.gafus-refactoring/architecture-qa-20261103-local/bootstrap/fresh-option-a-own-*`, запускает только localhost, проверяет wrong confirmation, непустую БД с enum и replay refusal, настоящую регистрацию **163/163** через Prisma + checksum parity, неизменность custom SQL и двойной deploy NOOP. После этого копирует **в отдельный временный каталог** все migrations, добавляет синтетическую будущую миграцию `20990101000000_archqa_fresh_forward_probe`, реально применяет её Prisma `migrate deploy` (ledger **164**) и повторяет deploy без дублей. Временный PG останавливается, удаляется **только свой** временный каталог. Нет доступа к production/чужим Docker ресурсам.

В CI security/job с сервисом `postgres:16` старый шаг `db push` заменён на locked SQL и official Prisma resolve с явным названием `gafus_fresh`. Есть source-only gate и договорные тесты. **Локальный PG18 PASS не означает, что удалённый GitHub Actions CI уже перезапущен или прошёл** — без отдельного push его текущий статус не изменится.

При будущей миграции: создать обычный timestamp-named SQL-файл **после** последнего frozen `20261103180000...`, обновить `schema.prisma`, пройти review gate и CI. Старую 163-миграционную историю и `schema-v1.prisma` не изменять. Если появятся новые custom-only SQL объекты, требующие нового разрешённого datamodel-diff исключения, требуется отдельное изменение guard с review; молча удалять исторические индексы запрещено.
