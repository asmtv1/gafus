# GAFUS — Expo SDK 57: локальная приёмка и интеграция (13.11.2026)

## Статус

**Все доступные локальные этапы выполнены и выборочно объединены в основном дереве.** Это **не** разрешение на публикацию: финальная подписанная iOS-сборка, физические устройства, облачный Uptrace и развёртывание API/Worker остаются отдельными release-gates.

Источник миграции: отдельный checkout `/Users/asmtv1/Desktop/gafus-sdk57-qa-20261113`, общий checkout `/Users/asmtv1/Desktop/gafus-refactor`. Базовый Git HEAD в обеих копиях во время интеграции: `0dcd18c13`. Изменения сохранены **незакоммиченными** для совместной приёмки с остальными агентами; merge/push/deploy не выполнялись.

## Выполнено локально

| Этап | Подтверждение |
| --- | --- |
| SDK 55 baseline | Node 22 отдельно от системного Node 20, workspace-build, Mobile TypeScript и lint, адресные OTA/tracer тесты — PASS |
| SDK 56 checkpoint | Промежуточная установка, TypeScript, Hermes/Metro iOS+Android, `expo prebuild`, адресные тесты — PASS |
| SDK 57 | Expo 57.0.33, React Native 0.86.3, React 19.2.3, Expo Router 57.0.31, Worklets 0.10.1; `expo install --check`, Mobile TS — PASS |
| Патчи нативных модулей | Widget commands и GPS background consumer повторно перенесены на `expo-widgets@57.0.28` и `expo-location@57.0.23` через pnpm patches |
| Android | `assembleRelease`: 1 526 задач, PASS; `bundleRelease`: 1 528 задач, PASS; AAB (~196 MiB), `bundletool validate` и `PAGE_ALIGNMENT_16K`: PASS; ELF 67/67, compressor и App Links, universal APK `zipalign -c -P 16`: PASS |
| Финальный JS | Свежий Hermes/Metro export iOS+Android + source maps, `verify-sdk57-bundles.mjs` и iOS YooKassa checkout scan — PASS |
| Полные QA suites | Mobile: **2 765 PASS / 1 skipped**; API: **2 836 PASS / 266 skipped**; Worker: **266 PASS / 13 skipped** |
| Реальный PostgreSQL | Отдельная временная БД: grants, durable ACK, replay dedup, release scope, daily budget, Observe native preview — PASS |
| SDK 57 телеметрия | JS очередь 500 событий / 8 МиБ, батчи до 50, долговременный ACK, очистка PII, API upload-grants, PostgreSQL spool, OTLP log worker, bounded retry, метрики — адресные тесты PASS |
| OTA | Тесты self-hosted OTA и release contracts, политики версионирования runtime, проверка релизного JS-графа и локальная подготовка приватных symbol maps — PASS |
| Общее дерево после переноса | Frozen lockfile install, Prisma generate/validate, `@gafus/types` build, TS Mobile/API/Worker, lint, Expo install check, `@gafus/logger`/API/Worker build, адресные тесты — PASS |

Android AAB служит **нативным smoke-доказательством SDK 57**, а не окончательным подписанным релизом: последние правки JS-очереди и splash прошли отдельный повторный Hermes export; перед публикацией нужен свежий подписанный бинарник из зафиксированного Git SHA.

## Объединение с основным деревом

- Выбрано **80** относящихся к SDK 57/OTA/телеметрии файлов: 30 новых и 50 изменённых. Файлы тренерской панели, `packages/auth`, NPD и посторонние тесты в патч не включались.
- Текстовые изменения применены только после SHA-проверки preimage каждого файла; после применения проверен SHA каждого итогового файла. Резервные исходные версии: `/Users/asmtv1/Desktop/gafus-sdk57-qa-20261113/.qa/sdk57/sdk57-merge-20261113T071257Z`.
- `pnpm-lock.yaml` **не заменялся** QA-копией: он пересоздан из актуальных манифестов основного дерева через `pnpm install --lockfile-only --ignore-scripts`; затем frozen install прошёл.
- Дополнительно адаптирован `native-release-contract.mjs` и его тест: для 1.8.0 требуется полноэкранный splash `cover`, прежнее правило SDK 55 сохранено.
- QA-only GitHub Actions workflow использует Node 22, dev-зависимости для тестов и выставляет `SYMBOLS_UPLOAD_EXECUTE=0`. Любое сетевое обновление/загрузка symbol maps остаётся отключённым без отдельного разрешения.

## Настройка и безопасность телеметрии

Новые пути по умолчанию **выключены**. Используются `GAFUS_TELEMETRY_INGEST_ENABLED`, `GAFUS_TELEMETRY_EXPORT_ENABLED`, `GAFUS_TELEMETRY_ENVIRONMENT`, `UPTRACE_DSN`, серверный `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` (или базовый `OTEL_EXPORTER_OTLP_ENDPOINT`). Production дополнительно требует `GAFUS_TELEMETRY_PRODUCTION_APPROVED=true`; клиент — подписанный/проверенный runtime и ограниченный по времени токен upload-grant. В PostgreSQL сохраняется только hash grant-токена. Невалидные и неизвестные поля не проходят контракт, стеки нормализуются, а тело ошибки и подписанные URL не передаются в Uptrace.

Expo Observe native эксперимент строго opt-in (`GAFUS_OBSERVE_EXPERIMENT` в нативном preview-профиле и отдельный server preview-gate). Его native OTLP endpoint принимает только нормализованные ошибки, метрики намеренно закрыты, пока не введён отдельный контракт безопасности. Сам `expo-observe` **не включён в обычный production-бинарник**: этого недостаточно, чтобы утверждать, что настоящие нативные падения iOS/Android уже поступают в Uptrace. Не включать эксперимент без полной end-to-end проверки.

## Внешние / release-gates — пока не выполнены

1. **iOS:** установлен Xcode 26.3; для целевой SDK 57 требуется Xcode 26.4+. После обновления выполнить чистую iOS archive/TestFlight-сборку, проверить entitlement/widget/App Groups/OTA signature и физический iPhone.
2. **Android:** тест 16 KB запуска на **отдельном эмуляторе выполнен** (см. дополнение ниже); остаются физический аппарат, финальный подписанный App Bundle/Google Play App Signing, уведомления, виджеты, foreground-service, медиа и долгая GPS-прогулка с выгрузкой приложения.
3. **Совместимость старых клиентов:** прогнать HTTP/API/Worker регрессию 1.7.2, 1.7.3 и 1.7.4 против **развёрнутой** новой версии, не только по локальным контрактам.
4. **OTA:** пройти preview cohort 0→5→25→100%, проверку rollback и code signing на реальных устройствах с отдельным релизным attestation; не направлять production runtime на экспериментальный JS.
5. **Uptrace Cloud:** настроить серверный DSN/OTLP endpoint в секретах окружения, применить аддитивную Prisma migration, поднять API/Worker только в разрешённом preview, проверить искусственные JS crash, native crash, offline/online, дедупликацию, retry и приватность. Внешняя доставка реальному провайдеру сейчас **не подтверждена**.
6. **Private symbol maps:** загрузить в выделенный закрытый S3 bucket только после подтверждённого CI, сравнить HEAD/GET и retention; текущий QA только готовит и тестирует приватные артефакты, не публикует их.
7. **Магазины:** не публиковать iOS/Android production и не выполнять production schema migration без отдельных smoke, review и release approvals.

## Логи и артефакты локальной QA

В изолированном дереве: `.qa/sdk57/mobile-suite-after-startup.log`, `api-suite-final.log`, `worker-suite-final.log`, `final-sdk57-bundle-graph.json`, `android-assemble-release.log`, `android-bundle-release.log`, `aab-16k.log`, `aab-zipalign-check.log`, `pg-ingest-realpg-vitest-v5.log`, `observe-realpg-test.log`, `main-frozen-install.log`, `main-typecheck-{mobile,api,worker}-after-build.log`, `main-{mobile,api,worker}-targeted-tests.log`, `sdk57-curated-merge-manifest.json`.

**Результат:** локальная миграция и безопасная интеграция выполнены. До закрытия перечисленных внешних ворот статус релиза — **не готов к публикации**.


## Дополнение — настоящий 16 KB Android smoke и Expo Observe experiment (13.11.2026)

- Создан **отдельный** AVD `GafusSDK57_16kb` Android 15 Google APIs ARM64 с image `google_apis_ps16k`, не меняющий прежний AVD. ADB `emulator-5580`, `getconf PAGE_SIZE=16384`.
- Первый изолированный Android smoke выявил реальную несовместимость `@expo/dom-webview@55.0.6` с `expo-modules-core@57.0.26`. На холодном запуске случился `NoClassDefFoundError: expo.modules.kotlin.types.AnyTypeProvider` внутри `DomWebViewModule.definition`. Вывод — SDK 57 нельзя считать готовым только по `assembleRelease` и анализу AAB.
- Исправление: в **мобильном** workspace явная зависимость `@expo/dom-webview@~57.0.1`, при этом root Expo SDK 55 (`~55.0.31`) и пакеты других агентов не менялись. В основном дереве обновлён lockfile через pnpm, без копирования QA-lockfile. Новый `apps/mobile/scripts/sdk57-dom-webview-native-compat.test.mjs` проверяет версии Expo/DOM и importer в lockfile; тест добавлен в SDK 57 CI.
- Изолированная QA-копия с `expo-observe@57.0.28` и DOM WebView 57 повторно прошла **Android `assembleRelease`**. APK был подписан только штатным временным debug keystore для локального теста. С отключёнными Wi-Fi и мобильными данными `adb install -r --no-incremental ...app-release.apk` — PASS; `am start -W -n ru.gafus.app/.MainActivity` — PASS (cold launch); через 20 секунд `pidof ru.gafus.app` вернул **PID 5328**, нативные crash markers отсутствуют. Результат относится к локальному эмулятору 16 KB и offline startup, не является QA реального пользовательского сценария.
- SDK 57 native Observe **проверен только в изолированной экспериментальной сборке**: `expo-observe@57.0.28`, GAFUS `api/v1/telemetry/observe` и preview OTA, без AppTracer-native второго обработчика. В основное `apps/mobile/package.json` Observe намеренно **не включён** до испытания облачной доставки и приватности; подтверждён лишь успешный native compile, а не реальные нативные падения в Uptrace.
- Дополнительно локально: API-auth/mobile-settings/OTA compatibility 43/43 PASS; Node OTA сценарии 21/21 PASS; анонимный ingest rate limiter исправлен так, что global budget работает без доверенного IP и не превращает весь трафик клиентов в одного peer. По адресной API-регрессии 11/11 PASS.

**Логи:** `/Users/asmtv1/Desktop/gafus-sdk57-qa-20261113/.qa/sdk57/observe-qa/16kb-am-start-logcat.txt` (обнаруженный дефект), `android-dom57-fixed-assemble.log` (повторная сборка), `16kb-dom57-fixed-logcat.txt` (успешный offline запуск), `dom-webview-native-compat-test.log`, `main-legacy-client-contracts.log`, `main-ota-replay-contracts-fixed.log`, `main-ingress-limiter-regression.log`.

**Оставшиеся внешние release-gates** из предыдущего раздела не отменяются: Xcode 26.4+, iOS native архив, реальные iPhone/Android, end-to-end старых клиентов с развёрнутым API, закрытый S3 source maps, защищённый preview Uptrace и утверждённый OTA/Store rollout.


### Последние локальные подтверждения после фикса DOM 57

- В QA-копии после обновления DOM WebView до 57.0.1 выполнен **`gradlew :app:bundleRelease` — PASS**. Bundletool: `validate` — PASS, `PAGE_ALIGNMENT_16K` — PASS, локальный `verify-android-aab-16k.mjs` (ELF) — PASS, compressor и App Links — PASS.
- Контрольный AAB preview QA с Native Observe: размер около 196 MiB, SHA-256 `c57defcfe8a067cfd107f17fbba1a6b9478bb4b7e2d172353c858d50be45c7a4`. Он **не** соответствует будущему production-бинарнику: экспериментальная QA-сборка включает Native Observe, использует QA-cert/preview OTA и debug signing. Перед публикацией нужно собрать и подписать production AAB из зафиксированного исходного SHA.
- В основном дереве после точечного переноса `@expo/dom-webview@~57.0.1`: `pnpm install --frozen-lockfile --ignore-scripts` — PASS, TypeScript Mobile/API/Worker — PASS, Expo `install --check` — PASS, DOM57 ABI guard — 2/2 PASS, и QA CI workflow содержит этот тест.
- Корневое `pnpm.overrides["vitest@<4.1.0"] = "4.1.0"` корректно нормализует importer `packages/mobile-ota-server` в lockfile. Поправлена адресная проверка `verify-ota-preview-workflow.test.mjs`, теперь она сверяет **эффективную** версию для данного override, а не требует исходный диапазон. OTA workflow и DOM guard — 8/8 PASS. Остальные зависимости и чужие исходники не заменялись.
- Выключенные по умолчанию OTLP/Observe, отсутствие подтверждённой доставки в Uptrace, старые магазинные версии и физические устройства по-прежнему являются отдельными воротами. **Нет оснований считать релиз 1.8.0 готовым к App Store/Google Play без них**.

## Сверка QA-копии с основным деревом (13.11.2026)

- Побайтово сверены изменённые и новые файлы из `gafus-sdk57-qa-20261113` и `gafus-refactor` без временной `.qa` и сборочных артефактов. Все релевантные изменения SDK 57 уже находятся в основной папке.
- Сохранены более свежие правки основной папки в `apps/trainer-panel`, `packages/auth`, `packages/npd/tsconfig.json` и двух `scripts/qa/*real-pg*` / `architecture-phase-f*` smoke-тестах. Перезапись старыми QA-версиями недопустима.
- Три файла остались только в QA: `patches/expo-location@56.0.26.patch`, `patches/expo-widgets@56.0.27.patch` (устаревшие патчи SDK 56) и `scripts/qa/upgrade-expo-sdk.mjs` (преднамеренно работает только внутри QA-копии).
- `expo-observe@57.0.28` сохраняется в QA, а не в основной мобильной зависимости: нативный модуль автоматически регистрирует обработчики и может использовать endpoint Expo по умолчанию без явного `GAFUS_OBSERVE_EXPERIMENT=true`. Для безопасного переноса нужен отдельный нативный fail-closed gate, который исключает стороннюю отправку в обычном бинарнике.
- После сверки: `pnpm install --frozen-lockfile --ignore-scripts --offline` — PASS; Expo dependency check offline — PASS; дефолтный Expo config без Observe experiment — PASS; Node Observe/DOM/OTA — **11/11 PASS**; Mobile TypeScript — PASS. Не выполнялись commit, push или production-действия.
