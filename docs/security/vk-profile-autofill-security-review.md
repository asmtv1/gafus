# Security Review: Автозаполнение профиля из VK ID

## Область

- `packages/core` — `vkAuth.ts`: parseVkBirthday, fullName, birthDate, avatarUrl
- `apps/web` — callback `/api/auth/callback/vk-id`
- `apps/api` — POST `/api/v1/auth/vk`

## Источник данных

Данные приходят от VK ID API (`id.vk.ru/oauth2/user_info`) после валидного OAuth + PKCE. Токен проверяется при обмене кода. Источник доверенный, но применяется defense in depth — входные данные валидируются перед сохранением.

## Угрозы и меры

### 1. parseVkBirthday

| Угроза | Мера |
|--------|------|
| ReDoS / переполнение | Ограничение длины входа (`MAX_BIRTHDAY_LENGTH = 10`) |
| Некорректные даты (31.02, 29.02 не в високосный год) | Проверка `getUTCDate` / `getUTCMonth` после `Date.UTC` |
| Out-of-range (год, месяц, день) | Год 1900–текущий; месяц 1–12; день 1–31 |
| `NaN` / нечисловой ввод | `Number.isNaN()` для всех частей |

### 2. fullName (first_name + last_name)

| Угроза | Мера |
|--------|------|
| Слишком длинная строка (DoS, переполнение БД) | Обрезка до 120 символов (как в updateUserProfile) |
| Нестроковые типы от VK | `sanitizeFullName` — проверка `typeof s === "string"` |
| XSS | React экранирует текст; fullName не используется в `dangerouslySetInnerHTML` |

### 3. avatarUrl

| Угроза | Мера |
|--------|------|
| `javascript:` / `data:` / SVG+script | Только `https://` |
| Слишком длинный URL | Лимит 2048 символов |
| Open redirect | `<img src>` не переходит по клику; CSP ограничивает загрузку |

### 4. OAuth flow

- PKCE, state (timing-safe compare), rate limit, code exchange на сервере — см. `docs/security/auth-policy.md`, `docs/features/vk-auth.md`.

## Реализованные функции

- `parseVkBirthday(birthday)` — парсинг DD.MM.YYYY с валидацией
- `sanitizeAvatarUrl(url)` — только https, макс. 2048 символов
- `sanitizeFullName(firstName, lastName)` — конкатенация + обрезка до 120 символов

## Рекомендации

- Периодически сверять scope `vkid.personal_info` с документацией VK ID
- При появлении новых полей из VK — добавлять валидацию перед сохранением
