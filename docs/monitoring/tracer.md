# Мониторинг клиентских ошибок: Tracer

Клиентские ошибки (web, trainer-panel, mobile) отправляются в Tracer. Web/trainer-panel — через SDK `@apptracer/sdk`. Mobile — кастомный RN-клиент (POST в Tracer API). Серверные логи — в Seq (см. [мониторинг](./README.md)).

**monitor.gafus.ru** — перенаправление на Seq UI.

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
| `EXPO_PUBLIC_TRACER_APP_TOKEN` | App Token из настроек проекта в Tracer |
| `EXPO_PUBLIC_APP_VERSION` | Версия приложения (напр. `1.0.0`) |
| `EXPO_PUBLIC_ENABLE_TRACER` | `"true"` для включения в dev (иначе только production) |

Прокидываются через `app.config.js` в `Constants.expoConfig.extra`. Для production EAS Build — задать через EAS Secrets.

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
- **TracerProvider**: перехватывает глобальные JS-ошибки через `ErrorUtils.setGlobalHandler`
- **deviceId**: `expo-application.getAndroidId()` на Android, UUID на iOS
- **sessionUuid**: in-memory singleton, генерируется при первом вызове

## CSP

В nginx для web и trainer-panel добавлен явный домен для Tracer:

```
connect-src ... https://errors.apptracer.ru
```

См. `ci-cd/nginx/conf.d/gafus.ru.conf`.
