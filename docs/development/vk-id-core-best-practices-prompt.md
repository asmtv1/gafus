# VK ID: Вынос логики в @gafus/core (best practices)

## Цель

Привести VK ID auth к best practices монорепо: **вся доменная логика в packages/core**, apps — тонкие слои (validate → call core → shape response). Устранить дублирование обмена code и создания пользователя.

## Текущее состояние

| Что | Где | В core? |
|-----|-----|---------|
| Обмен code → access_token | Web callback, API POST /vk, API POST /vk-link | ❌ Дублируется в 3 местах |
| fetchVkProfile | packages/core | ✅ |
| findOrCreateVkUser / linkVkToUser | packages/core | ✅ |

**Проблема:** OAuth token exchange повторяется в web callback и в двух API routes. Нарушает DRY и architecture.mdc («вся доменная логика в packages/core»).

## Целевое состояние

| Что | Где |
|-----|-----|
| exchangeVkCodeAndGetUser | packages/core |
| Web callback | Вызов exchangeVkCodeAndGetUser → one-time token → redirect |
| API POST /vk | Вызов exchangeVkCodeAndGetUser → JWT |
| API POST /vk-link | Вызов exchangeVkCodeForProfile → linkVkToUser (или отдельная функция) |

## Плюсы подхода

- Нет лишнего HTTP между web и API
- Web не зависит от доступности API
- DRY за счёт shared-кода в пакете
- Типичный подход в монорепо: общая логика в packages/core
- Apps — тонкие entry points: validate → call core → shape response

## Задачи

### 1. packages/core — exchangeVkCodeAndGetUser

- [ ] Добавить в `packages/core/src/services/auth/vkAuth.ts` функцию:
  ```ts
  export async function exchangeVkCodeAndGetUser(params: {
    code: string;
    codeVerifier: string;
    deviceId: string;
    state: string;
    redirectUri: string;
    clientId: string;
  }): Promise<{ user: { id: string; username: string; role: string }; needsPhone: boolean }>
  ```
- [ ] Внутри: fetch id.vk.ru/oauth2/auth (обмен code на token) → fetchVkProfile → findOrCreateVkUser.
- [ ] При ошибке exchange или fetchVkProfile — бросать Error с понятным сообщением.
- [ ] Экспортировать из `packages/core/src/services/auth/index.ts`.

### 2. packages/core — exchangeVkCodeForProfile (для vk-link)

- [ ] Добавить функцию `exchangeVkCodeForProfile` — обмен code → token → fetchVkProfile → VkProfile.
- [ ] Используется в API POST /vk-link и в web callback (link mode). linkVkToUser вызывается отдельно.

### 3. apps/web — callback использует core

- [ ] В `GET /api/auth/callback/vk-id` убрать локальный fetch id.vk.ru и вызов fetchVkProfile/findOrCreateVkUser.
- [ ] Для login mode: вызвать `exchangeVkCodeAndGetUser` с параметрами из cookie и searchParams.
- [ ] При успехе: one-time token, redirect.
- [ ] Для link mode: вызвать `exchangeVkCodeForProfile` → `linkVkToUser(session.user.id, vkProfile)` (оставить локально, т.к. нужна session).

### 4. apps/api — POST /vk и POST /vk-link используют core

- [ ] POST /vk: заменить inline exchange + fetchVkProfile + findOrCreateVkUser на вызов `exchangeVkCodeAndGetUser`.
- [ ] POST /vk-link: заменить inline exchange + fetchVkProfile на вызов `exchangeVkCodeForProfile` → linkVkToUser.

### 5. redirectUri и clientId

- [ ] exchangeVkCodeAndGetUser принимает redirectUri и clientId как параметры (apps передают из env).
- [ ] Web: VK_WEB_REDIRECT_URI (или ngrok), API: VK_MOBILE_REDIRECT_URI для /vk и /vk-link.

### 6. Документация

- [ ] `docs/features/vk-auth.md` — обновить: exchange в core, web и API вызывают core.
- [ ] `docs/packages/core.md` — добавить exchangeVkCodeAndGetUser, exchangeVkCodeForProfile.

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `packages/core/src/services/auth/vkAuth.ts` | exchangeVkCodeAndGetUser, exchangeVkCodeForProfile |
| `packages/core/src/services/auth/index.ts` | Экспорт новых функций |
| `apps/web/src/app/api/auth/callback/vk-id/route.ts` | Вызов exchangeVkCodeAndGetUser, exchangeVkCodeForProfile |
| `apps/api/src/routes/v1/auth.ts` | POST /vk и POST /vk-link вызывают core |
| `docs/features/vk-auth.md` | Обновить описание |
| `docs/packages/core.md` | Документировать новые функции |

## Схема flow после изменений

```
Web (login):
  prepare → cookie
  initiate → redirect id.vk.ru
  VK → callback → exchangeVkCodeAndGetUser(...) → one-time token → redirect

Web (link):
  initiateVkIdLink → redirect id.vk.ru
  VK → callback → exchangeVkCodeForProfile(...) → linkVkToUser(session.user.id, profile) → redirect

Mobile (login):
  POST /api/v1/auth/vk → exchangeVkCodeAndGetUser(...) → JWT

Mobile (link):
  POST /api/v1/auth/vk-link → exchangeVkCodeForProfile(...) → linkVkToUser(user.id, profile)
```
