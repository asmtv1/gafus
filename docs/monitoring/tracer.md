# Мониторинг ошибок: Tracer

**Продуктовая аналитика (PostHog, воронки, клики)** — отдельный слой [`@gafus/analytics`](../packages/analytics.md); не смешивать с Tracer и не отправлять ошибки аналитики в `reportClientError`.

Серверные ошибки → Tracer. Логи — stdout (docker logs). Клиентские ошибки web и trainer-panel — через SDK `@apptracer/sdk`. Mobile использует два слоя: отдельный JavaScript-проект AppTracer для React Native ошибок и официальные native SDK AppTracer для Android/iOS.

## Переменные окружения

### Web / trainer-panel

| Переменная                     | Описание                               |
| ------------------------------ | -------------------------------------- |
| `NEXT_PUBLIC_TRACER_APP_TOKEN` | App Token из настроек проекта в Tracer |
| `NEXT_PUBLIC_APP_VERSION`      | Версия приложения (напр. `1.5.5`)      |
| `NEXT_PUBLIC_ENABLE_TRACER`    | `"true"` для включения в dev/staging   |

### Mobile (apps/mobile)

| Переменная                             | Описание                                               |
| -------------------------------------- | ------------------------------------------------------ |
| `EXPO_PUBLIC_TRACER_APP_TOKEN_IOS`     | App Token для проекта Гафус-ios                        |
| `EXPO_PUBLIC_TRACER_APP_TOKEN_ANDROID` | App Token для проекта Гафус-android                    |
| `EXPO_PUBLIC_TRACER_APP_TOKEN_JS`      | App Token JS-проекта `Гафус-mobile-js`                 |
| `EXPO_PUBLIC_TRACER_APP_TOKEN`         | Fallback (если платформенные не заданы)                |
| `EXPO_PUBLIC_APP_VERSION`              | Версия приложения (напр. `1.5.5`)                      |
| `EXPO_PUBLIC_ENABLE_TRACER`            | `"true"` для включения в dev (иначе только production) |
| `TRACER_PLUGIN_TOKEN_ANDROID`          | Build-only токен для mapping и native symbols Android  |
| `TRACER_PLUGIN_TOKEN_IOS`              | Build-only токен для загрузки dSYM iOS                 |
| `TRACER_SOURCEMAP_TOKEN_MOBILE`        | Build-only pluginToken проекта `Гафус-mobile-js`       |

App tokens прокидываются через `app.config.js` в `Constants.expoConfig.extra`. `pluginToken` проекта `Гафус-mobile-js` используется только локальным upload-скриптом после EAS Update и хранится как EAS `sensitive`: значение маскируется, но доступно через `eas env:exec`. EAS `secret` здесь не подходит, потому что доступен только на удалённом EAS Builder. Все переменные должны быть заданы в EAS Environment `production`.

## Серверные ошибки

Серверные ошибки (при вызове `logger.error()` и `logger.fatal()` с объектом `Error`) автоматически отправляются в Tracer с `errorEventType: "server"`, `component` = appName (web, worker, api и т.д.).

### Переменные

| Переменная              | Описание                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `TRACER_APP_TOKEN`      | Токен для серверных приложений. Для Next.js можно использовать `NEXT_PUBLIC_TRACER_APP_TOKEN` |
| `TRACER_SERVER_ENABLED` | `"true"` — включить отправку в dev (иначе только production)                                  |

## Как работает

### Ошибки

1. `TracerProvider` инициализирует SDK в `useEffect` (только в браузере).
2. `initTracerError()` автоматически перехватывает `window.onerror` и `unhandledrejection`.
3. `initTracerErrorUploader({ appToken, versionName })` — запускает отправку ошибок на apptracer.ru.
4. `ErrorBoundary.componentDidCatch` вызывает `reportClientError()` → window bridge → `tracerError.error()`.

**trainer-panel** использует `TracerLayout` + `setupGlobalErrorHandling` (как web) для улучшенной группировки ошибок: `window.onerror` и `unhandledrejection` отправляются с `issueKey: "GlobalJsError"` / `"UnhandledRejection"`. Логика офлайн-редиректа (как в web) отсутствует — trainer-panel не имеет offline flow.

### Web Vitals (производительность)

TracerProvider также инициализирует сбор метрик Web Vitals:

- `initTracerPerformanceWebVitals()` — сбор LCP, INP, CLS и др. (через `web-vitals`)
- `initTracerPerformanceUploader({ appToken, versionName, environment })` — отправка метрик на apptracer.ru

Метрики помогают выявлять проблемы производительности и подвисаний UI.

## Ручная отправка ошибки

**Web / trainer-panel:**

```ts
import { reportClientError } from "@gafus/error-handling";
reportClientError(error, { severity: "error", userId: "123" });
```

**Mobile:**

```ts
import { reportClientError } from "@/shared/lib/tracer";
reportClientError(error, { issueKey: "MyFeature", keys: { step: "fetch" }, userId: "123" });
```

## Mobile (React Native / Expo)

Реализация: `apps/mobile/src/shared/lib/tracer/`.

- **Включение**: production (`!__DEV__`) или `EXPO_PUBLIC_ENABLE_TRACER=true`
- **JS transport**: React Native-адаптер отправляет формат `JS_STACKTRACE` напрямую в отдельный JS-проект `Гафус-mobile-js` по его `appToken`. Официальный `@apptracer/sdk` рассчитан на браузерные `window`, `document`, `localStorage` и XHR, поэтому в native runtime используется совместимый транспорт поверх `fetch`.
- **ErrorBoundary и unhandled JS**: ошибки рендера отправляются явно; необработанные JS-ошибки перехватываются через React Native `ErrorUtils`.
- **Контекст**: route, internal user ID, platform, native build, EAS Update ID/channel/runtimeVersion и состояние сети.
- **Breadcrumbs**: навигация и API-запросы (method, безопасный endpoint, status, duration); request/response body и credentials не записываются.
- **Privacy**: request, cookies, auth headers, token/password/email/phone-поля и console breadcrumbs отбрасываются или редактируются до отправки.
- **Группировка**: `issueKey` передаётся штатным полем AppTracer, дополнительные простые значения — как tags.
- **Self-test**: показывает успех только после HTTP-подтверждения загрузки. Без `EXPO_PUBLIC_TRACER_APP_TOKEN_JS` возвращается явная ошибка конфигурации.
- **Логи события**: последние переходы и API breadcrumbs передаются как base64 `logsFile` в формате AppTracer; лимит сырого лога — 64 КБ.

### Native crash reporting

Config plugin `apps/mobile/plugins/withAppTracerNative.js` при `expo prebuild` воспроизводимо добавляет интеграцию по официальным quick start:

- Android: Gradle plugin `ru.ok.tracer` 1.4.0, Java/Kotlin crash, NDK crash, ANR, crash-free, сохранение предыдущего log buffer и рекомендуемый non-fatal rate limit; release build загружает mapping и native symbols.
- Android-загрузка mapping/native symbols работает в строгом режиме: ошибка отправки останавливает release build. Не включайте `dontFailOnUploadFailure` для обхода ошибки, если требуется гарантировать загрузку символов. Для диагностики отдельно запустите `./gradlew :app:generateTracerNativeSymbolsForRelease --info --console=plain` из `apps/mobile/android`; сохраните каталог `app/build/tracer` перед очисткой сборки. См. [параметры AppTracer](https://apptracer.ru/doc/android/config/).
- iOS: pod `OKTracer` 1.4.0, crash reporter, очередь non-fatal и MetricKit (hang/CPU/disk/launch/crash/watchdog/deadlock); Release Archive загружает dSYM отдельной Xcode build phase.

Каталоги `android/` и `ios/` генерируются и не редактируются вручную. Изменение native SDK требует новой Android/iOS-сборки; OTA update недостаточно.

### Source maps для EAS Update

AppTracer сопоставляет source maps по `versionName` и пути файла. Поэтому штатные команды публикации обёрнуты скриптом:

```bash
pnpm --filter @gafus/mobile update:ota:production -- --message "описание"
```

Команда сначала получает маскируемый `TRACER_SOURCEMAP_TOKEN_MOBILE` через `eas env:exec`, затем вызывает `eas update --emit-metadata --json`, извлекает отдельные iOS/Android update ID и загружает `dist/**/*.map` для каждой версии вида `1.7.0-ota.<12 символов updateId>`. Runtime отправляет в AppTracer ровно такой же `versionName`.

Для ручной загрузки карты embedded build:

```bash
TRACER_SOURCEMAP_VERSION_NAME=1.7.0-build.15 \
TRACER_SOURCEMAP_VERSION_CODE=14 \
pnpm --filter @gafus/mobile tracer:sourcemaps
```

## CSP

В nginx для web и trainer-panel добавлен явный домен для Tracer:

```
connect-src ... https://errors.apptracer.ru
```

См. `ci-cd/nginx/conf.d/gafus.ru.conf`.
