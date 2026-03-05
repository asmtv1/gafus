# Вход и регистрация через VK ID

## Обзор

Аутентификация через VK ID (id.vk.ru) для web и mobile. Используется PKCE — `client_secret` не передаётся при обмене кода. **VK OAuth (oauth.vk.com) не поддерживается.**

## Web flow

**One Tap (виджет):** клик по кнопке → `prepareVkIdOneTap()` (rate limit) → PKCE, инициализация SDK → виджет. При ошибке — fallback-кнопка запускает redirect через `initiateVkIdAuth()`.

**Redirect flow:** Server Action `initiateVkIdAuth()` — rate limit, PKCE (code_verifier, code_challenge, state), cookie `vk_id_state` (httpOnly, 10 мин). Далее:
1. Редирект на `https://id.vk.ru/authorize` с `code_challenge`, `code_challenge_method=S256`
2. Callback `GET /api/auth/callback/vk-id` — rate limit, проверка state (`crypto.timingSafeEqual` с Uint8Array), обмен code на token, `user_info`, `findOrCreateVkUser`
3. One-time token (in-memory, TTL 60s) → редирект на `/login?vk_id_token=TOKEN`
4. LoginForm: `useSearchParams` (в Suspense) — обнаруживает токен, очищает URL, вызывает `signIn("credentials", { username: "__vk_id__", password: token })`
5. CredentialsProvider: `consumeVkIdOneTimeUser` → сессия
6. `needsPhone: true` → форма `/profile/change-phone`; `passwordSetAt: null` → «Установить пароль» в профиле

## Mobile flow

1. `expo-crypto` — генерация `code_verifier`, `code_challenge` (SHA-256), `state`
2. `WebBrowser.openAuthSessionAsync` — `https://id.vk.ru/authorize` с PKCE, redirect `gafus://auth/vk`
3. Callback URL содержит `code`, `device_id`, `state` — проверка state перед вызовом API
4. `POST /api/v1/auth/vk` с `{ code, code_verifier, device_id, state }` — API обменивает code на token, `user_info`, `findOrCreateVkUser`
5. Ответ: `{ user, accessToken, refreshToken, needsPhone }`
6. При `needsPhone: true` → экран `/vk-set-phone`, далее `POST /api/v1/auth/vk-phone-set` с JWT

**Redirect URI:** `gafus://auth/vk` — совпадает с `VK_MOBILE_REDIRECT_URI` в API, `app.config.js` и настройках приложения VK ID.

**Web redirect:** `https://gafus.ru/api/auth/callback/vk-id` — `VK_WEB_REDIRECT_URI` в env и настройках VK ID.

## VK App setup (VK ID)

1. Создайте приложение в [id.vk.com](https://id.vk.com) (VK ID)
2. Настройте Redirect URI:
   - Web: `https://gafus.ru/api/auth/callback/vk-id`
   - Mobile: `gafus://auth/vk`
3. PKCE обязателен — `client_secret` не используется при обмене кода

## Env vars

**Web:**
```
VK_CLIENT_ID=
VK_WEB_REDIRECT_URI=https://gafus.ru/api/auth/callback/vk-id
```

**API (mobile):**
```
VK_CLIENT_ID=
VK_MOBILE_REDIRECT_URI=gafus://auth/vk
```

**Mobile (app.config.js):**
- `extra.vkClientId`, `extra.vkMobileRedirectUri` — прокидываются в `Constants.expoConfig`

## API эндпоинты

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| POST | `/api/v1/auth/vk` | Обмен code на токены (PKCE) | — |
| POST | `/api/v1/auth/vk-phone-set` | Установка телефона VK-пользователя | JWT |
| POST | `/api/v1/auth/set-password` | Установка пароля (VK-only) | JWT |
| POST | `/api/v1/auth/change-password` | Смена пароля | JWT |

## Компонент VkIdOneTap (web)

Vиджет VK ID One Tap (skin: secondary) на страницах `/login` и `/register`:

- **Lazy init** — `prepareVkIdOneTap()` вызывается только при клике пользователя (не при mount). Снижает число вызовов при открытии нескольких вкладок.
- **Состояния:** idle → loading → success (SDK отрисован) или error.
- **Fallback при ошибке:** при rate limit или ошибке SDK показывается сообщение об ошибке и кнопка «Войти через VK ID» — клик запускает redirect-flow через `initiateVkIdAuth()`.
- **Стили:** fallback-кнопка 250px, как у inputs формы (border, background).

## Rate limit

| Path | Лимит |
|------|-------|
| `initiate-vk-id` | 10 / 15 мин |
| `vk-id-callback` | 5 / 15 мин |
| `vk-phone-set` | 5 / 15 мин |
| `set-password` | 5 / 15 мин |
| `change-password` | 10 / 15 мин |

**Bypass для разработки:** при `NODE_ENV=development` или IP localhost (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`, `localhost`) rate limit не применяется. Пустая строка IP не считается localhost — в prod лимиты действуют.
