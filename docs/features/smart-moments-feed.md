# Умная лента «Для вас» — GAFUS

## Состояние и переключатели

**Production: включено по умолчанию** через `ci-cd/docker/docker-compose.prod.yml` и оба deploy workflows (`FEED_SMART_* = true`). Изменения в production-контейнерах начинают действовать только после деплоя с успешным `prisma migrate deploy`. Если миграция не проходит, существующий pipeline останавливает релиз ДО перезапуска приложений. Вне production feature flags в коде по-прежнему считаются выключенными, если переменные не заданы.

Сейчас production-значения: `FEED_SMART_AB_ENABLED=true`, `FEED_SMART_AB_PERCENT=100`, `FEED_SMART_AB_TREATMENT_PERCENT=100` — все пользователи экспериментальной ветки получают **новую**, а не случайно выбранную хронологическую выдачу. Это **не A/B-эксперимент** с контрольной группой, и статистически значимое сравнение по нему не получить. `FEED_SMART_SHADOW_ENABLED=true` с 1% позволяет сравнивать ответы обычной сортировки без смены выдачи.

На Web и Mobile сортировка `smart` выбирается при первом открытии, если пользователь не сохранил предпочтение, и `smartEnabled=true`. Сохранённые настройки пользователя не сбрасываются. Изменения Mobile попадут на телефоны только с обновлённой сборкой приложения — server-side активация сама по себе мобильное приложение не обновляет.

Откат доступен через GitHub Actions Variables: `FEED_SMART_ENABLED=false` и повторный deploy (или обновление environment на сервере). При проблеме отдельных подсистем можно отдельно отключить `FEED_SMART_ML_ENABLED`, `FEED_SMART_ML_TRAIN_ENABLED`, `FEED_SMART_SHADOW_ENABLED`, `FEED_SMART_EVENTS_ENABLED` и остальные флаги. `FEED_ENABLED` / `FEED_PROCESSOR_READY` **не изменяются**.

**ML:** флаги обучения и serving включены, но `FeedSmartRankerModel` ещё может не содержать зрелой обученной модели. Тогда выполняется качественный rule-based ranking. Training job записывает только теневые модели; автоматическая активация непроверенных моделей намеренно запрещена. Нельзя объявлять работу ML-модели только потому, что включён флаг сервинга.

- `FEED_SMART_ENABLED=true` в API / feed-server: разрешает `sort=smart`, настройки, impressions и «Не интересно». В production включён по умолчанию; вне production — только явно.
- `FEED_SMART_STATS_ENABLED=true` в worker: запускает обновление `FeedPostStats` для 1200 недавних публикаций каждые 5 минут и очистку событий показов старше 90 дней пакетами по 2000 каждую ночь.
- `FEED_SMART_DIAGNOSTICS=true` в feed-server: включает обезличенные диагностические логи о размере выборки, времени ответа и причинах fallback, без userId, города и текста.
- `FEED_SMART_MULTI_SOURCE_ENABLED=true` в feed-server: включает 5 независимых candidate sources: recent (150), local (80), pet (80), affinity (80), trending (80), с дедупликацией до 500 постов. Существующие hard-фильтры применяются к каждому источнику.
- `FEED_SMART_AB_ENABLED=true` в feed-server: sticky user-level assignment; в production default 100% enrollment и 100% treatment, чтобы всегда показывать новую выдачу. Для настоящего A/B переключить treatment на 50%, но это потребует планирования эксперимента.
- `FEED_SMART_AFFINITY_ENABLED=true` в feed-server и **одном** worker: каждые 15 минут агрегирует историю авторов последних активных пользователей с decay и после reset не возвращает старые сигналы.
- `FEED_SMART_ML_TRAIN_ENABLED=true` в одном worker: раз в неделю строит кандидатную ML-модель в режиме **shadow**, без автоматического включения.
- `FEED_SMART_ML_ENABLED=true` в feed-server: применяет только явно активированную, не устаревшую модель с пройденной offline-проверкой. При отсутствии модели используется rule-based scoring.
- Общие `FEED_ENABLED` и `FEED_PROCESSOR_READY` по-прежнему обязательны.

Изменения базы применяются **только после ревью** миграции `packages/prisma/migrations/20261010180000_smart_feed/migration.sql`. Миграция добавляет индексы, настройки пользователя, историю qualified-impressions, агрегаты, affinity и feedback; вводит триггер для синхронизации `UserProfile.cityKey` при изменении поля `city`. Требуется PostgreSQL с поддержкой `NORMALIZE(..., NFKC)`.

## Механика

- Кандидаты: по умолчанию максимум 400 свежих за 14 дней. При multi-source retrieval — объединение 5 источников за 14–30 дней до 500 уникальных публикаций.
- Scoring: возраст публикации, affinity к автору, совпадение города, вида и породы питомца, качество поста, стабильный discovery; штраф недавно просмотренным.
- Для автора берутся **только питомцы с `showInProfile=true`**; текст `about` не анализируется.
- На первые позиции применяется авторское разнообразие, с возможными слотами новых авторов. Настройка «Показывать новых авторов» отключает эти слоты.
- На сервере сохраняется Redis snapshot (TTL 15 минут). Межстраничный курсор связан с владельцем и ревизией настроек. При недоступном Redis выдаётся первая страница `new` с `fallback="new"` и без следующего курсора.
- Отдельные события qualified-impressions отправляются после видимости ≥ 50% в течение ≥ 2 секунд, с уникальным `eventId`. В БД есть также уникальность пары «пользователь / публикация / ranking session», поэтому повторная отправка под новым eventId не накручивает показы; публичные счётчики `FeedPostView` независимы.
- Сброс персонализации удаляет производные impressions / affinity / feedback и отсекает прежние взаимодействия по `historyResetAt`. Публичные посты, реакции, комментарии, закладки и lifetime-view не удаляются.

## Проверки перед запуском

### Изолированные проверки SQL и Redis

Проверки намеренно не подключаются к базе проекта по умолчанию и не используют продакшен.
Создайте **отдельную** PostgreSQL UTF8-базу с именем `gafus_smart_test`
(или другим именем `gafus_*smart_test`) с актуальной схемой **до внедрения умной ленты**,
после чего примените `20261010180000_smart_feed/migration.sql`.
**Известное ограничение:** стандартный `prisma migrate deploy` на совершенно пустой базе
пока не работает: миграция `20241108120000_exam_result_trainer_review` ожидает таблицу
`ExamResult`. Для изолированной проверки новая миграция применялась к базовой схеме,
созданной через `prisma db push` из временной копии схемы без новых smart-моделей.
После применения `prisma migrate diff --exit-code` не нашёл расхождений.
Скрипт ниже **не применяет миграции**, а проверяет структуру, создаёт тестовых пользователей,
питомцев, публикации, реакции, комментарии и показы, затем выполняет настоящие SQL агрегации,
multi-source retrieval и offline training внутри **откатываемой транзакции**:

```sh
FEED_SMART_TEST_DATABASE_URL="$ISOLATED_TEST_DATABASE_URL" FEED_SMART_TEST_CONFIRM=YES pnpm --filter @gafus/worker smart-feed:sql-smoke
```

Для Redis выделите **отдельный тестовый инстанс или БД 15**, не используйте продакшен:

```sh
FEED_SMART_TEST_REDIS_URL="$ISOLATED_TEST_REDIS_URL" FEED_SMART_REDIS_TEST_CONFIRM=YES pnpm --filter @gafus/worker smart-feed:redis-smoke
```

Этот тест проверяет сохранение/получение snapshot, TTL и удаление только временного ключа.
При отсутствии подтверждения или при неподходящем имени базы оба скрипта завершаются
ошибкой и **не запускают проверку**. На машине с ограничениями Bridge они также могут
быть недоступны из-за запрета Unix/TCP-сокетов — успешные unit-тесты не заменяют их.

Для оценки чистой стоимости ранжирования без БД/сети:

```sh
pnpm --filter @gafus/core exec vitest run src/services/feed/smart-performance.test.ts
```

В локальной CPU-проверке (500 кандидатов, top-200, 60 прогонов) измерены
p50 ≈ 1,04 мс и p95 ≈ 3,00 мс **без БД**.

На Mac через Desktop Commander 10.10.2026 дополнительно запущена **настоящая
PostgreSQL 14** в полностью изолированном локальном экземпляре и отдельный Redis.
Исправленная миграция применилась к базовой схеме; `prisma migrate diff --exit-code`
вернул `No difference detected`. Redis roundtrip, TTL и очистка прошли.
С включённым `FEED_SMART_SQL_BENCHMARK=true` (500 искусственных публикаций,
10 запросов multi-source ranking с SQL) получили **p50 16,65 мс и p95 18,97 мс**
на loopback. Тестовые записи откатились: 0 публикаций, 0 показов, 0 ML-моделей
после выполнения. Для повторения используется тот же `smart-feed:sql-smoke`
с дополнительным флагом `FEED_SMART_SQL_BENCHMARK=true`.

Эти измерения **не являются HTTP p95 продакшена**: перед выкладкой остаются
`EXPLAIN (ANALYZE, BUFFERS)` на реалистичном объёме данных, нагрузочные
сценарии базы/Redis и замеры p95 API.

1. На staging применить миграцию после актуальных migrations (в том числе содержащей поле `city`); убедиться, что backfill и trigger корректно нормализуют кириллицу.
2. Включить `FEED_SMART_STATS_ENABLED` на одном worker, запустить расчёт агрегатов; проверить корректность unique-commenters, исключения self-engagement, нагрузку SQL.
3. Включить `FEED_SMART_ENABLED` на staging и проверить обе платформы: cold start, сортировки, скрытие автора, модерация, «Не интересно», выключение сигналов, сброс рекомендаций, пагинацию и истечение сессии.
4. Проверить сценарий недоступности Redis и отсутствие 5xx: должны выводиться новые публикации с пояснением fallback.
5. Замерить latency p50/p95 относительно обычной сортировки и проанализировать SQL через `EXPLAIN (ANALYZE, BUFFERS)`.
6. По решению владельца GAFUS при этом релизе включить новую ленту сразу в production после успешного `prisma migrate deploy`, с резервной копией БД, мониторингом и подготовленным отключением `FEED_SMART_ENABLED=false`. Нативные E2E Android/iOS на текущих бинарниках ещё не завершены; считать это осознанным риском production-тестирования.

## Эксперимент и сравнение с baseline

В production распределение включено с **100% treatment** (без контрольной группы); в остальных окружениях флаг по умолчанию выключен. Assignment фиксируется по userId; control получает существующую сортировку `new`, treatment — `smart`, обе группы фиксируют qualified impressions со своими серверными session snapshot. Каждый пост содержит `recommendationSessionId`, поэтому прокрутка нескольких страниц не смешивает метаданные показов. Все события проверяются по Redis session и владельцу. Данные контрольной группы не используются как ML training features (нет feature snapshots).

Для изолированного анализа на подготовленной staging/test базе:

```sh
FEED_SMART_AB_REPORT_DATABASE_URL="$ISOLATED_TEST_DATABASE_URL" FEED_SMART_AB_REPORT_CONFIRM=YES pnpm --filter @gafus/worker smart-experiment:report
```

Отчёт считает **пользователей, а не клики**, использует только первый зрелый день с подтверждённым показом (7 суток атрибуции, отсечение последних 8 суток), даёт user-level meaningful engagement, negative rate, количество уникальных публикаций/авторов и консервативный 95% интервал. **Решение по A/B принудительно помечено `eligibleForDecision: false`**: без согласованного sample size, privacy-safe retention/guardrails, контроля сезонности, полномасштабного мониторинга и реального трафика не объявлять победителя.

Откат A/B без деплоя: `FEED_SMART_AB_ENABLED=false`. Это не активирует модель, не переписывает сохранённые предпочтения и не меняет старые сортировки.

## ML-модель: обучение, проверка и включение

1. **Сначала** накопить реальные qualified impressions (строка = подтверждённый показ). На сервере сохраняется числовой feature snapshot ДО показа, а также набор источников. Никакие имена пользователей, названия городов и пород в этот snapshot не записываются.
2. Обучение использует только показы **старше 8 дней**, чтобы созрело 7-дневное окно реакции / комментария / закладки / «Не интересно». Посты, которых человек не видел, **не становятся** отрицательными примерами. Снимки, относящиеся к пользователям с отключённой персонализацией/поведением, исключаются.
3. На отдельной проверенной базе запуск вручную: `FEED_SMART_ML_TRAIN_CONFIRM=yes pnpm --filter @gafus/worker smart-ml:train`. Нужны как минимум 1000 строк обучения и 200 строк validation, ненулевые положительные/отрицательные примеры по каждой цели. Используется регуляризованная logistic regression, четыре независимые цели, **chronological 80/20 split**; сравниваются ROC-AUC и Brier с константным baseline.
4. Только модель, прошедшая offline-gate, сохраняется в `FeedSmartRankerModel` как **active=false**. Training job не включает её сам. Версия и validation-метрики находятся в JSON-артефакте.
5. После ревью metrics, staging-нагрузки и проверки на реальном Redis — явно активировать нужную версию: `FEED_SMART_ML_PROMOTE_CONFIRM=yes pnpm --filter @gafus/worker smart-ml:promote lr-v1-YYYYMMDDHHMM`. Она должна быть не старше 30 дней и пройти quality-gate. Наконец включить `FEED_SMART_ML_ENABLED=true` на нужной группе серверов.
6. На serving применяется смешанный скоринг: 70% ML expected utility и 30% baseline. Неактивная, устаревшая, некорректная или отсутствующая модель не влияет на правила. Откат ML — выключить `FEED_SMART_ML_ENABLED`, не затрагивая остальные режимы.
7. Источники можно анализировать без идентификаторов пользователей: `SELECT source, COUNT(*) FROM "FeedImpression", UNNEST("candidateSources") source GROUP BY source`.

Тренировка не запускается на продакшене автоматически без флага. Фактическая ML-модель появится **только после накопления подходящего датасета**. Не стоит называть неподтверждённый shadow-artifact production-ready.

### Откат

Сначала отключить `FEED_SMART_ML_ENABLED` и `FEED_SMART_MULTI_SOURCE_ENABLED`, затем при необходимости `FEED_SMART_ENABLED`, `FEED_SMART_STATS_ENABLED`, `FEED_SMART_ML_TRAIN_ENABLED`, оставив существующие сортировки. Не выполнять `migrate reset` и не откатывать таблицы с историей пользователей без продуманной стратегии данных.

## Ограничения текущего MVP

- Affinity считается по ограниченному числу реальных событий при построении snapshot; таблица `FeedUserAuthorAffinity` заложена в схеме, но event-driven materialization ещё не включена.
- Multi-source и trainable ML доступны за отдельными флагами; это **не** означает, что в базе уже есть достаточные обучающие данные или подтверждённая модель.
- Полноценное A/B-тестирование, online lift-метрики, автоматическое feature-store обновление, эмбеддинги/two-tower, нагрузочное тестирование и observability SLO остаются следующими этапами.
- Реальный PostgreSQL/Redis end-to-end и продакшен-проверки не заменяются unit-тестами и `tsc`.


## October 10 supplementary implementation: exposure events, taxonomy and health

Additive migration `20261010200000_smart_feed_events` creates `Pet.breedKey`
(backfill, NFKC normalization, small explicit Russian/English alias map, trigger
and index) and `FeedRankingEvent` (idempotent event IDs, validated post-open,
profile-open, dwell, FK and retention indexes). It MUST be applied after
`20261010180000_smart_feed`, and must be verified on staging before enabling.

Each delivered feed card carries a server-issued opaque UUID exposure token tied
to its server-side Redis session, post and rank. On future pages use that page's
per-card session ID, never the first page's session ID. The
`ranking-events/batch` API additionally requires a previously validated
qualified impression, re-checks hard content eligibility, caps dwell at 120s
and applies per-user Redis rate limiting. Mobile pauses dwell on app background
and screen blur; Web pauses on tab hidden and focus loss. Personalization reset
and 90-day retention remove derived outcome data.

Flags (all OFF by default):
- `FEED_SMART_EVENTS_ENABLED=true`: accept post/profile opens and dwell.
- `FEED_SMART_EXPOSURE_TOKENS_REQUIRED=true`: require tokens also on the
  legacy qualified-impression endpoint; turn on only after both clients update.
- `FEED_SMART_MONITOR_ENABLED=true`: enable anonymized rolling health counts,
  unique authors, post opens, long dwell and warnings via a single worker.
- `FEED_SMART_SHADOW_ENABLED=true`, `FEED_SMART_SHADOW_PERCENT=1`:
  compute rankings for a deterministic 1% sample of chronological sessions,
  emit overlap/latency, NEVER alter the visible chronological response.

Validated locally: Prisma schema, full SQL migration chain against a disposable
PostgreSQL 14 instance (Prisma diff: no differences), real SQL smoke with
synthetic users/posts/pets/events and full transaction rollback, unit tests.
These are not proof of real-device event reliability or production API p95.
Do not enable the new flags before staging E2E and operational review.
