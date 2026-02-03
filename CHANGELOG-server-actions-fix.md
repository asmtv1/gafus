# Исправление Server Actions 404/503

## Проблема

Периодически на продакшене веб-приложение падало в офлайн режим с ошибками:
- `POST https://gafus.ru/courses 404 (Not Found)`
- `POST https://gafus.ru/courses 503 (Service Unavailable)`
- `UnrecognizedActionError: Server Action "..." was not found`

Приложение считало себя офлайн из-за 404/503 ошибок Server Actions.

## Причины

1. **Устаревший кеш билда Next.js** — Server Action ID изменяются после редеплоя
2. **Middleware блокировал POST запросы** — Server Actions не проходили через middleware
3. **Некорректная обработка ошибок** — offline detector срабатывал на 404 Server Actions
4. **Отсутствие allowedOrigins** — Next.js формировал неправильные URL

## Изменения

### 1. next.config.ts

**Добавлено:**
- `serverActions.allowedOrigins` — список доменов для Server Actions
- Заголовки для `/_next/data/*` — отключение кеша Server Actions endpoints

```typescript
experimental: {
  serverActions: {
    bodySizeLimit: "100mb",
    allowedOrigins: [
      "gafus.ru",
      "https://gafus.ru",
      "web.gafus.localhost",
      // ...
    ],
  },
}
```

### 2. middleware.ts

**Добавлено:**
- Проверка заголовка `next-action` для пропуска Server Actions
- Проверка `multipart/form-data` POST запросов
- Приоритет проверки ресурсов перед авторизацией

```typescript
// Пропускаем Server Actions
if (req.headers.get("next-action")) {
  return NextResponse.next();
}
```

### 3. fetchInterceptor.ts

**Добавлено:**
- Определение Server Action запросов по заголовкам
- Логирование 404 для Server Actions (признак старого билда)
- Пропуск offline проверок для Server Actions с флагом

```typescript
const isServerAction =
  init?.method === "POST" &&
  (requestHeaders.get("next-action") || requestHeaders.get("x-nextjs-data"));
```

### 4. Скрипт очистки кеша

**Создано:**
- `apps/web/scripts/clear-build-cache.sh` — очистка .next, node_modules/.cache, .turbo
- npm скрипты `clean` и `build:clean` в package.json

```bash
pnpm clean           # Очистка кеша
pnpm build:clean     # Очистка + сборка
```

### 5. Документация

**Создано:**
- `docs/troubleshooting/server-actions-404.md` — подробное описание проблемы и решения

## Как использовать

### При деплое

```bash
cd apps/web
pnpm build:clean
```

### При локальной разработке

Если Server Actions не работают:

```bash
cd apps/web
pnpm clean
pnpm dev
```

### Диагностика

1. Проверьте логи — ошибки Server Actions логируются:
   ```
   Server Action not found (404) - возможно устаревший билд
   ```

2. Проверьте заголовки в Network DevTools:
   - `next-action` должен присутствовать в POST запросах

3. Очистите кеш браузера и Service Worker

## Влияние

### Положительные эффекты
✅ Исправлена проблема с 404/503 для Server Actions
✅ Приложение перестает падать в офлайн без причины
✅ Улучшена диагностика проблем с Server Actions
✅ Добавлены инструменты для очистки кеша

### Возможные риски
⚠️ Middleware пропускает все POST запросы с `next-action` — безопасность обеспечивается в самих Server Actions
⚠️ Отключен кеш для `/_next/data/*` — может немного увеличить нагрузку на сервер

## Тестирование

Проверьте:
1. Server Actions работают без 404/503 ошибок
2. Приложение не падает в офлайн при наличии интернета
3. Push уведомления работают (используют Server Actions)
4. Офлайн режим продолжает работать корректно при реальном отсутствии интернета

## Дополнительные улучшения

### Для production

1. Добавьте очистку кеша в CI/CD pipeline:
   ```yaml
   - name: Clear Next.js cache
     run: |
       rm -rf apps/web/.next
       rm -rf apps/web/node_modules/.cache
   ```

2. Мониторинг 404 Server Actions в логах

3. Версионирование билдов для отслеживания проблем

---

**Автор:** AI Assistant
**Дата:** 2026-02-03
