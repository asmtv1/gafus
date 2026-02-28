# Мониторинг клиентских ошибок: Tracer

Клиентские ошибки (web, trainer-panel) отправляются в Tracer через SDK `@apptracer/sdk`. Серверные логи — в Seq (см. [мониторинг](./README.md)).

**monitor.gafus.ru** — перенаправление на Seq UI.

## Переменные окружения

| Переменная | Описание |
|-----------|----------|
| `NEXT_PUBLIC_TRACER_APP_TOKEN` | App Token из настроек проекта в Tracer |
| `NEXT_PUBLIC_APP_VERSION` | Версия приложения (напр. `1.0.0`) |
| `NEXT_PUBLIC_ENABLE_TRACER` | `"true"` для включения в dev/staging |

## Как работает

1. `TracerProvider` инициализирует SDK в `useEffect` (только в браузере).
2. `initTracerError()` автоматически перехватывает `window.onerror` и `unhandledrejection`.
3. `initTracerErrorUploader({ appToken, versionName })` — запускает отправку на apptracer.ru.
4. `ErrorBoundary.componentDidCatch` вызывает `reportClientError()` → window bridge → `tracerError.error()`.

## Ручная отправка ошибки

```ts
import { reportClientError } from "@gafus/error-handling";
reportClientError(error, { severity: "error", userId: "123" });
```

## CSP

В nginx для web и trainer-panel добавлен явный домен для Tracer:

```
connect-src ... https://errors.apptracer.ru
```

См. `ci-cd/nginx/conf.d/gafus.ru.conf`.
