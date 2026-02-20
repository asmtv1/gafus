# API Service

## Обзор

Standalone REST API сервис на базе Hono для обслуживания web и mobile клиентов с JWT авторизацией.

## Технологии

- **Framework:** Hono ≥4.11.4
- **Runtime:** Node.js 20+
- **Authentication:** JWT (jose)
- **Rate Limiting:** hono-rate-limiter + Redis
- **Validation:** Zod

## Структура

```
apps/api/
├── src/
│   ├── index.ts           # Entry point + graceful shutdown
│   ├── app.ts             # Hono app setup
│   ├── middleware/
│   │   ├── auth.ts        # JWT verification
│   │   ├── cors.ts        # CORS config
│   │   ├── rate-limit.ts  # Rate limiting
│   │   └── error-handler.ts
│   └── routes/
│       └── v1/
│           ├── health.ts  # /health, /ready
│           ├── auth.ts    # login, register, refresh, logout
│           └── user.ts    # profile, preferences
├── package.json
└── tsconfig.json
```

## Endpoints

### Health

- `GET /health` - Базовая проверка работоспособности
- `GET /ready` - Проверка подключений к БД и Redis

### Auth (без авторизации, rate limited)

- `POST /api/v1/auth/login` - Авторизация
- `POST /api/v1/auth/register` - Регистрация (body: name, phone, password, tempSessionId, consentPayload; см. [Consent at Registration](../features/consent-registration.md))
- `POST /api/v1/auth/refresh` - Обновление токенов
- `POST /api/v1/auth/logout` - Выход

### User (требует авторизации)

- `GET /api/v1/user/profile` - Получить профиль
- `PUT /api/v1/user/profile` - Обновить профиль
- `GET /api/v1/user/preferences` - Получить настройки
- `PUT /api/v1/user/preferences` - Обновить настройки

## Авторизация

### JWT Tokens

- **Access Token:** 15 минут, подписан JWT_SECRET
- **Refresh Token:** 30 дней, подписан JWT_REFRESH_SECRET

### Заголовки

```
Authorization: Bearer <access_token>
X-Device-Id: <device_identifier>  // опционально
```

### Token Refresh Flow

1. Клиент получает 401 при запросе
2. Клиент вызывает `/api/v1/auth/refresh` с refresh token
3. Сервер выдаёт новую пару токенов
4. Клиент повторяет оригинальный запрос

### Token Reuse Detection

При повторном использовании refresh token (возможная кража):

- Все токены пользователя отзываются
- Возвращается код `TOKEN_REUSE_DETECTED`
- Пользователь должен авторизоваться заново

## Rate Limiting

| Endpoint    | Лимит        | Окно     |
| ----------- | ------------ | -------- |
| Auth routes | 10 запросов  | 15 минут |
| API routes  | 100 запросов | 1 минута |

## Environment Variables

```bash
# Обязательные
JWT_SECRET=<min 32 chars>           # Секрет для access tokens
JWT_REFRESH_SECRET=<min 32 chars>   # Секрет для refresh tokens
DATABASE_URL=postgresql://...       # PostgreSQL connection
REDIS_URL=redis://...               # Redis connection

# Опциональные
API_PORT=3001                       # Порт сервера (default: 3001)
NODE_ENV=production                 # Окружение
WEB_APP_URL=https://gafus.ru        # Базовый URL web для return_url платежей
CONSENT_VERSION=v1.0 2026-02-13     # Версия документов согласий (для register)

# Платежи ЮKassa (обязательны для /api/v1/payments/create)
YOOKASSA_SHOP_ID=<shop_id>
YOOKASSA_SECRET_KEY=<secret_key>
```

## Запуск

### Development

**Вариант 1: Прямой запуск**

```bash
cd apps/api
pnpm dev
```

API доступен на http://localhost:3001

**Вариант 2: Через nginx (рекомендуется)**

```bash
# 1. Запустить API
cd apps/api
pnpm dev

# 2. API доступен через nginx
# http://api.gafus.localhost
```

Преимущества через nginx:

- Тестирование CORS с правильными origins
- Проверка rate limiting
- Эмуляция production окружения

### Production

```bash
cd apps/api
pnpm build
pnpm start
```

### Docker

```bash
docker build -f ci-cd/docker/Dockerfile-api -t gafus-api .
docker run -p 3001:3001 \
  -e JWT_SECRET=... \
  -e JWT_REFRESH_SECRET=... \
  -e DATABASE_URL=... \
  -e REDIS_URL=... \
  gafus-api
```

## Безопасность

### JWT Best Practices

- ✅ Explicit `alg: "HS256"` в заголовке (защита от algorithm confusion)
- ✅ Проверка `audience` и `issuer`
- ✅ Минимальная длина secret: 32 символа
- ✅ Clock tolerance: 30 секунд
- ✅ Хранение хеша refresh token в БД (не сам токен)

### CORS

Разрешённые origins:

- Production: gafus.ru, trainer.gafus.ru, admin.gafus.ru
- Development: localhost:3000, localhost:3002, localhost:3003
- Mobile: exp://, \*.exp.direct

### Rate Limiting

- Redis backend для distributed rate limiting
- Строгий лимит для auth endpoints
- IP extraction с поддержкой Cloudflare и nginx

## Graceful Shutdown

При получении SIGTERM/SIGINT:

1. Прекращает приём новых подключений
2. Ждёт завершения активных запросов (до 10 сек)
3. Закрывает подключения к PostgreSQL и Redis
4. Завершает процесс
