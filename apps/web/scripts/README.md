# Web Scripts

Утилитные скрипты для работы с веб-приложением.

## clear-build-cache.sh

Очищает кеш билда Next.js.

### Использование

```bash
# Прямой запуск
./scripts/clear-build-cache.sh

# Через npm скрипт
pnpm clean

# С последующей сборкой
pnpm build:clean
```

### Что очищается

- `.next/` — билд Next.js
- `node_modules/.cache/` — кеш Webpack/Turbopack
- `.turbo/` — кеш Turborepo

### Когда использовать

1. **Server Actions не работают** — ошибки 404/503
2. **Странное поведение после обновления** — кеш не обновился
3. **Проблемы с HMR** — Hot Module Replacement не работает
4. **Перед деплоем** — гарантия чистой сборки

### Пример

```bash
cd apps/web

# Очистка кеша
pnpm clean

# Запуск dev сервера
pnpm dev

# Или сразу сборка
pnpm build:clean
```

## analyze-bundle.js

Анализ размера бандла Next.js.

### Использование

```bash
# Сборка с анализом
pnpm analyze:build

# Анализ существующего билда
pnpm analyze
```

Откроется отчет в браузере с визуализацией размеров модулей.

## Другие скрипты

### package.json scripts

```json
{
  "scripts": {
    "dev": "PORT=3002 next dev",
    "build": "next build",
    "build:clean": "bash scripts/clear-build-cache.sh && next build",
    "start": "PORT=3002 next start",
    "clean": "bash scripts/clear-build-cache.sh",
    "lint": "eslint src --ext .js,.jsx,.ts,.tsx",
    "lint:fix": "eslint src --ext .js,.jsx,.ts,.tsx --fix",
    "typecheck": "tsc --noEmit",
    "analyze": "node scripts/analyze-bundle.js",
    "analyze:build": "ANALYZE=true npm run build"
  }
}
```

### Описание

- `dev` — запуск dev сервера на порту 3002
- `build` — production сборка
- `build:clean` — очистка кеша + сборка
- `start` — запуск production сервера
- `clean` — очистка кеша билда
- `lint` — проверка ESLint
- `lint:fix` — автофикс ESLint
- `typecheck` — проверка типов TypeScript
- `analyze` — анализ размера бандла
- `analyze:build` — сборка с анализом

## Troubleshooting

### Server Actions 404

См. `docs/troubleshooting/server-actions-404.md`

### Проблемы с сборкой

1. Очистите кеш:
   ```bash
   pnpm clean
   ```

2. Переустановите зависимости:
   ```bash
   rm -rf node_modules
   pnpm install
   ```

3. Очистите Turbo кеш:
   ```bash
   rm -rf .turbo
   ```

### Проблемы с dev сервером

1. Убедитесь, что порт 3002 свободен:
   ```bash
   lsof -ti:3002 | xargs kill -9
   ```

2. Очистите кеш:
   ```bash
   pnpm clean
   ```

3. Перезапустите:
   ```bash
   pnpm dev
   ```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Clear build cache
  run: |
    cd apps/web
    rm -rf .next
    rm -rf node_modules/.cache
    rm -rf .turbo

- name: Build
  run: pnpm build
```

### Docker

```dockerfile
# В multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем файлы
COPY . .

# Очистка кеша
RUN cd apps/web && \
    rm -rf .next node_modules/.cache .turbo

# Сборка
RUN pnpm install && pnpm build
```

## Мониторинг

Отслеживайте проблемы с Server Actions:

```typescript
// В логах
logger.warn("Server Action not found (404) - возможно устаревший билд");
```

Настройте алерты на 404 для Server Actions в production.
