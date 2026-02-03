# Server Actions 404/503 - Решение проблемы

## Проблема

Периодически на продакшене веб-приложение падает в офлайн режим с ошибками:

```
POST https://gafus.ru/courses 404 (Not Found)
POST https://gafus.ru/courses 503 (Service Unavailable)
UnrecognizedActionError: Server Action "..." was not found
```

## Причины

1. **Устаревший кеш билда Next.js** — после редеплоя Server Action ID изменяются, но клиент использует старые ID из кеша
2. **Некорректный URL** — Next.js формирует неправильный URL `/courses` вместо правильного эндпоинта Server Actions
3. **Middleware блокирует POST запросы** — Server Actions не проходят через middleware
4. **Offline детектор срабатывает** — из-за 404/503 приложение считает себя офлайн

## Решение

### 1. Настройка Server Actions в next.config.ts

Добавлены `allowedOrigins` для Server Actions:

```typescript
experimental: {
  serverActions: {
    bodySizeLimit: "100mb",
    allowedOrigins: [
      "gafus.ru",
      "https://gafus.ru",
      // ... другие домены
    ],
  },
}
```

### 2. Обновление middleware

Добавлена проверка Server Actions запросов:

```typescript
// Пропускаем Server Actions (POST запросы к страницам)
if (req.method === "POST" && req.headers.get("content-type")?.includes("multipart/form-data")) {
  return NextResponse.next();
}

// Пропускаем Next.js action endpoints
if (req.headers.get("next-action")) {
  return NextResponse.next();
}
```

### 3. Улучшение fetch interceptor

Добавлена обработка Server Actions:

```typescript
// Проверяем, является ли это Server Action запросом
const isServerAction =
  init?.method === "POST" &&
  (requestHeaders.get("next-action") || requestHeaders.get("x-nextjs-data"));

// Логирование 404 для Server Actions
if (response.status === 404 && isServerAction) {
  logger.warn("Server Action not found (404) - возможно устаревший билд");
}
```

### 4. Скрипт очистки кеша

Создан скрипт `apps/web/scripts/clear-build-cache.sh`:

```bash
#!/bin/bash
# Очищает .next, node_modules/.cache, .turbo
./apps/web/scripts/clear-build-cache.sh
```

### 5. Кеш заголовки для Server Actions

Добавлены заголовки для `/_next/data/*`:

```typescript
{
  source: "/_next/data/:path*",
  headers: [
    { key: "Cache-Control", value: "private, no-cache, no-store, must-revalidate" },
  ],
}
```

## Влияние на Git, CI и прод

### Git

В репозитории меняются только файлы: `next.config.ts`, `middleware.ts`, `fetchInterceptor.ts`, скрипты и доки. Со стороны Git ничего особенного не требуется — обычный коммит и пуш.

### Сборка в CI (GitHub Actions)

- В workflow уже вызывается `pnpm build` в `apps/web` без использования старого кеша `.next` между запусками (кеш сохраняется после сборки, но в шаге сборки web не восстанавливается).
- Новый код (в т.ч. `allowedOrigins`, правки middleware) попадает в каждую новую сборку автоматически.
- Менять CI (например, добавлять `pnpm clean`) для этого фикса не обязательно.

### Что реально происходит в проде

1. **После деплоя** на сервере крутится новый образ/билд с обновлённым кодом (новые Server Action ID).
2. **У пользователя в браузере** может быть ещё старый JS (закэшированная страница или старый бандл).
3. Старый JS дергает Server Action по **старому** ID → сервер отвечает 404 (такого ID уже нет).
4. Раньше из-за этого срабатывал переход в офлайн; теперь:
   - middleware не мешает запросам с `next-action`;
   - 404 по Server Action логируется и не обязан переводить приложение в офлайн (зависит от логики в `fetchInterceptor` и offline-детекторе);
   - после обновления страницы пользователь получает новый бандл и проблема уходит.

Итого: правки влияют на **поведение приложения в проде** (меньше ложных офлайнов, корректная работа Server Actions). На **сам процесс сборки в Git/CI** они не накладывают новых требований; скрипт `pnpm clean` / `build:clean` нужен в основном для локальной отладки или если захочешь принудительно собирать без кеша.

## Как использовать

### При деплое

1. Очистите кеш перед сборкой:
   ```bash
   cd apps/web
   ./scripts/clear-build-cache.sh
   pnpm build
   ```

2. После деплоя убедитесь, что клиенты получают свежий билд:
   - Проверьте версию бандла в `/_next/static/chunks/`
   - При необходимости выполните hard refresh (Ctrl+Shift+R)

### При локальной разработке

Если Server Actions не работают:

```bash
# Очистка кеша
cd apps/web
./scripts/clear-build-cache.sh

# Перезапуск dev сервера
pnpm dev
```

### Диагностика

1. **Проверка логов** — ошибки Server Actions логируются:
   ```
   Server Action not found (404) - возможно устаревший билд
   ```

2. **Проверка заголовков** — в Network DevTools:
   - `next-action` должен присутствовать в POST запросах
   - URL должен быть правильным (не `/courses`)

3. **Проверка кеша браузера** — Application → Cache Storage
   - Очистите кеш Service Worker
   - Проверьте версию бандла

## Предотвращение

1. **Очистка кеша при CI/CD** — добавьте в pipeline:
   ```yaml
   - name: Clear Next.js cache
     run: |
       rm -rf apps/web/.next
       rm -rf apps/web/node_modules/.cache
   ```

2. **Версионирование билдов** — добавьте версию в `package.json`:
   ```json
   {
     "version": "1.0.0",
     "scripts": {
       "build": "next build"
     }
   }
   ```

3. **Мониторинг** — отслеживайте 404 ошибки Server Actions в логах

## Дополнительные ресурсы

- [Next.js Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
- [Next.js Caching](https://nextjs.org/docs/app/building-your-application/caching)
- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)
