# Вход и регистрация через VK ID

## Обзор

Аутентификация через VK ID (id.vk.ru) для web и mobile. Используется PKCE — `client_secret` не передаётся при обмене кода. **VK OAuth (oauth.vk.com) не поддерживается.**

## Автозаполнение профиля из VK

При входе через VK ID `findOrCreateVkUser` заполняет блок «О себе» (`UserProfile`):

- **fullName** — из `first_name` + `last_name` (на русском)
- **birthDate** — из `birthday` (формат DD.MM.YYYY; DD.MM без года не сохраняется)
- **avatarUrl** — из `avatar` (обновляется при каждом входе)

**Источник данных:** `fetchVkProfile` (`packages/core`) — сначала `api.vk.com/method/users.get` с `lang=0` (русский язык имён), fallback на `id.vk.ru/oauth2/user_info`. Web и Mobile используют один и тот же путь через core.

**Логика обновления:** Для существующих пользователей обновляются только пустые поля — уже заполненные не перезаписываются.

---

## Web flow

**One Tap (виджет):** клик по кнопке → `prepareVkIdOneTap()` (rate limit) → PKCE, инициализация SDK → виджет. При ошибке — fallback-кнопка запускает redirect через `initiateVkIdAuth()`.

**Redirect flow:** Server Action `initiateVkIdAuth()` — rate limit, PKCE (code_verifier, code_challenge, state), cookie `vk_id_state` (httpOnly, 10 мин). Далее:
1. Редирект на `https://id.vk.ru/authorize` с `code_challenge`, `code_challenge_method=S256`
2. Callback `GET /api/auth/callback/vk-id` — rate limit, проверка state, обмен code на token, `fetchVkProfile` (users.get lang=0), `findOrCreateVkUser`
3. One-time token (in-memory, TTL 60s) → редирект на `/?vk_id_token=TOKEN`
4. MainAuthButtons (главная страница): `useSearchParams` (в Suspense) — обнаруживает токен, очищает URL, вызывает `signIn("credentials", { username: "__vk_id__", password: token })`
5. CredentialsProvider: `consumeVkIdOneTimeUser` → сессия
6. `needsPhone: true` → форма `/profile/change-phone`; `passwordSetAt: null` → «Установить пароль»; при отсутствии пароля скрыты «Забыли пароль» (web) и «Сменить пароль» (mobile). Подробнее: [profile-vk-buttons-prompt.md](profile-vk-buttons-prompt.md)

## Mobile flow

Кнопка «Войти через VK ID» на экране **welcome** (не на login). Хук `useVkLogin` (`apps/mobile/src/shared/hooks/useVkLogin.ts`).

1. `expo-crypto` — генерация `code_verifier`, `code_challenge` (SHA-256), `state`
2. `WebBrowser.openAuthSessionAsync` — `https://id.vk.ru/authorize` с PKCE, redirect `gafus://auth/vk`
3. Callback URL содержит `code`, `device_id`, `state` — проверка state перед вызовом API
4. `POST /api/v1/auth/vk` с `{ code, code_verifier, device_id, state }` — API обменивает code на token, `fetchVkProfile` (users.get lang=0), `findOrCreateVkUser`
5. Ответ: `{ user, accessToken, refreshToken, needsPhone }`
6. При `needsPhone: true` → экран `/vk-set-phone`, далее `POST /api/v1/auth/vk-phone-set` с JWT
7. Кнопка «Установить пароль» доступна в профиле при `!hasAppPassword`, ведёт на `/profile/set-password` → `POST /api/v1/auth/set-password`

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

При деплое: `VK_WEB_REDIRECT_URI` берётся из `vars.VK_WEB_REDIRECT_URI` с fallback `https://gafus.ru/api/auth/callback/vk-id` (deploy-only, ci-cd, build-single-container).

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
| POST | `/api/v1/auth/vk-link` | Привязка VK к аккаунту (mobile, JWT) | JWT |

## Компоненты web

**MainAuthButtons** — Client Component на главной (`/`): кнопки «войти», «регистрация» и виджет VK ID. Обрабатывает `vk_id_token` из URL (useSearchParams → signIn → redirect на `/courses`). Обёрнут в Suspense из‑за useSearchParams.

**VkIdOneTap** — виджет VK ID One Tap (skin: secondary) внутри MainAuthButtons. Удалён с `/login` и `/register`.

- **Lazy init** — `prepareVkIdOneTap()` вызывается только при клике пользователя (не при mount). Снижает число вызовов при открытии нескольких вкладок.
- **Состояния:** idle → loading → success (SDK отрисован) или error.
- **Fallback при ошибке:** при rate limit или ошибке SDK показывается сообщение об ошибке и кнопка «Войти через VK ID» — клик запускает redirect-flow через `initiateVkIdAuth()`.
- **Стили:** fallback-кнопка 250px, как у inputs формы (border, background).

## Подключение VK к существующему аккаунту (Account Linking)

Пользователи, зарегистрировавшиеся **без** VK (телефон/пароль), могут подключить VK в профиле. После подключения вход возможен и через VK ID, и через логин/пароль.

**Web:** Профиль → SettingsActions → кнопка «Подключить VK» → `initiateVkIdLink()` → cookie `vk_id_state` с `mode: "link"` → callback `/api/auth/callback/vk-id` при `mode === "link"` вызывает `linkVkToUser` вместо `findOrCreateVkUser` → redirect `/profile?linked=vk` или `/profile?error=...`.

**Mobile:** Профиль → кнопка «Подключить VK» → хук `useVkLink` (PKCE, WebBrowser, state с префиксом `link_`) → `POST /api/v1/auth/vk-link` с JWT и code.

**API:** `GET /api/v1/user/profile` возвращает `hasVkLinked: boolean`. Web: `getUserWithTrainings` (profile page) включает `hasVkLinked`. Core: `linkVkToUser` в `vkAuth.ts`; `getUserProfileForApi` и `getUserWithTrainings` в profileService.

Подробнее: [vk-account-linking-prompt.md](vk-account-linking-prompt.md).

## Rate limit

| Path | Лимит |
|------|-------|
| `initiate-vk-id` | 10 / 15 мин |
| `vk-id-link` | 10 / 15 мин |
| `vk-id-callback` | 5 / 15 мин |
| `vk-phone-set` | 10 / 15 мин (authRateLimiter) |
| `set-password` | 10 / 15 мин (authRateLimiter) |
| `change-password` | 10 / 15 мин |

**Bypass для разработки:** при `NODE_ENV=development` или IP localhost (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`, `localhost`) rate limit не применяется. Пустая строка IP не считается localhost — в prod лимиты действуют.
