# Нативные падения iOS/Android → GAFUS → Uptrace

## Реализация для Expo SDK 57

Нативная зависимость `expo-observe@57.0.28` и её `expo-app-metrics` захватывают crash-отчёты в собственной памяти/хранилище ОС до запуска JavaScript. При следующем запуске или получении отложенного отчёта от ОС SDK отправляет OTLP/JSON. На iOS используется MetricKit (может передавать отчёт с задержкой); на Android — JVM crash handler и доступная системная история аварий (Android 11+). SDK **не гарантирует ANR, OOM, все сигналы/смерти процесса, 100% доставку и символикацию**; их нельзя автоматически считать подтверждёнными.

`apps/mobile/app.config.js` через `native-crash-uptrace-config.cjs` **встраивает в нативную сборку** endpoint `https://api.gafus.ru/api/v1/telemetry/observe` в `extra.eas.observe.endpointUrl`. Expo добавляет ID проекта и `/v1/logs` или `/v1/metrics`; это *не* DSN Uptrace и не экспортер Expo. SDK/проект и разрешённый API origin проверяются в config preflight, а токен Uptrace в приложение не попадает. Отсутствие `expo-observe`/неправильная версия останавливает сборочный контракт.

`nativeCrashCapture.ts` конфигурирует SDK при старте приложения с `sampleRate=1`, `dispatchInDebug=false` и `dispatchingEnabled` по `EXPO_PUBLIC_TELEMETRY_ENABLED`. Нулевой sampleRate выключил бы и нативные падения. Ошибки JS по-прежнему поступают через отдельную локальную очередь GAFUS; серверный Observe-маршрут принимает **только** FATAL `native.exception` с `expo.error.source=nativeCrash`, игнорируя дублирующие JS-логи.

Цепочка: **iOS/Android native crash → устройство/Expo Observe → GAFUS API → allowlist очистки данных → проверка NativeRelease → PostgreSQL `MobileTelemetrySpool` → Worker → OTLP Uptrace logs**.

Никакие сырые stack/message, private URLs, номера устройств, email, пользовательские данные и SDK-токены не передаются в Uptrace. Экспортирует только вид ошибки, имена проверенных функций, смещения в бинарнике, точную версию приложения/runtime/build и ограниченную инфраструктурную метаинформацию. Для postmortem-символикации отдельно требуются проверенные private dSYM и Android mapping/symbols в Cloud.ru S3.

## Серверный production gate

В production deploy выставляются `GAFUS_OBSERVE_NATIVE_INGEST_ENABLED=true`, `GAFUS_TELEMETRY_ENVIRONMENT=production`, `GAFUS_TELEMETRY_PRODUCTION_APPROVED=true` и `GAFUS_TELEMETRY_INGEST_ENABLED=true`. Docker Compose передаёт этот flag только API; при отсутствии любого флага endpoint возвращает 503.

Приём `/api/v1/telemetry/observe/{expoProjectId}/v1/logs` ограничен размером JSON, rate gate, строгим SDK 57 и platform/build/runtime/channel/environment; выпуск должен соответствовать **verified** записи `MobileNativeRelease` в базе. Иначе отчёт не считается подтверждённым. В upstream отправляется только нормализованный JSON, не сырой OTLP клиента. Production `/v1/metrics` проверяет release metadata и намеренно отбрасывает дополнительные startup-метрики Observe (единственный сборщик технических инфраструктурных метрик — Alloy/Uptrace). Preview metric-canary не меняется.

## Локальные проверки до push

```bash
node --test apps/mobile/scripts/native-crash-uptrace-config.test.cjs
pnpm --filter @gafus/mobile typecheck
pnpm --filter @gafus/api exec vitest run src/modules/mobile-telemetry/observe-normalizer.test.ts src/routes/v1/mobile-observe-preview.test.ts
pnpm --filter @gafus/worker exec vitest run src/mobile-telemetry-export.test.ts
pnpm exec tsx --test packages/types/src/contracts/nativeCrashFrames.test.ts
bash scripts/observability/run-isolated-telemetry-pg.sh
node --test scripts/observability/check-workflow-release-gates.test.mjs
```

Изолированная PG проверяет и **iOS, и Android**: verified release, FATAL native_crash, durable persist, event-id replay/dedup, PII scrub, неверный build=403. Worker тест подтверждает OTLP FATAL и безопасные атрибуты без секретов. Это **не является доказательством** доставки физического падения с телефона в Uptrace Cloud.

## Обязательная приёмка нового нативного билда

1. После чистой native prebuild собрать **новый** production/internal binary для каждой платформы. Старый SDK55/Store binary, OTA поверх старого бинарника и Expo Go не включают этот нативный SDK; не устанавливать два crash SDK одновременно. Зарегистрировать exact build/version/runtime в `MobileNativeRelease` как `verified` после проверки подписанного native-release.
2. На физическом Android (сначала Java/Kotlin exception, затем Android 11+ системная авария) и физическом iPhone (подтверждённый MetricKit native crash) выполнить контролируемое аварийное завершение на **специальной тестовой сборке**, не в массовой публичной. Перезапустить приложение; для iOS учитывать возможную задержку delivery от MetricKit.
3. Убедиться, что POST возвращает 200 после durable write, затем Worker помечает событие как exported и в Uptrace в проекте GAFUS появляется `service.name=gafus-mobile-android` или `gafus-mobile-ios`, `gafus.event_kind=native_crash`, `gafus.error_code=NATIVE_CRASH`, `severity=FATAL`, exact build. Нет PII, JS duplicate или неопознанных атрибутов. Проверить retry/offline, один eventId без дублей и отказ для неразрешённого релиза.
4. Проверить private iOS dSYM, Android symbols/mapping и работу алертов/дашбордов. ANR/OOM документировать как отдельные ограничения — наличие string literals `anr`/`oom` в схеме не означает реальный сбор таких событий.

**Не отключать старый мониторинг в уже установленных клиентах через remote kill-switch и не считать новый native путь подтверждённым, пока нет физического crash→relaunch→Uptrace readback по каждой платформе.** Код интеграции готов локально, на production не выкатывался.
