# Независимая матрица пост-интеграционной проверки 69 workspace-пакетов

Сформировано: 2026-11-12T10:07:00.933Z. Источник: read-only инспекция /Users/asmtv1/Desktop/gafus-refactor. Этот снимок фиксирует **план**, не выполненные тесты. Сборка/тесты в ходе создания матрицы **не запускались**.

## Покрытие

- 69 workspace: **57** с тестовым скриптом (26 в основном регрессионном runner, **31** в отдельной обязательной серии); **12** без test-скрипта.
- Среди 12 пакетов без test-скрипта **5 содержат 29 тестовых файлов**. Они не исключаются: для них требуется адресный direct Vitest запуск. **7** не содержат обнаруженных тестовых файлов; build и typecheck/contract-consumer не равнозначны собственным unit тестам.
- Матрица считается корректной только при точном соответствии текущим package.json, текущему architecture runner и списку тестовых файлов. Изменения пакетов после объединения => обновить и проверить матрицу, а не засчитывать старый список.
- Статус теста **не** определяется историческими квитанциями: для будущей приёмки обязательна новая уникальная сессия, запуск стадий через локальный recorder и verification с frozen source state.

## Все 57 пакетов с `test`

| Пакет | Этап / gate | Команда | Квитанция |
|---|---|---|---|
| `@gafus/achievements-server` | `extras:extra-achievements-server` | `pnpm --filter @gafus/achievements-server test` | `<RUN_ID>/extras/results.json:@gafus/achievements-server, extras/achievements-server-test.log` |
| `@gafus/admin-panel` | `architecture:test-admin-panel` | `pnpm --filter @gafus/admin-panel test` | `<RUN_ID>/results.tsv:test-admin-panel, test-admin-panel.log` |
| `@gafus/admin-reengagement-server` | `extras:extra-admin-reengagement-server` | `pnpm --filter @gafus/admin-reengagement-server test` | `<RUN_ID>/extras/results.json:@gafus/admin-reengagement-server, extras/admin-reengagement-server-test.log` |
| `@gafus/analytics` | `extras:extra-analytics` | `pnpm --filter @gafus/analytics test` | `<RUN_ID>/extras/results.json:@gafus/analytics, extras/analytics-test.log` |
| `@gafus/api` | `architecture:test-api` | `pnpm --filter @gafus/api test` | `<RUN_ID>/results.tsv:test-api, test-api.log` |
| `@gafus/article-server` | `extras:extra-article-server` | `pnpm --filter @gafus/article-server test` | `<RUN_ID>/extras/results.json:@gafus/article-server, extras/article-server-test.log` |
| `@gafus/auth` | `extras:extra-auth` | `pnpm --filter @gafus/auth test` | `<RUN_ID>/extras/results.json:@gafus/auth, extras/auth-test.log` |
| `@gafus/chat-server` | `extras:extra-chat-server` | `pnpm --filter @gafus/chat-server test` | `<RUN_ID>/extras/results.json:@gafus/chat-server, extras/chat-server-test.log` |
| `@gafus/consent-server` | `extras:extra-consent-server` | `pnpm --filter @gafus/consent-server test` | `<RUN_ID>/extras/results.json:@gafus/consent-server, extras/consent-server-test.log` |
| `@gafus/consultation-query-server` | `architecture:test-consultation-query-server` | `pnpm --filter @gafus/consultation-query-server test` | `<RUN_ID>/results.tsv:test-consultation-query-server, test-consultation-query-server.log` |
| `@gafus/consultation-server` | `architecture:test-consultation-server` | `pnpm --filter @gafus/consultation-server test` | `<RUN_ID>/results.tsv:test-consultation-server, test-consultation-server.log` |
| `@gafus/consultation-shared` | `architecture:test-consultation-shared` | `pnpm --filter @gafus/consultation-shared test` | `<RUN_ID>/results.tsv:test-consultation-shared, test-consultation-shared.log` |
| `@gafus/consultation-write-server` | `architecture:test-consultation-write-server` | `pnpm --filter @gafus/consultation-write-server test` | `<RUN_ID>/results.tsv:test-consultation-write-server, test-consultation-write-server.log` |
| `@gafus/core` | `architecture:test-core` | `pnpm --filter @gafus/core test` | `<RUN_ID>/results.tsv:test-core, test-core.log` |
| `@gafus/core-client` | `extras:extra-core-client` | `pnpm --filter @gafus/core-client test` | `<RUN_ID>/extras/results.json:@gafus/core-client, extras/core-client-test.log` |
| `@gafus/course-progress-server` | `architecture:test-course-progress-server` | `pnpm --filter @gafus/course-progress-server test` | `<RUN_ID>/results.tsv:test-course-progress-server, test-course-progress-server.log` |
| `@gafus/course-read-server` | `extras:extra-course-read-server` | `pnpm --filter @gafus/course-read-server test` | `<RUN_ID>/extras/results.json:@gafus/course-read-server, extras/course-read-server-test.log` |
| `@gafus/course-server` | `extras:extra-course-server` | `pnpm --filter @gafus/course-server test` | `<RUN_ID>/extras/results.json:@gafus/course-server, extras/course-server-test.log` |
| `@gafus/csrf` | `extras:extra-csrf` | `pnpm --filter @gafus/csrf test` | `<RUN_ID>/extras/results.json:@gafus/csrf, extras/csrf-test.log` |
| `@gafus/entitlements-server` | `extras:extra-entitlements-server` | `pnpm --filter @gafus/entitlements-server test` | `<RUN_ID>/extras/results.json:@gafus/entitlements-server, extras/entitlements-server-test.log` |
| `@gafus/exam-server` | `extras:extra-exam-server` | `pnpm --filter @gafus/exam-server test` | `<RUN_ID>/extras/results.json:@gafus/exam-server, extras/exam-server-test.log` |
| `@gafus/feed-cloud-runtime` | `extras:extra-feed-cloud-runtime` | `pnpm --filter @gafus/feed-cloud-runtime test` | `<RUN_ID>/extras/results.json:@gafus/feed-cloud-runtime, extras/feed-cloud-runtime-test.log` |
| `@gafus/feed-server` | `architecture:test-feed-server` | `pnpm --filter @gafus/feed-server test` | `<RUN_ID>/results.tsv:test-feed-server, test-feed-server.log` |
| `@gafus/gafus-server` | `extras:extra-gafus-server` | `pnpm --filter @gafus/gafus-server test` | `<RUN_ID>/extras/results.json:@gafus/gafus-server, extras/gafus-server-test.log` |
| `@gafus/gallery-cloud` | `extras:extra-gallery-cloud` | `pnpm --filter @gafus/gallery-cloud test` | `<RUN_ID>/extras/results.json:@gafus/gallery-cloud, extras/gallery-cloud-test.log` |
| `@gafus/gallery-server` | `extras:extra-gallery-server` | `pnpm --filter @gafus/gallery-server test` | `<RUN_ID>/extras/results.json:@gafus/gallery-server, extras/gallery-server-test.log` |
| `@gafus/gallery-storage` | `extras:extra-gallery-storage` | `pnpm --filter @gafus/gallery-storage test` | `<RUN_ID>/extras/results.json:@gafus/gallery-storage, extras/gallery-storage-test.log` |
| `@gafus/identity-write-server` | `architecture:test-identity-write-server` | `pnpm --filter @gafus/identity-write-server test` | `<RUN_ID>/results.tsv:test-identity-write-server, test-identity-write-server.log` |
| `@gafus/mailer` | `extras:extra-mailer` | `pnpm --filter @gafus/mailer test` | `<RUN_ID>/extras/results.json:@gafus/mailer, extras/mailer-test.log` |
| `@gafus/media-server` | `architecture:test-media-server` | `pnpm --filter @gafus/media-server test` | `<RUN_ID>/results.tsv:test-media-server, test-media-server.log` |
| `@gafus/media-shared` | `architecture:test-media-shared` | `pnpm --filter @gafus/media-shared test` | `<RUN_ID>/results.tsv:test-media-shared, test-media-shared.log` |
| `@gafus/mobile` | `architecture:test-mobile` | `pnpm --filter @gafus/mobile test` | `<RUN_ID>/results.tsv:test-mobile, test-mobile.log` |
| `@gafus/mobile-intro-server` | `extras:extra-mobile-intro-server` | `pnpm --filter @gafus/mobile-intro-server test` | `<RUN_ID>/extras/results.json:@gafus/mobile-intro-server, extras/mobile-intro-server-test.log` |
| `@gafus/notifications-server` | `architecture:test-notifications-server` | `pnpm --filter @gafus/notifications-server test` | `<RUN_ID>/results.tsv:test-notifications-server, test-notifications-server.log` |
| `@gafus/npd` | `extras:extra-npd` | `pnpm --filter @gafus/npd test` | `<RUN_ID>/extras/results.json:@gafus/npd, extras/npd-test.log` |
| `@gafus/pets-server` | `architecture:test-pets-server` | `pnpm --filter @gafus/pets-server test` | `<RUN_ID>/results.tsv:test-pets-server, test-pets-server.log` |
| `@gafus/pets-shared` | `architecture:test-pets-shared` | `pnpm --filter @gafus/pets-shared test` | `<RUN_ID>/results.tsv:test-pets-shared, test-pets-shared.log` |
| `@gafus/prisma` | `extras:extra-prisma` | `pnpm --filter @gafus/prisma test` | `<RUN_ID>/extras/results.json:@gafus/prisma, extras/prisma-test.log` |
| `@gafus/questions-server` | `architecture:test-questions-server` | `pnpm --filter @gafus/questions-server test` | `<RUN_ID>/results.tsv:test-questions-server, test-questions-server.log` |
| `@gafus/questions-shared` | `architecture:test-questions-shared` | `pnpm --filter @gafus/questions-shared test` | `<RUN_ID>/results.tsv:test-questions-shared, test-questions-shared.log` |
| `@gafus/questions-write-server` | `architecture:test-questions-write-server` | `pnpm --filter @gafus/questions-write-server test` | `<RUN_ID>/results.tsv:test-questions-write-server, test-questions-write-server.log` |
| `@gafus/reengagement` | `extras:extra-reengagement` | `pnpm --filter @gafus/reengagement test` | `<RUN_ID>/extras/results.json:@gafus/reengagement, extras/reengagement-test.log` |
| `@gafus/statistics` | `extras:extra-statistics` | `pnpm --filter @gafus/statistics test` | `<RUN_ID>/extras/results.json:@gafus/statistics, extras/statistics-test.log` |
| `@gafus/subscription-finance-server` | `architecture:test-subscription-finance-server` | `pnpm --filter @gafus/subscription-finance-server test` | `<RUN_ID>/results.tsv:test-subscription-finance-server, test-subscription-finance-server.log` |
| `@gafus/subscription-payment-server` | `architecture:test-subscription-payment-server` | `pnpm --filter @gafus/subscription-payment-server test` | `<RUN_ID>/results.tsv:test-subscription-payment-server, test-subscription-payment-server.log` |
| `@gafus/subscription-read-server` | `extras:extra-subscription-read-server` | `pnpm --filter @gafus/subscription-read-server test` | `<RUN_ID>/extras/results.json:@gafus/subscription-read-server, extras/subscription-read-server-test.log` |
| `@gafus/subscription-shared` | `architecture:test-subscription-shared` | `pnpm --filter @gafus/subscription-shared test` | `<RUN_ID>/results.tsv:test-subscription-shared, test-subscription-shared.log` |
| `@gafus/subscription-trial-server` | `extras:extra-subscription-trial-server` | `pnpm --filter @gafus/subscription-trial-server test` | `<RUN_ID>/extras/results.json:@gafus/subscription-trial-server, extras/subscription-trial-server-test.log` |
| `@gafus/subscription-write-server` | `extras:extra-subscription-write-server` | `pnpm --filter @gafus/subscription-write-server test` | `<RUN_ID>/extras/results.json:@gafus/subscription-write-server, extras/subscription-write-server-test.log` |
| `@gafus/tracking-server` | `extras:extra-tracking-server` | `pnpm --filter @gafus/tracking-server test` | `<RUN_ID>/extras/results.json:@gafus/tracking-server, extras/tracking-server-test.log` |
| `@gafus/trainer-ai-server` | `architecture:test-trainer-ai-server` | `pnpm --filter @gafus/trainer-ai-server test` | `<RUN_ID>/results.tsv:test-trainer-ai-server, test-trainer-ai-server.log` |
| `@gafus/trainer-panel` | `architecture:test-trainer-panel` | `pnpm --filter @gafus/trainer-panel test` | `<RUN_ID>/results.tsv:test-trainer-panel, test-trainer-panel.log` |
| `@gafus/types` | `extras:extra-types` | `pnpm --filter @gafus/types test` | `<RUN_ID>/extras/results.json:@gafus/types, extras/types-test.log` |
| `@gafus/video-access` | `extras:extra-video-access` | `pnpm --filter @gafus/video-access test` | `<RUN_ID>/extras/results.json:@gafus/video-access, extras/video-access-test.log` |
| `@gafus/web-vite` | `architecture:web` | `node scripts/qa/web-vite-chunked-regression.mjs --run-id=<RUN_ID>` | `<RUN_ID>/results.tsv:web, web.log` |
| `@gafus/webpush` | `extras:extra-webpush` | `pnpm --filter @gafus/webpush test` | `<RUN_ID>/extras/results.json:@gafus/webpush, extras/webpush-test.log` |
| `@gafus/worker` | `architecture:test-worker` | `pnpm --filter @gafus/worker test` | `<RUN_ID>/results.tsv:test-worker, test-worker.log` |

## 12 пакетов без `test` — не исключать из итогового контроля

| Пакет | Обнаружено тестовых файлов | Причина неучастия в 57 | Обязательная альтернатива | Контракты потребителей |
|---|---:|---|---|---|
| `@gafus/admin-rewarded-ads-server` | 0 | Нет `scripts.test` и исходных test/spec файлов; самостоятельное unit-покрытие отсутствует | build, typecheck | Legacy admin rewarded-ads and API contracts; no own tests |
| `@gafus/bull-board` | 0 | Нет `scripts.test` и исходных test/spec файлов; самостоятельное unit-покрытие отсутствует | build, typecheck | Worker/Bull Board runtime and API health; no own unit test; release build/typecheck gate |
| `@gafus/cdn-upload` | 11 | Нет `scripts.test`, хотя исходные тесты существуют; это пробел скриптов, не отсутствие тестов | build, lint, direct Vitest 11 файлов | CDN/MinIO/media isolated QA; direct Vitest sources exist but package test script is absent |
| `@gafus/chat-media-quality` | 2 | Нет `scripts.test`, хотя исходные тесты существуют; это пробел скриптов, не отсутствие тестов | build, typecheck, direct Vitest 2 файлов | Chat2 and Mobile media player QA; direct Vitest sources exist but no package test script |
| `@gafus/error-handling` | 0 | Нет `scripts.test` и исходных test/spec файлов; самостоятельное unit-покрытие отсутствует | build, typecheck | Core/HTTP error contracts and boundary suite; no own tests |
| `@gafus/feature-flags-server` | 0 | Нет `scripts.test` и исходных test/spec файлов; самостоятельное unit-покрытие отсутствует | build, typecheck | Core appFeatureFlagsService.test.ts, API admin-feature-flags/public-mobile; no own tests |
| `@gafus/feed-cloud` | 8 | Нет `scripts.test`, хотя исходные тесты существуют; это пробел скриптов, не отсутствие тестов | build, typecheck, direct Vitest 8 файлов | Cloud.ru/media offline suite and Worker; direct Vitest sources exist but no package test script |
| `@gafus/feed-storage` | 6 | Нет `scripts.test`, хотя исходные тесты существуют; это пробел скриптов, не отсутствие тестов | build, typecheck, direct Vitest 6 файлов | CDN/MinIO media acceptance; one opt-in functional MinIO suite; no package test script |
| `@gafus/logger` | 0 | Нет `scripts.test` и исходных test/spec файлов; самостоятельное unit-покрытие отсутствует | build | A2 OTLP/local telemetry contract and API/Worker trace; no own test script or own tests |
| `@gafus/queues` | 2 | Нет `scripts.test`, хотя исходные тесты существуют; это пробел скриптов, не отсутствие тестов | build, typecheck, direct Vitest 2 файлов | Worker/BullMQ tests; direct Vitest queue suites exist but no package test script |
| `@gafus/react-query` | 0 | Нет `scripts.test` и исходных test/spec файлов; самостоятельное unit-покрытие отсутствует | build, typecheck | Web/Mobile/Trainer/Admin React tests; no own tests |
| `@gafus/ui-components` | 0 | Нет `scripts.test` и исходных test/spec файлов; самостоятельное unit-покрытие отсутствует | build, typecheck | Web/Mobile/Trainer/Admin mounted UI suites; no own tests |

## Точные 29 найденных файлов без package test-скрипта

Все перечисленные файлы должны учитываться адресным запуском, а не выпадать из матрицы.

**@gafus/cdn-upload (11)**

- `packages/cdn-upload/src/begetCdnPurge.test.ts`
- `packages/cdn-upload/src/clientPhotoRenditions.1440.test.ts`
- `packages/cdn-upload/src/clientPhotoRenditions.aspect.test.ts`
- `packages/cdn-upload/src/clientVideoMp4.test.ts`
- `packages/cdn-upload/src/isolatedAvatarMedia.test.ts`
- `packages/cdn-upload/src/isolatedLegacyYandex.test.ts`
- `packages/cdn-upload/src/isolatedNonprodS3.test.ts`
- `packages/cdn-upload/src/isolatedQuestionsS3.test.ts`
- `packages/cdn-upload/src/isolatedWeb4NonprodS3.test.ts`
- `packages/cdn-upload/src/questionsV2Cleanup.test.ts`
- `packages/cdn-upload/src/questionsV2Media.test.ts`

**@gafus/chat-media-quality (2)**

- `packages/chat-media-quality/src/index.test.ts`
- `packages/chat-media-quality/src/video-playback-quality.test.ts`

**@gafus/feed-cloud (8)**

- `packages/feed-cloud/src/chat2-v2.test.ts`
- `packages/feed-cloud/src/feed-v2.integration.test.ts`
- `packages/feed-cloud/src/feed-v2.test.ts`
- `packages/feed-cloud/src/hmac.test.ts`
- `packages/feed-cloud/src/image.test.ts`
- `packages/feed-cloud/src/internal-client.test.ts`
- `packages/feed-cloud/src/questions-v2.test.ts`
- `packages/feed-cloud/src/video.test.ts`

**@gafus/feed-storage (6)**

- `packages/feed-storage/src/cdn-isolated-acceptance.test.ts`
- `packages/feed-storage/src/fallback.test.ts`
- `packages/feed-storage/src/keys.test.ts`
- `packages/feed-storage/src/storage.test.ts`
- `packages/feed-storage/src/v2-keys.test.ts`
- `packages/feed-storage/src/web4-functional-minio.acceptance.test.ts`

**@gafus/queues (2)**

- `packages/queues/src/chat2-media-processing-queue.test.ts`
- `packages/queues/src/feed-processing-queue.test.ts`

## Воспроизводимая последовательность для одного агента

```bash
cd /Users/asmtv1/Desktop/gafus-refactor
CATALOG="$HOME/Library/Logs/gafus-refactor-regression/a3-coverage-catalog-20261112"
RUN_ID="postintcov-unique-001"
python3 "$CATALOG/coverage-gate.py" check
python3 "$CATALOG/coverage-gate.py" init --id="$RUN_ID"
python3 "$CATALOG/coverage-gate.py" architecture --id="$RUN_ID"
python3 "$CATALOG/coverage-gate.py" full-build --id="$RUN_ID"
python3 "$CATALOG/coverage-gate.py" extras --id="$RUN_ID"
python3 "$CATALOG/coverage-gate.py" no-test --id="$RUN_ID"
python3 "$CATALOG/coverage-gate.py" verify --id="$RUN_ID"
```

**Эти команды являются планом для будущего объединения; сейчас ничего не запускалось.** Стартовый `init` должен создать новую папку, отсутствовавшую прежде. Старые `results.tsv` и completion.json из другого run ID не принимаются.

### Необходимые предпосылки и несовместимые запуски

- Согласованный и замороженный исходный checkout, pnpm 10.12.4, Node, зависимости установлены. Потребуются PostgreSQL/Redis/MinIO только на отдельных A3/chaos/real-PG этапах, не в package-only проверке.
- `architecture` включает **принудительную сборку**, 33 gate, Web chunked, Mobile/Admin/Trainer, полный typecheck. **Не запускать параллельно** с `pnpm install`, Prisma generate, любыми Vitest/TypeScript/build и правками исходников.
- `extras` — ровно 31 прямой `pnpm --filter <pkg> test` последовательно; каждая квитанция содержит package, exit code, время и ссылку на лог.
- `no-test` — для всех 12 compile/build/typecheck, для 5 пакетов с тестовыми файлами — запуск **всех** файлов непосредственно через root Vitest config. Результат со skipped обязательно фиксируется; opt-in MinIO и ffmpeg могут ограничивать доказательство.
- Для `@gafus/feed-storage` `web4-functional-minio.acceptance.test.ts` без `WEB4_OWN_FUNCTIONAL_S3_TEST=1` штатно пропускается. Для `@gafus/cdn-upload` `clientVideoMp4.test.ts` пропускается без `ffmpeg`. Такие пропуски **не** закрывают соответствующий внешний/реальный сценарий.
- `verify` проверяет наличие исходной сессии, уникальный run ID, timestamp, 33 главных gate, по одной квитанции на каждый из 31 extras и всех 12 no-test, полный Web `completion.json`, совпадение snapshot и отсутствие пропусков без явного аудита.
- Gate из `a3-jobs-media-isolated-acceptance.sh`, `a3-merged-worker-dlq-acceptance.sh`, `architecture-chaos-local.sh`, A2 Observability и все 66 isolated-PG сценарии остаются **отдельными** обязательными разделами полной пост-интеграционной приёмки. Эта матрица не заменяет их и не утверждает внешний Cloud.ru/Beget PASS.

## Инварианты / защита от ложного PASS

1. **57/57** тестируемых пакетов приписаны ровно одному конкретному gate; главный архитектурный runner должен иметь 26 пакетов, остальные 31 только extras.
2. **12/12** пакетов без test-скрипта должны иметь собственные build/typecheck-квитанции, 5 из них дополнительно покрывают 29 исходных тестов.
3. Не принимать package-level `test PASS`, если запуск был не подтверждён в **текущей новой сессии** по неизменному snapshot.
4. Не принимать всего 33 архитектурных gate без driver exit-code и полного `results.tsv`; Web требует отдельный `completion.json` с учётом каждого найденного файла.
5. Тестовые пропуски — `SKIP_REVIEW_REQUIRED` до обоснованного решения; они не замещают недостающие unit-тесты у семи пакетов.
6. Никаких общего дерева, merge, push, production, внешних сервисов или исторических квитанций при создании этого документа.


## Проверка и ревью пропущенных тестов

Скрипт `coverage-gate.py verify` **запрещает безусловный PASS**, если Vitest/Web сообщил skipped. Нужна отдельная текущая approval-квитанция с точным runId, sourceDigest, обоснованием каждого skipped и подписью проверяющего. В противном случае вывод `SKIP_REVIEW_REQUIRED`, ненулевой exit и `a3-coverage-provisional.json`.

Шаблон approval-файла (только после фактического прогона и чтения логов):

```json
{
  "sessionId": "<RUN_ID>",
  "sourceDigest": "<SHA256 FROM a3-coverage-session.json>",
  "approvedBy": "<РЕАЛЬНЫЙ проверяющий>",
  "accepted": [
    {"package": "@gafus/api", "skippedTests": 0, "skippedFiles": 0, "reason": "<Объяснить фактический пропуск и почему он допустим>"}
  ]
}
```
Количество и имена в `accepted` должны **в точности** совпасть с обнаруженными пропусками: образец 0/0 выше не является одобрением. Команда: `python3 "$CATALOG/coverage-gate.py" verify --id="$RUN_ID" --review-skips=<ПУТЬ_К_НОВОМУ_APPROVAL.json>`.
Даже после approval итог ограничен формулировкой `PACKAGE_COVERAGE_PASS_WITH_KNOWN_7_NO_UNIT_TEST_GAPS`, а не «полная регрессия проекта».