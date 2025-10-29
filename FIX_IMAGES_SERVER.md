# Исправление отображения изображений на сервере

## Проблема

На production сервере не отображались картинки, хотя локально всё работало:
- Ошибки 400 (Bad Request) на `/_next/image?url=/uploads/...`
- Ошибки 404 на прямые запросы к `/uploads/...`

## Причина

Next.js Image Optimization API не мог получить доступ к исходным изображениям, потому что:
1. Nginx перехватывал запросы к `/uploads/` и проксировал их напрямую на CDN
2. Next.js внутри контейнера не мог получить файлы для оптимизации
3. Требовалась интеграция Next.js с внешним CDN

## Решение (Best Practice)

Использован **Custom Image Loader** - официальный способ интеграции Next.js с внешними CDN.

### 1. Создан Custom Image Loader

**Файл:** `apps/web/src/shared/utils/imageLoader.ts`

```typescript
export default function imageLoader({ src, width, quality }) {
  // Для изображений с CDN - возвращаем как есть
  if (src.startsWith("https://gafus-media.storage.yandexcloud.net")) {
    return src;
  }

  // Для /uploads/* - используем CDN напрямую
  if (src.startsWith("/uploads/")) {
    return `https://gafus-media.storage.yandexcloud.net${src}`;
  }

  // Для локальных файлов - используем встроенную оптимизацию Next.js
  return `/_next/image?url=${src}&w=${width}&q=${quality || 75}`;
}
```

### 2. Обновлена конфигурация Next.js

**Файл:** `apps/web/next.config.ts`

```typescript
images: {
  loader: 'custom',
  loaderFile: './src/shared/utils/imageLoader.ts',
  remotePatterns: [
    { protocol: "https", hostname: "gafus-media.storage.yandexcloud.net" },
    { protocol: "https", hostname: "storage.yandexcloud.net" },
  ],
}
```

Удалены ненужные:
- `rewrites` для `/uploads/*` (не нужны с Custom Loader)
- Лишние заголовки для `/uploads/*` и `/_next/image/*`

## Деплой на сервер

### 1. Подключение к серверу

```bash
ssh -i ~/.ssh/gafus_server_key root@185.239.51.125
```

### 2. Переход в директорию проекта

```bash
cd /root/gafus
```

### 3. Обновление кода

```bash
git pull origin dev
```

### 4. Остановка и удаление старых контейнеров

```bash
docker compose -f ci-cd/docker/docker-compose.prod.yml down gafus-web
```

### 5. Пересборка и запуск web контейнера

```bash
docker compose -f ci-cd/docker/docker-compose.prod.yml build gafus-web
docker compose -f ci-cd/docker/docker-compose.prod.yml up -d gafus-web
```

### 6. Проверка логов

```bash
docker logs -f gafus-web
```

### 7. Проверка работоспособности

Откройте https://gafus.ru и проверьте отображение изображений курсов.

## Что изменилось

1. **Custom Image Loader интегрирует CDN с Next.js**
   - Изображения из `/uploads/*` автоматически загружаются с CDN
   - Локальные файлы из `/public` используют встроенную оптимизацию Next.js
   - Соответствует официальным рекомендациям Next.js

2. **Упрощена архитектура**
   - Нет лишних rewrites
   - Нет промежуточных утилит
   - Чистая интеграция через официальный API

3. **Изображения с CDN не оптимизируются повторно**
   - CDN сам обрабатывает кэширование (через nginx proxy_cache)
   - Next.js не тратит ресурсы на уже оптимизированные изображения
   - Локальные статические файлы всё ещё оптимизируются

## Проверка

После деплоя проверьте:
- ✅ Изображения курсов на главной странице
- ✅ Логотипы курсов в карточках
- ✅ Аватары пользователей
- ✅ Изображения питомцев
- ✅ Нет ошибок 400/404 в консоли браузера

## Откат (если что-то пошло не так)

```bash
# Откат на предыдущий коммит
git reset --hard HEAD~1

# Пересборка контейнера
docker compose -f ci-cd/docker/docker-compose.prod.yml build gafus-web
docker compose -f ci-cd/docker/docker-compose.prod.yml up -d gafus-web
```

## Дата и автор

- **Дата:** 29 октября 2025
- **Автор:** AI Assistant + asmtv1
- **Коммит:** (будет добавлен после коммита)

