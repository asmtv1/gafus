# Инвалидация кэша между приложениями (web ↔ trainer-panel)

## Проблема

**web** и **trainer-panel** — это **отдельные Next.js процессы** (разные Docker контейнеры), у каждого свой кэш в памяти/файлах. Когда тренер в **trainer-panel** создаёт, обновляет или удаляет курс, кэш инвалидируется только в trainer-panel. Пользователи на **web** продолжают видеть старые данные (удалённые курсы, старые названия и т.д.) до истечения TTL кэша (5-20 минут).

На web список курсов также восстанавливается из persist (localStorage). Клиент при загрузке/обновлении страницы `/courses` сравнивает набор id курсов с серверными данными: при отличии (например, курс удалён в trainer-panel) store перезаписывается серверными данными. Поэтому после удаления курса в trainer-panel и вызова revalidate на web курс исчезнет при следующей загрузке или обновлении (F5) страницы `/courses`.

## Решение

После операций с курсами/днями в **trainer-panel** автоматически вызывается API на **web** для инвалидации его кэша. Реализовано через:

### 1. API endpoints на web

- **`POST /api/revalidate/courses`** — инвалидирует кэш курсов (вызывается при создании, обновлении, удалении курса)
- **`POST /api/revalidate/training-days`** — инвалидирует кэш дней (вызывается при изменении дней курса)

Оба endpoint требуют:
- либо роль `ADMIN` / `TRAINER` в сессии
- либо заголовок `Authorization: Bearer <REVALIDATE_SECRET_TOKEN>`

### 2. Вызовы из trainer-panel

После операций с курсами функции `invalidateCoursesCache()` и `invalidateTrainingDaysCache()` из `trainer-panel/src/shared/lib/actions/` делают `fetch()` к web API для инвалидации кэша web.

### 3. Переменные окружения

Для работы нужны:

**В trainer-panel:**
```bash
# URL web-приложения для вызова API
NEXT_PUBLIC_SITE_URL=https://www.gafus.ru  # или https://gafus.ru

# Секретный токен для межсервисных вызовов (должен совпадать с web)
REVALIDATE_SECRET_TOKEN=<случайная строка>
```

**В web:**
```bash
# Секретный токен для проверки запросов от trainer-panel
REVALIDATE_SECRET_TOKEN=<та же строка, что в trainer-panel>
```

Сгенерировать токен можно так:
```bash
openssl rand -base64 32
```

## Проверка

1. В trainer-panel создать/обновить/удалить курс
2. В логах trainer-panel: `[Cache] Web courses cache invalidated successfully`
3. На web обновить страницу `/courses` — изменения должны быть видны сразу (без ожидания 5-20 минут)

Если в логах:
- `REVALIDATE_SECRET_TOKEN not set, skipping web cache invalidation` — добавить переменную в оба приложения
- `Failed to invalidate web courses cache` (403) — проверить токен или роль в сессии
- `Error invalidating web courses cache (non-critical)` — проверить NEXT_PUBLIC_SITE_URL и доступность web

## Альтернативы

Если межсервисные вызовы недоступны (например, в dev с localhost), кэш на web инвалидируется по истечении TTL:
- Курсы: 5-20 минут (`revalidate` в `unstable_cache`)
- Дни: по тегам при обновлении страницы (Next.js ISR)

Для мгновенной инвалидации в dev можно вручную вызвать `/api/revalidate/courses` из браузера (с авторизацией ADMIN/TRAINER).
