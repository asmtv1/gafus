# Промпт: Полная миграция на VK ID (id.vk.ru)

> **Миграция завершена (03.2026).** План: `.cursor/agentplan/vk-id-migration.md`. Документация: [vk-auth.md](../features/vk-auth.md).

## Цель

Полностью перейти с VK OAuth (oauth.vk.com) на VK ID (id.vk.ru) для web и mobile. Старая архитектура не сохраняется — в проде VK OAuth не использовался, пользователи по нему не регистрировались. Удалять всё лишнее без сохранения обратной совместимости.

## Референс документации

- [Справочник методов API VK ID](https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/api-description)
- Важно: VK ID требует **PKCE** (code_challenge, code_verifier, code_challenge_method=S256)

## Ключевые отличия VK ID от VK OAuth

| | VK OAuth (удалить) | VK ID (целевой) |
|---|---|---|
| Авторизация | `https://oauth.vk.com/authorize` | `https://id.vk.ru/authorize` |
| Обмен кода | `https://oauth.vk.com/access_token` | `POST https://id.vk.ru/oauth2/auth` |
| Профиль | `api.vk.com/method/users.get` | `POST https://id.vk.ru/oauth2/user_info` |
| PKCE | Не поддерживается | Обязателен |
| Redirect callback | code | code, device_id, state |

---

## Часть 1: Удаление кода VK OAuth

### Удалить / заменить:

1. **packages/auth/**
   - Убрать `VkProvider` из `auth.ts`
   - Удалить `prisma-adapter-vk.ts` (будет заменён другим подходом)
   - Убрать вызов `finalizeVkUser` в signIn callback

2. **packages/core/src/services/auth/**
   - `vkAuth.ts` — переписать под VK ID (новый формат профиля из `id.vk.ru/oauth2/user_info`)
   - Удалить зависимость от `api.vk.com/method/users.get`, `response[0].screen_name` и т.п.

3. **apps/api/src/routes/v1/auth.ts**
   - POST `/vk` — заменить логику: вместо `oauth.vk.com/access_token` использовать `id.vk.ru/oauth2/auth` с PKCE

4. **apps/mobile/** и **apps/web/**
   - Заменить все URL `oauth.vk.com` на `id.vk.ru`

---

## Часть 2: Web (apps/web)

### Требования VK ID для Web

- Авторизация: `GET https://id.vk.ru/authorize?response_type=code&client_id=...&redirect_uri=...&state=...&code_challenge=...&code_challenge_method=S256`
- `code_challenge` = base64url(sha256(code_verifier))
- `code_verifier` — случайная строка 43–128 символов (a-z, A-Z, 0-9, _, -)
- `state` — минимум 32 символа, для CSRF
- Callback: `redirect_uri?code=...&device_id=...&state=...`
- Обмен: `POST https://id.vk.ru/oauth2/auth` с `grant_type=authorization_code`, `code`, `code_verifier`, `redirect_uri`, `client_id`, `device_id`, `state`
- Content-Type: `application/x-www-form-urlencoded`

### Предлагаемая архитектура Web

**Вариант A (рекомендуемый): Server-side redirect flow**

1. Кнопка «Войти через VK» на `/login` вызывает Server Action `initiateVkIdAuth()`:
   - Генерирует `state` (32+ символов), `code_verifier` (43–128 символов)
   - Вычисляет `code_challenge` = base64url(sha256(code_verifier))
   - Сохраняет `state`, `code_verifier` в httpOnly cookie (TTL 10 мин)
   - Возвращает redirect URL: `https://id.vk.ru/authorize?response_type=code&client_id=...&redirect_uri=https://gafus.ru/api/auth/callback/vk-id&state=...&code_challenge=...&code_challenge_method=S256`

2. Роут `GET /api/auth/callback/vk-id` (Route Handler):
   - Читает `code`, `device_id`, `state` из query
   - Валидирует `state` с cookie
   - Читает `code_verifier` из cookie, удаляет cookie
   - `POST https://id.vk.ru/oauth2/auth` — обмен code на токены
   - `POST https://id.vk.ru/oauth2/user_info` — получение профиля (access_token, client_id)
   - Вызов `findOrCreateVkUser` с новым форматом профиля VK ID
   - Создание сессии NextAuth (через CredentialsProvider с одноразовым токеном или напрямую через JWT/session API)
   - `redirect(/courses)` или `redirect(callbackUrl)`

3. Интеграция с NextAuth:
   - Добавить CredentialsProvider, принимающий `username: "__vk_id__"` и `password: oneTimeToken`
   - В `authorize`: проверка oneTimeToken (Redis/DB, TTL 1 мин), возврат `{ id, username, role }`
   - Или: использовать `authOptions.events` / callback для установки сессии после успешного VK ID

**Вариант B: Floating One Tap (опционально)**

- Добавить `@vkid/sdk` на страницу логина
- `responseMode: Callback` → получаем code в callback
- Не вызывать `VKID.Auth.exchangeCode` на клиенте — отправить `code`, `device_id`, `state` на наш API
- Сервер обменивает (нужен `code_verifier` — он генерируется SDK, нужно проверить, доступен ли для передачи на backend)
- Если SDK не отдаёт code_verifier — использовать только redirect flow (Вариант A)

### Redirect URL для Web

- `https://gafus.ru/api/auth/callback/vk-id`
- Добавить в настройки приложения VK ID (доверенный Redirect URL)

---

## Часть 3: Mobile (apps/mobile)

### Изменения в `app/(auth)/login.tsx`

1. **PKCE при инициализации авторизации:**
   - Генерировать `code_verifier` (crypto.randomBytes(32).toString('base64url') или аналог, 43+ символов)
   - Вычислять `code_challenge` = base64url(sha256(code_verifier))
   - Генерировать `state` (32+ символов)

2. **URL авторизации:**
   ```
   https://id.vk.ru/authorize?response_type=code
     &client_id={clientId}
     &redirect_uri={redirectUri}  // gafus://auth/vk
     &state={state}
     &code_challenge={code_challenge}
     &code_challenge_method=S256
     &display=mobile
   ```

3. **Callback (Linking.parse):**
   - Парсить `code`, `device_id`, `state` из result.url
   - Сохранить `code_verifier` (он был сгенерирован до открытия браузера)

4. **Вызов API:**
   - `POST /api/v1/auth/vk` с телом: `{ code, code_verifier, device_id, state }`
   - (текущий API принимает только `{ code }` — нужно расширить)

---

## Часть 4: API (apps/api)

### POST /api/v1/auth/vk — новая логика

**Вход (body):**
```ts
{ code: string; code_verifier: string; device_id: string; state: string }
```

**Шаги:**
1. Валидация `state` (опционально, если передаётся с клиента)
2. `POST https://id.vk.ru/oauth2/auth`
   - Content-Type: application/x-www-form-urlencoded
   - Body: grant_type=authorization_code, code, code_verifier, redirect_uri, client_id, device_id, state
   - redirect_uri = VK_MOBILE_REDIRECT_URI (gafus://auth/vk)
3. Ответ: `{ access_token, refresh_token, id_token, user_id, ... }`
4. `POST https://id.vk.ru/oauth2/user_info`
   - Body: client_id, access_token (form-urlencoded)
   - Ответ: `{ user: { user_id, first_name, last_name, avatar, ... } }`
5. Маппинг профиля VK ID → `VkProfile` для `findOrCreateVkUser`
6. Остальная логика без изменений: findOrCreateVkUser, JWT, refresh session, ответ `{ user, accessToken, refreshToken, needsPhone }`

---

## Часть 5: Core (packages/core)

### vkAuth.ts

**Новый интерфейс профиля VK ID** (из `id.vk.ru/oauth2/user_info`):
```ts
interface VkIdUserInfo {
  user_id: string;
  first_name?: string;
  last_name?: string;
  avatar?: string;
  phone?: string;   // если scope
  email?: string;   // если scope
}
```

**Адаптация:**
- `generateUniqueVkUsername` — использовать first_name, last_name (screen_name в VK ID может отсутствовать, проверить документацию)
- `findOrCreateVkUser` — входной тип `VkProfile` с полями `id`, `first_name`, `last_name`, `avatar` (вместо photo_200)
- `finalizeVkUser` — если сохраняем для web flow, адаптировать под новый профиль; иначе удалить, если web не использует temp-пользователя

---

## Часть 6: Настройки приложения VK

В [vk.com/apps?act=manage](https://vk.com/apps?act=manage) / консоли VK ID:

1. **Базовый домен:** gafus.ru
2. **Доверенный Redirect URL:**
   - `https://gafus.ru/api/auth/callback/vk-id`
   - `gafus://auth/vk` (для mobile)
3. **Android:** package `ru.gafus.app`, SHA-1 (уже получен)
4. **iOS:** Universal Link `https://gafus.ru/auth/vk` (если используется)

Убедиться, что приложение создано как **VK ID** (id.vk.ru), не только VK OAuth.

---

## Часть 7: Env vars

Оставить:
```
VK_CLIENT_ID=
VK_CLIENT_SECRET=
VK_MOBILE_REDIRECT_URI=gafus://auth/vk
```

Добавить при необходимости:
```
# Для web callback (если отличается от NEXTAUTH_URL)
VK_WEB_REDIRECT_URI=https://gafus.ru/api/auth/callback/vk-id
```

---

## Часть 8: Очистка

- Удалить `packages/auth/src/prisma-adapter-vk.ts`
- Удалить из auth.ts: import VkProvider, createVkAdapter, VkProvider из providers, вызов finalizeVkUser
- Обновить `packages/ui-components/src/LoginForm.tsx` — кнопка VK должна вызывать новый flow (не signIn("vk"))
- trainer-panel, admin-panel — VK auth не используют (только vk.com/vkvideo.ru для валидации видео-URL), изменений не требуется
- Удалить все ссылки на `oauth.vk.com`, `api.vk.com/method/users.get` в контексте VK auth

---

## Часть 9: Документация

Обновить:
- `docs/features/vk-auth.md` — описать VK ID flow, PKCE, id.vk.ru
- `docs/deployment/configuration.md` — env vars
- `docs/api/v1-routes.md` — POST /auth/vk с новыми полями
- `docs/packages/auth.md` — убрать VkProvider, описать VK ID flow

---

## Порядок выполнения

1. Core: переписать `vkAuth.ts` под VK ID user_info
2. API: обновить POST `/vk` под id.vk.ru и PKCE
3. Mobile: PKCE + id.vk.ru/authorize + новые поля в запросе
4. Web: Server Action + Route Handler + CredentialsProvider для one-time token
5. Auth package: удалить VkProvider, prisma-adapter-vk
6. Очистка, тесты, документация

---

## Важно по безопасности

- `code_verifier` и `state` не должны попадать в логи
- Строго валидировать `redirect_uri` на бэкенде (должен совпадать с зарегистрированным)
- Cookie с code_verifier — httpOnly, secure, sameSite=Lax, короткий TTL
- Rate limit на `/api/auth/callback/vk-id` и POST /vk
