# Политика безопасности auth

Применяется к apps/web и apps/api (auth-эндпоинты).

## Auth API (web)

- `POST /api/v1/auth/register` — регистрация (email + пароль; конфликты username/email — одно нейтральное сообщение)
- `POST /api/v1/auth/check-phone-match` — заглушка (всегда `matches: true`)
- `POST /api/v1/auth/password-reset-request` — запрос сброса пароля (web и mobile → api.gafus.ru)
- `POST /api/v1/auth/reset-password` — сброс по токену
- `POST /api/v1/auth/vk` — вход через VK ID (mobile, PKCE: body `{ code, code_verifier, device_id, state }`)

Публичные auth API не защищены CSRF по решению: используются и мобильным клиентом; применяются rate limit и CORS.

## Политика паролей

- **Регистрация и сброс пароля:** минимум 8 символов, максимум 100; минимум одна заглавная, одна строчная, одна цифра. Спецсимволы разрешены (латиница, цифры, спецсимволы).
- **Логин:** только проверка на непустой пароль и max 100 символов (не блокировать старых пользователей со слабыми паролями).

## Rate limits (по IP, окно 15 мин)

- register: 5
- login: 10
- password-reset-request: 10 (auth limiter на api.gafus.ru, окно 15 мин)
- reset-password: 10
- set-password: 10 (Server Action + API, VK-only, authRateLimiter)
- change-password: 10
- vk-phone-set: 10 (API, authRateLimiter, установка телефона VK-пользователя)
- initiate-vk-id: 10 (prepareVkIdOneTap, initiateVkIdAuth)
- vk-id-callback: 5
- username-available: 30 (Server Action checkUsernameAvailableAction; API: 15/мин на IP)

**Bypass для разработки:** при `NODE_ENV=development` или IP localhost rate limit не применяется (`checkAuthRateLimit` в apps/web).

In-memory хранилище: при нескольких инстансах (pod/worker) счётчики не общие; для общего лимита нужен Redis (документировать как ограничение).

## Что не логировать

- Номер телефона (phone) в открытом виде
- Пароль
- В ошибках auth — не раскрывать «телефон занят» / «логин занят» (один общий текст)
- В логах Server Actions и core — не передавать name/phone в контексте logger

## Сброс пароля

- Целевой UX: страница `/reset-password` и код/токен. Канал доставки кода (ранее Telegram) временно недоступен — см. `@gafus/auth` заглушки и [API v1](../api/v1-routes.md).
- API принимает либо `{ code, password }` (сброс по коду), либо `{ token, password }` (по токену, для обратной совместимости). В схеме: `token` max 64 символа, `code` — 6 цифр.

## Сессия (NextAuth)

- maxAge по умолчанию 30 дней; при ужесточении политики — зафиксировать в конфиге и здесь.
