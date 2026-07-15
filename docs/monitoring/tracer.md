# Мониторинг ошибок: Tracer

**Продуктовая аналитика (PostHog, воронки, клики)** — отдельный слой [`@gafus/analytics`](../packages/analytics.md); не смешивать с Tracer и не отправлять ошибки аналитики в `reportClientError`.

Серверные ошибки → Tracer. Логи — stdout (docker logs). Клиентские ошибки web и trainer-panel — через SDK `@apptracer/sdk`. Mobile использует два слоя: кастомный RN-клиент для JS-ошибок и официальные native SDK для Android/iOS crash, ANR и native symbols.

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
| `EXPO_PUBLIC_TRACER_APP_TOKEN`         | Fallback (если платформенные не заданы)                |
| `EXPO_PUBLIC_APP_VERSION`              | Версия приложения (напр. `1.5.5`)                      |
| `EXPO_PUBLIC_ENABLE_TRACER`            | `"true"` для включения в dev (иначе только production) |
| `TRACER_PLUGIN_TOKEN_ANDROID`          | Build-only токен для mapping и native symbols Android  |
| `TRACER_PLUGIN_TOKEN_IOS`              | Build-only токен для загрузки dSYM iOS                 |

App tokens прокидываются через `app.config.js` в `Constants.expoConfig.extra`; JS-клиент выбирает токен по `Platform.OS`. Все четыре платформенные переменные должны быть заданы в EAS Environment `production`; plugin tokens хранятся как `secret` и используются только во время native build.

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
- **ErrorBoundary**: автоматически отправляет ошибки рендеринга
- **Глобальные JS-ошибки**: `installGlobalJsErrorHandler()` в root `_layout` (`ErrorUtils.setGlobalHandler`, `severity` по `isFatal`); без второго провайдера
- **deviceId**: `expo-application.getAndroidId()` на Android, UUID на iOS
- **sessionUuid**: in-memory singleton, генерируется при первом вызове
- **Контракт события**: `type=NON_FATAL|CRASH`, `severity` передаётся отдельно; `versionCode` и данные ОС/устройства берутся из native runtime
- **Self-test**: показывает успех только после `2xx` от AppTracer; тело ошибки сервера отображается администратору

### Native crash reporting

Config plugin `apps/mobile/plugins/withAppTracerNative.js` при `expo prebuild` воспроизводимо добавляет интеграцию по официальным quick start:

- Android: Gradle plugin `ru.ok.tracer` 1.4.0, `tracer-crash-report`, `tracer-crash-report-native`, crash-free и ANR reporting; release build загружает mapping и native symbols.
- iOS: pod `OKTracer` 1.4.0, запуск `TracerService` из `AppDelegate`; Release Archive загружает dSYM отдельной Xcode build phase.

Каталоги `android/` и `ios/` генерируются и не редактируются вручную. Изменение native SDK требует новой Android/iOS-сборки; OTA update недостаточно.

## CSP

В nginx для web и trainer-panel добавлен явный домен для Tracer:

```
connect-src ... https://errors.apptracer.ru
```

См. `ci-cd/nginx/conf.d/gafus.ru.conf`.
