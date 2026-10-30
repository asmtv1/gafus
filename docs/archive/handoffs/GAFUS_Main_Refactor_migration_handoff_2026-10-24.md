# GAFUS Main → GAFUS Refactor: восстановление migration sources и проверенные инварианты

**Дата:** 24.10.2026  
**Характер:** консультационный handoff; только источники Git, без операций над production и без изменения Refactor.  
**Источник:** `asmtv1/gafus`, `main` (просмотрен commit `dbbcee6437c190f3b3cfc256d93bf9a611627c28`).  
**Вход от координатора:** из дампа PostgreSQL 15.18 получен ledger с **143 `finished`**; в Refactor отсутствуют файлы трёх применённых миграций. Дополнительно объявлены два несовпадения checksum у одноимённых старых миграций. Сам dump и значения `checksum` из ledger в этой консультации не запрашивались и не читались.

> **ВАЖНО.** Ни один приведённый ниже `migration.sql` не предназначен для повторного исполнения на уже мигрированной БД. Это оригинальные SQL-исходники для сверки миграционной истории. Production не откатывать. Миграции Refactor и новые функции тестировать отдельно на изолированной базе.

## 1. Краткое резюме

| Migration ID | SQL есть в Main | В дампе указан applied? | Предмет изменения |
|---|---|---|---|
| `20261015170000_mail_attempt_correlation` | Да; полный SQL ниже | Да, по предоставленному ledger | Старые Resend idempotency keys сохраняют прежний формат сообщения |
| `20261021135000_gafus_article_access` | Да; полный SQL ниже | Да, по предоставленному ledger | Временный доступ к отдельно взятой статье за гафусы |
| `20261022190000_npd_30_day_plan_intervals` | Да; полный SQL ниже | Да, по предоставленному ledger | Принять текущие 30-дневные тарифы в НПД, сохраняя чеки прежних 14/90-дневных тарифов |

При переносе файла из Main в историю Refactor **проверять точное содержимое и SHA-256 относительно соответствующего `_prisma_migrations.checksum`**. Одинаковое имя миграции само по себе не гарантирует одинаковый SQL.

## 2. Три отсутствующих в Refactor оригинальных `migration.sql`

Содержимое нижеприведённых SQL-блоков **побайтно сверено с Git blob исходного файла в Main** (UTF-8, включая завершающие переводы строки). В блоках — полный текст, а не пересказ.

### 2.1. Resend mail correlation / совместимость старых попыток

**Migration ID:** `20261015170000_mail_attempt_correlation`  
**Git-добавление:** 17.10.2026, [`c31f4c09b0`](https://github.com/asmtv1/gafus/commit/c31f4c09b0577fb1e1e7ad60327755d120075c56)  
**Путь назначения в истории Prisma:** `packages/prisma/migrations/20261015170000_mail_attempt_correlation/migration.sql`  
**[Оригинал Main](https://github.com/asmtv1/gafus/blob/dbbcee6437c190f3b3cfc256d93bf9a611627c28/packages/prisma/migrations/20261015170000_mail_attempt_correlation/migration.sql)**  
**SHA-256 оригинального `migration.sql`:** `11138826e61c56c4972ff78bed407f0f7cf288078c69d9eaaea7acfa419f26a6`  
**Git blob SHA-1:** `85097e20c2c9ec0bf4ac99c236c189989d7c12ca`; **байт:** 247

```sql
-- Preserve legacy request bodies for pre-existing Resend idempotency keys.
-- Only newly created attempts opt into correlation tags (version 1).
ALTER TABLE "TransactionalMailAttempt"
  ADD COLUMN "correlationVersion" INTEGER NOT NULL DEFAULT 0;
```

### 2.2. Gafus ARTICLE — временные права на статьи

**Migration ID:** `20261021135000_gafus_article_access`  
**Git-добавление:** 21.10.2026, [`bbe15e122e`](https://github.com/asmtv1/gafus/commit/bbe15e122ec7a22bd08b741f1bf05de7d038c2a1)  
**Путь назначения в истории Prisma:** `packages/prisma/migrations/20261021135000_gafus_article_access/migration.sql`  
**[Оригинал Main](https://github.com/asmtv1/gafus/blob/dbbcee6437c190f3b3cfc256d93bf9a611627c28/packages/prisma/migrations/20261021135000_gafus_article_access/migration.sql)**  
**SHA-256 оригинального `migration.sql`:** `606784fade4c23d30a80703629bc6add05115bccf9d919aa193098b72cbcaf72`  
**Git blob SHA-1:** `f68e388a9223f1ff92932909c25c211226f5c0ff`; **байт:** 714

```sql
-- Additive support for article purchases in the existing wallet ledger.
ALTER TYPE "GafusAccessTargetType" ADD VALUE IF NOT EXISTS 'ARTICLE';
ALTER TABLE "GafusTargetAccess" DROP CONSTRAINT "GafusTargetAccess_target_shape";
ALTER TABLE "GafusTargetAccess" ADD CONSTRAINT "GafusTargetAccess_target_shape" CHECK (
  ("targetType"::text = 'COURSE_STEP' AND "courseId" IS NOT NULL AND "dayOnCourseId" IS NOT NULL AND "stepOnDayId" IS NOT NULL)
  OR ("targetType"::text = 'MINI_GUIDE' AND "courseId" IS NOT NULL AND "dayOnCourseId" IS NULL AND "stepOnDayId" IS NULL)
  OR ("targetType"::text = 'ARTICLE' AND "courseId" IS NULL AND "dayOnCourseId" IS NULL AND "stepOnDayId" IS NULL AND "targetKey" LIKE 'article:%')
);
```

### 2.3. NPD 30-day — CHECK для старых и новых тарифов

**Migration ID:** `20261022190000_npd_30_day_plan_intervals`  
**Git-добавление:** 22.10.2026, [`d2876cf2e2`](https://github.com/asmtv1/gafus/commit/d2876cf2e26e0fd244542ff95c5ea0fcc6cc013f)  
**Путь назначения в истории Prisma:** `packages/prisma/migrations/20261022190000_npd_30_day_plan_intervals/migration.sql`  
**[Оригинал Main](https://github.com/asmtv1/gafus/blob/dbbcee6437c190f3b3cfc256d93bf9a611627c28/packages/prisma/migrations/20261022190000_npd_30_day_plan_intervals/migration.sql)**  
**SHA-256 оригинального `migration.sql`:** `b70b3f9878a165a89e206da50524e0ccd71377375ad07bace8e30762b3ea258b`  
**Git blob SHA-1:** `c447899953eabdee7fe3a87044dbb0cd4cc82baa`; **байт:** 509

```sql
-- Preserve historical 14/90-day receipts while allowing the current
-- 30-day public Premium offers (billing codes are historical labels).
BEGIN;

ALTER TABLE "NpdReceipt"
  DROP CONSTRAINT "NpdReceipt_plan_interval_check";

ALTER TABLE "NpdReceipt"
  ADD CONSTRAINT "NpdReceipt_plan_interval_check" CHECK (
    ("planCode" = 'TWO_WEEKS' AND "intervalDays" IN (14, 30))
    OR ("planCode" = 'MONTHLY' AND "intervalDays" = 30)
    OR ("planCode" = 'THREE_MONTHS' AND "intervalDays" IN (30, 90))
  );

COMMIT;
```

## 3. Контракты Core и смысл миграций

### 3.1. `correlationVersion`: у старых попыток остаётся версия `0`

Создание таблицы: `20261011173000_resend_mail_journal`; новая колонка: `20261015170000_mail_attempt_correlation`.

Подтверждено по `packages/mailer/src/resend.ts` и `packages/core/src/services/mail/transactionalEmailLayout.ts`:

- `correlationVersion` — `INTEGER NOT NULL DEFAULT 0`. Значение `0` присвоено историческим попыткам без изменения их idempotency key.
- **Новые** `TransactionalMailAttempt` создаются кодом `upsert` с `correlationVersion: 1`. В версии `1` добавляется Resend tag `gafus_attempt` для корреляции webhook-событий с попыткой.
- **Существующая** попытка сохраняет записанную версию: `upsert` для неё использует `update: {}`. Повторное отправление с тем же idempotency key обязано сохранять тело прежнего запроса.
- Для `v0` `transactionalEmailLayout.ts` намеренно сохраняет legacy-вариант HTML и inline-logo/CID, когда это требуется старому запросу.
- Запрещена массовая нормализация исторических `correlationVersion=0` в `1`; это изменит содержание повторных отправок.

Источник Core: [Resend implementation](https://github.com/asmtv1/gafus/blob/main/packages/mailer/src/resend.ts), [mail layout](https://github.com/asmtv1/gafus/blob/main/packages/core/src/services/mail/transactionalEmailLayout.ts).

### 3.2. `GafusAccessTargetType.ARTICLE`: отдельное временное право, не подписка на все статьи

Предшествующая миграция `20261010190000_add_gafus_economy` создала enum с `COURSE_STEP` и `MINI_GUIDE`, а также таблицу `GafusTargetAccess`. Миграция `20261021135000_gafus_article_access` добавила в тот же enum `ARTICLE` и расширила SQL CHECK.

Подтверждённые ограничения:

- `ARTICLE`: `courseId`, `dayOnCourseId`, `stepOnDayId` должны быть `NULL`; `targetKey LIKE 'article:%'`.
- По Core-коду для статьи целевой ключ — именно `article:<id>`. SQL `LIKE` ограничивает только форму ключа, не создаёт FK на `Article`; наличие статьи проверяет Core.
- Разрешение дано только на **конкретную статью**, если `expiresAt > now`.
- Имеющий подписку или действующее право пользователь не должен списывать гафусы повторно.
- Цена статьи в текущем `accessGrantService.ts` использует `GafusSettings.courseStepCost` (по умолчанию один гафус), а длительность — `GafusSettings.accessDurationSeconds` (по умолчанию `604800` = семь дней).
- Транзакционное списание и создание права выполняются вместе; кошелёк пользователя блокируется на время мутации.
- `GafusTransaction.idempotencyKey` предотвращает повторное списание; повтор уже исполненного запроса не продлевает срок действия.
- `GafusTargetAccess.transactionId` уникален и связан с `GafusTransaction` через `ON DELETE RESTRICT`.

Код: [content access](https://github.com/asmtv1/gafus/blob/main/packages/core/src/services/contentAccess/index.ts), [unlock service](https://github.com/asmtv1/gafus/blob/main/packages/core/src/services/gafus/accessGrantService.ts), [policy](https://github.com/asmtv1/gafus/blob/main/packages/core/src/services/contentAccess/policy.ts).

### 3.3. НПД / 30 дней: точное соответствие SQL, Core и условиям ранее оформленных подписок

**Суть изменения:** `TWO_WEEKS` и `THREE_MONTHS` остались стабильными *billing codes* (для истории, checkout и существующих договоров), **но больше не равны длительности текущего тарифа**. Актуальные публичные предложения GAFUS Premium рассчитаны на 30 дней. Старые договоры и чеки на 14/90 дней не переписываются.

#### Предыстория

1. `20260828120000_add_npd_receipts` создала `NpdReceipt_plan_interval_check` в старой строгой форме:
   - `TWO_WEEKS` → ровно 14 дней;
   - `MONTHLY` → ровно 30 дней;
   - `THREE_MONTHS` → ровно 90 дней.
2. `20261004120000_subscription_agreement_terms` зафиксировала изначальные цены, интервалы и валюту у уже оформленных YooKassa-подписок (`AppSubscription.renewalPriceRub`, `renewalIntervalDays`, `renewalCurrency`, `planTitle`). Эти параметры **не заменяются задним числом** актуальным каталогом.
3. Та же миграция 04.10 выставила для новых настроек тарифов длительность **30 дней** и значения по умолчанию: `TWO_WEEKS` — 1185 ₽, `MONTHLY` — 1465 ₽, `THREE_MONTHS` — 2470 ₽. Это значения настроек/каталога по умолчанию, а не доказательство фактических цен отдельного пользователя или платежа.
4. Поэтому старый `NpdReceipt_plan_interval_check` препятствовал созданию НПД-чека с `TWO_WEEKS/30` либо `THREE_MONTHS/30`, хотя платёж по новому тарифу был корректным.
5. `20261022190000_npd_30_day_plan_intervals` меняет **только один CHECK**: допускает новую длительность, не отвергая исторические.

#### Итоговая матрица валидности NpdReceipt

| `planCode` | Поддерживаемые `intervalDays` | Что означает |
|---|---|---|
| `TWO_WEEKS` | **14 или 30** | 14 — исторический срок; 30 — нынешнее публичное предложение «Самостоятельный» |
| `MONTHLY` | **30** | «Поддержка в чате» |
| `THREE_MONTHS` | **30 или 90** | 90 — исторический срок; 30 — нынешнее публичное предложение «Полное сопровождение» |
| `WEEKLY` | **не проходит этот CHECK** | Старый billing code поддерживается в общей истории подписок, но не входит в перечисленные НПД-чеки |

Неизменное дополнительное ограничение `NpdReceipt_interval_days_check` по-прежнему допускает только `14, 30, 90`. **Миграция не меняет данные существующих чеков, сроки действующих подписок или платежи.**

#### Сопутствующие изменения Core в том же коммите `d2876cf2`

В `packages/core/src/services/appSubscription/npdReceiptService.ts` прежние жёстко привязанные к коду длительности заменены на whitelist:

```ts
const NPD_ALLOWED_INTERVAL_DAYS = {
  TWO_WEEKS: [14, 30],
  MONTHLY: [30],
  THREE_MONTHS: [30, 90],
} as const;
```

`ensureNpdReceiptForSucceededPayment(tx, paymentId)`:

1. Находит `AppSubscriptionPayment` и проверяет `provider === "YOOKASSA"`, `status === "SUCCEEDED"` и вид операции `INITIAL` или `RENEWAL`.
2. Проверяет `currency === "RUB"`, наличие email покупателя, корректную целую сумму в копейках, временные границы периода и дату успешного платежа.
3. Вычисляет **фактический** период из `periodEnd - periodStart`, округлённый до дней; проверяет его по whitelist соответствующего billing code.
4. Проверяет наличие `NpdConnection.fiscalizationStartedAt`, причём успешный платёж должен быть не раньше момента начала фискализации.
5. Внутри транзакции выполняет `npdReceipt.upsert` по **уникальному `paymentId`**; существующую запись не создаёт заново (`update: {}`).
6. Записывает `serviceName` из реальной длительности: `Подписка Gafus Premium на ${intervalDays} дней`. Это заменило жёсткие строки «на 14/30/90 дней», зависевшие только от кода тарифа.
7. Создаёт локальную операцию НПД `CREATE/PENDING`; **внешний НПД-провайдер не вызывается из платёжной транзакции** — дальнейшая отправка выполняется асинхронным обработчиком очереди.

При несоответствии условиям сервис возвращает `null` вместо постановки неверного чека. Изменение не разрешает произвольные длительности и не обходит остальные проверки.

В том же коммите расширены тесты:

- допустимые: `TWO_WEEKS/14`, `TWO_WEEKS/30`, `MONTHLY/30`, `THREE_MONTHS/90`, `THREE_MONTHS/30`;
- отклоняются: `TWO_WEEKS/90`, `MONTHLY/14`, `MONTHLY/90`, `THREE_MONTHS/14`.

`packages/core/src/services/appSubscription/plans.ts` независимо подтверждает стабильные коды и текущие 30-дневные предложения. Для пролонгации используется **сохранённый snapshot условий подписки**, а не подстановка новых каталоговых значений в старые договоры.

Полезные источники: [Core NPD receipt](https://github.com/asmtv1/gafus/blob/main/packages/core/src/services/appSubscription/npdReceiptService.ts), [NPD tests](https://github.com/asmtv1/gafus/blob/main/packages/core/src/services/appSubscription/__tests__/npdReceiptService.test.ts), [планы](https://github.com/asmtv1/gafus/blob/main/packages/core/src/services/appSubscription/plans.ts), [исходный CHECK от 28.08](https://github.com/asmtv1/gafus/blob/main/packages/prisma/migrations/20260828120000_add_npd_receipts/migration.sql), [snapshot договора от 04.10](https://github.com/asmtv1/gafus/blob/main/packages/prisma/migrations/20261004120000_subscription_agreement_terms/migration.sql).

#### Дополнительная особенность fresh-only bootstrap

В `packages/prisma/scripts/fresh-db-extras.sql` присутствует **итоговый**, расширенный `NpdReceipt_plan_interval_check` (14/30, 30, 30/90). Исторически свежий bootstrap строится иным путём, чем обычное применение всей старой цепочки миграций. Не надо использовать `fresh-db-extras.sql` для исправления существующего ledger и не надо применять SQL из блока выше повторно.

## 4. Два same-name checksum mismatch: история переписывания файлов подтверждена

Идентификаторы:

- `20241108120000_exam_result_trainer_review`
- `20251108120000_exam_review_fields`

**Что установлено точно:** 11 ноября 2025 года коммит [`ab72291e392`](https://github.com/asmtv1/gafus/commit/ab72291e39225567e1c1248d9f5a6eb06df61b48) внёс первую зафиксированную в Git версию этих файлов; 18 ноября 2025 года коммит [`f4d77931d4de`](https://github.com/asmtv1/gafus/commit/f4d77931d4de2ba65edcf299fe0136632f99f275) **изменил содержимое обоих migration.sql без смены их ID**.

- В первой миграции старая версия создавала только `ExamResult_reviewedAt_idx`, а новая стала добавлять `trainerComment`, `reviewedAt`, `reviewedById`, FK `reviewedById → User(id)` (`SET NULL`) и оба индекса.
- Во второй миграции старая версия действительно создавала поля/FK/индекс, а новая стала **только комментарием-заглушкой**. Изменения перенесли в первый файл, сохранив оба имени в истории.
- Документация Main (`docs/packages/prisma.md`) отдельно сообщает, что 11.11.2025 объекты проверки тренером добавили вручную на production и пометили миграции применёнными. Это **историческое свидетельство документации**, а не независимая проверка соответствующей операции в БД.
- Историческая цепочка Prisma в Main также имеет известную проблему fresh replay: старый `20241108120000_exam_result_trainer_review` расположен до создания `ExamResult` в полной исторической цепочке. Это описано в `.gafus-refactoring/MIGRATION_FORENSICS.md`; используется отдельный **fresh-only** bootstrap, а не переписывание старой истории.

### 4.1. Проверяемые SHA-256 обеих Git-версий

Ниже приведены **SHA-256 сырых `migration.sql`**, а не Git blob SHA-1. Все версии восстановлены дословно из указанных Git-коммитов, и Git blob идентификаторы проверены.

| Migration ID | Git-состояние | SHA-256 `migration.sql` |
|---|---|---|
| `20241108120000_exam_result_trainer_review` | 2025-11-11 | `8d5e5d7d4193856e6d9e09b1d29be06f45f27ef9ffbc3371d44560722894350d` |
| `20241108120000_exam_result_trainer_review` | 2025-11-18/Main HEAD | `97dac51e945195a177ec4b4fe7ae43382b42a9de8a8798fe68d8decb96dd7248` |
| `20251108120000_exam_review_fields` | 2025-11-11 | `6caa3573e27085676870304769728c7aa42315eec3357dfebcb7ee36b209e0e9` |
| `20251108120000_exam_review_fields` | 2025-11-18/Main HEAD | `9f138f40c90e21271a4acfef521af52d64c4b568b52aa41d882499eec88a8543` |

Эти четыре хеша помогают сравнить read-only `checksum` из ledger с двумя реально существовавшими Git-версиями. **Ledger checksum здесь не предоставлен, поэтому совпадение или несовпадение с конкретным хешем не установлено.** Если он не равен ни одному из этих четырёх релевантных хешей, существовала другая версия SQL, преобразование кодировок/переводов строк или другая история; решать это догадкой нельзя.

**Нельзя** механически заменить исторические SQL «как в Main HEAD» и считать, что checksum mismatch тем самым устранён. Prisma хранит хеш содержимого миграции в момент применения; задним числом изменённый файл закономерно может конфликтовать с сохранённой историей.

### 4.2. Исходный и актуальный текст старых файлов (для точной идентификации)

#### `20241108120000_exam_result_trainer_review`

**Версия `2025-11-11`**; `SHA-256: 8d5e5d7d4193856e6d9e09b1d29be06f45f27ef9ffbc3371d44560722894350d`; 207 байт.

```sql
-- Индекс для быстрого поиска экзаменов по дате проверки тренером
CREATE INDEX IF NOT EXISTS "ExamResult_reviewedAt_idx" ON "ExamResult" ("reviewedAt");
```

**Версия `2025-11-18/Main HEAD`**; `SHA-256: 97dac51e945195a177ec4b4fe7ae43382b42a9de8a8798fe68d8decb96dd7248`; 834 байт.

```sql
-- Поля проверки тренером и индексы для ExamResult
ALTER TABLE "ExamResult"
  ADD COLUMN IF NOT EXISTS "trainerComment" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'ExamResult'
      AND constraint_name = 'ExamResult_reviewedById_fkey'
  ) THEN
    ALTER TABLE "ExamResult"
      ADD CONSTRAINT "ExamResult_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ExamResult_reviewedById_idx" ON "ExamResult" ("reviewedById");
CREATE INDEX IF NOT EXISTS "ExamResult_reviewedAt_idx" ON "ExamResult" ("reviewedAt");
```

#### `20251108120000_exam_review_fields`

**Версия `2025-11-11`**; `SHA-256: 6caa3573e27085676870304769728c7aa42315eec3357dfebcb7ee36b209e0e9`; 674 байт.

```sql
-- Добавляем поля комментария тренера и информацию о проверке
ALTER TABLE "ExamResult"
  ADD COLUMN "trainerComment" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT;

-- Обновляем связи на пользователя (тренера)
ALTER TABLE "ExamResult"
  ADD CONSTRAINT "ExamResult_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Индекс для быстрого поиска по тренеру-проверяющему
CREATE INDEX "ExamResult_reviewedById_idx" ON "ExamResult" ("reviewedById");

```

**Версия `2025-11-18/Main HEAD`**; `SHA-256: 9f138f40c90e21271a4acfef521af52d64c4b568b52aa41d882499eec88a8543`; 195 байт.

```sql
-- Миграция объединена с 20241108120000_exam_result_trainer_review.
-- Файл оставлен пустым намеренно, чтобы сохранить историю.
```

## 5. Безопасное использование handoff

1. Пользователь может скопировать **этот один Markdown-файл** в документацию/вход агента Refactor; содержимое SQL в нём дословное, но Markdown **не заменяет** три настоящих `migration.sql` по отдельным относительным путям.
2. Для трёх отсутствующих applied миграций можно восстановить **исходные файлы Main** в истории Prisma Refactor, предварительно сравнив SHA-256 с конкретными checksum из ledger. Это операция **с файлами репозитория Refactor только его собственным исполнителем**, не выполнение SQL против базы.
3. Не запускать повторно три SQL-скрипта на базе с 143 `finished`. Не менять applied ledger задним числом ради устранения предупреждения.
4. Для двух миграций 2025 года сначала сопоставить исторические SHA-256 из таблицы с сохранёнными `checksum`. При совпадении старой версии — подтвердится сценарий изменения файла после применения; **не подменять** ledger новыми хешами.
5. По NPD проверить в собственной изолированной среде и схему, и Core: восстановление одного CHECK **без** whitelist Core и динамического `serviceName` не обеспечивает паритет.
6. Ни дамп, ни конфиденциальные данные, ни новые production SQL-команды для аудита не нужны. Дальнейшее сведение схем — только на изолированной локальной копии.

### 6. Границы достоверности

**Подтверждено Git:** текст всех трёх Main migrations, их байтовые SHA-256, сопровождающий Core-контракт, факт переписывания двух исторических миграций 18.11.2025 и две точные версии их текста.

**Со слов координатора:** ledger содержит 143 `finished`; именно три applied SQL отсутствуют в Refactor; названы два checksum mismatch. Их фактические ledger checksums, точное время dump и перечень строк данных в этой консультации не проверялись.

**Действий с production или Refactor не производилось.** Весь материал — для ручной передачи и планирования адаптации. 
