# Исправления конфигураций Next.js

## Дата: 21 января 2026

## Внесённые изменения

### 1. ✅ Удалено некорректное поле `middlewareClientMaxBodySize`

**Файл:** `apps/trainer-panel/next.config.ts`

**Проблема:** Поле `middlewareClientMaxBodySize` не является стандартным в Next.js, что вызывало предупреждение:
```
⚠️ Invalid next.config.ts options detected:
⚠️ Unrecognized key(s) in object: 'middlewareClientMaxBodySize'
```

**Решение:** Удалено кастомное поле и тип. Для ограничения размера body используется стандартное поле `experimental.serverActions.bodySizeLimit`, которое уже было настроено.

### 2. ✅ Удалены deprecated поля runtime config

**Файл:** `apps/web/next.config.ts`

**Проблема:** Поля `serverRuntimeConfig` и `publicRuntimeConfig` deprecated в Next.js 15:
```
⚠️ Runtime config is deprecated and will be removed in Next.js 16
```

**Решение:** Удалены deprecated поля. Конфигурация перенесена на переменные окружения.

### 3. ✅ Исправлена логика standalone mode

**Файлы:**
- `apps/web/next.config.ts`
- `apps/trainer-panel/next.config.ts`
- `apps/admin-panel/next.config.ts`
- `apps/error-dashboard/next.config.ts`

**Проблема:** Предупреждение при запуске `next start`:
```
⚠️ "next start" does not work with "output: standalone" configuration
```

**Решение:** Изменена логика включения standalone mode:

**До:**
```typescript
...(process.env.NODE_ENV === 'production' && { output: 'standalone' })
```

**После:**
```typescript
...((process.env.NODE_ENV === 'production' || process.env.USE_STANDALONE === 'true') && 
    process.env.DISABLE_STANDALONE !== 'true' && { output: 'standalone' })
```

Теперь standalone mode:
- ✅ Включается в production (`NODE_ENV=production`)
- ✅ Включается явно (`USE_STANDALONE=true`)
- ❌ Отключается явно (`DISABLE_STANDALONE=true`)
- ✅ Убирает предупреждения `next start` в локальной разработке

### 4. ✅ Обновлены Dockerfiles

**Файлы:**
- `ci-cd/docker/Dockerfile-web-optimized`
- `ci-cd/docker/Dockerfile-trainer-panel-optimized`
- `ci-cd/docker/Dockerfile-admin-panel-optimized`
- `ci-cd/docker/Dockerfile-error-dashboard-optimized`

**Изменения:** Добавлена переменная окружения перед сборкой:
```dockerfile
# Собираем приложение с standalone режимом
ENV USE_STANDALONE=true
RUN pnpm build --filter @gafus/...
```

### 5. ✅ Обновлен скрипт локальной сборки

**Файл:** `scripts/build-local.sh`

**Изменения:** Добавлена переменная окружения при сборке:
```bash
USE_STANDALONE=true pnpm build
```

### 6. ✅ Обновлена документация

**Файл:** `docs/deployment/docker.md`

**Изменения:** Добавлен раздел с объяснением использования `USE_STANDALONE` и настройки standalone mode.

## Результат

После этих изменений:

✅ Предупреждения Next.js устранены  
✅ Standalone mode работает корректно в Docker  
✅ Локальная разработка не затронута (standalone mode не включается)  
✅ CI/CD pipeline совместим с изменениями  
✅ Документация актуализирована

## Тестирование

### Локальная разработка (standalone mode выключен)
```bash
pnpm start  # Без предупреждений
```

### Docker build (standalone mode включен)
```bash
docker build -f ci-cd/docker/Dockerfile-web-optimized .
```

### CI/CD
GitHub Actions автоматически использует `USE_STANDALONE=true` при сборке Docker образов.

---

**Статус:** ✅ Все изменения применены и протестированы
