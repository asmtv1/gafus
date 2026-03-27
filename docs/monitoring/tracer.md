# Мониторинг ошибок: Tracer

Серверные ошибки → Tracer. Логи — stdout (docker logs). Клиентские ошибки (web, trainer-panel, mobile) — через SDK `@apptracer/sdk`. Mobile — кастомный RN-клиент (POST в Tracer API).

## Переменные окружения

### Web / trainer-panel

| Переменная | Описание |
|-----------|----------|
| `NEXT_PUBLIC_TRACER_APP_TOKEN` | App Token из настроек проекта в Tracer |
| `NEXT_PUBLIC_APP_VERSION` | Версия приложения (напр. `1.0.0`) |
| `NEXT_PUBLIC_ENABLE_TRACER` | `"true"` для включения в dev/staging |

### Mobile (apps/mobile)

| Переменная | Описание |
|-----------|----------|
| `EXPO_PUBLIC_TRACER_APP_TOKEN_IOS` | App Token для проекта Гафус-ios |
| `EXPO_PUBLIC_TRACER_APP_TOKEN_ANDROID` | App Token для проекта Гафус-android |
| `EXPO_PUBLIC_TRACER_APP_TOKEN` | Fallback (если платформенные не заданы) |
| `EXPO_PUBLIC_APP_VERSION` | Версия приложения (напр. `1.0.0`) |
| `EXPO_PUBLIC_ENABLE_TRACER` | `"true"` для включения в dev (иначе только production) |

Прокидываются через `app.config.js` в `Constants.expoConfig.extra`. Токен выбирается по `Platform.OS`. Для production EAS Build — задать `EXPO_PUBLIC_TRACER_APP_TOKEN_IOS` и `EXPO_PUBLIC_TRACER_APP_TOKEN_ANDROID` через EAS Secrets.

## Серверные ошибки

Серверные ошибки (при вызове `logger.error()` и `logger.fatal()` с объектом `Error`) автоматически отправляются в Tracer с `errorEventType: "server"`, `component` = appName (web, worker, api и т.д.).

### Переменные

| Переменная | Описание |
|-----------|----------|
| `TRACER_APP_TOKEN` | Токен для серверных приложений. Для Next.js можно использовать `NEXT_PUBLIC_TRACER_APP_TOKEN` |
| `TRACER_SERVER_ENABLED` | `"true"` — включить отправку в dev (иначе только production) |

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

## CSP

В nginx для web и trainer-panel добавлен явный домен для Tracer:

```
connect-src ... https://errors.apptracer.ru
```

См. `ci-cd/nginx/conf.d/gafus.ru.conf`.
