# @gafus/auth - Система аутентификации

## 📋 Обзор

Пакет `@gafus/auth` предоставляет централизованную систему аутентификации и авторизации для всех приложений в экосистеме GAFUS.

## 🎯 Основные функции

### Аутентификация

- **JWT токены** через NextAuth.js (web) и выдача access/refresh в `apps/api` (mobile)
- **Регистрация по email и паролю** — бизнес-логика в `@gafus/core` (`registerUserWithCredentials`), не в этом пакете
- **Сброс пароля / смена телефона через Telegram** — вызовы в этом пакете **заглушены** (отдельное приложение бота удалено)
- **Роли пользователей** (USER, TRAINER, ADMIN, MODERATOR, PREMIUM)

### Авторизация

- **Middleware** для проверки прав доступа
- **Проверка подтверждения** пользователя
- **Валидация токенов** сброса пароля

## 📦 Установка и использование

### Установка

```bash
pnpm add @gafus/auth
```

### Базовое использование

```typescript
import { authOptions } from "@gafus/auth";

// В Next.js API route
export default NextAuth(authOptions);
```

## 🔧 API Reference

### Основные экспорты

#### `authOptions`

Конфигурация NextAuth.js для аутентификации.

```typescript
import { authOptions } from "@gafus/auth";

// Использование в API route
export default NextAuth(authOptions);
```

#### `checkUserConfirmed(userId: string): Promise<boolean>`

Проверяет, подтвержден ли пользователь.

```typescript
import { checkUserConfirmed } from "@gafus/auth";

const isConfirmed = await checkUserConfirmed(userId);
if (!isConfirmed) {
  // Перенаправить на страницу подтверждения
}
```

#### `getUserPhoneByUsername(username: string): Promise<string | null>`

Получает номер телефона пользователя по имени.

```typescript
import { getUserPhoneByUsername } from "@gafus/auth";

const phone = await getUserPhoneByUsername("john_doe");
```

#### Регистрация

Экспорта `registerUser` больше нет. Используйте `@gafus/core/services/auth`: `registerUserWithCredentials` или `registerUserService` (с маскировкой конфликтов username/email).

#### `resetPasswordByToken(token: string, newPassword: string): Promise<boolean>`

Сбрасывает пароль пользователя по токену.

```typescript
import { resetPasswordByToken } from "@gafus/auth";

const success = await resetPasswordByToken(token, newPassword);
```

#### `sendTelegramPasswordResetRequest` (заглушка)

Ранее отправляла запрос в Telegram. Сейчас возвращает отказ с сообщением для пользователя; логируется предупреждение. Вызывается из `@gafus/core` при `POST /api/v1/auth/password-reset-request`.

## 🔐 Конфигурация

### Переменные окружения

```env
# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key

# База данных
DATABASE_URL=postgresql://user:password@localhost:5432/gafus

# VK ID (PKCE; client_secret не передаётся при обмене кода)
VK_CLIENT_ID=
VK_CLIENT_SECRET=  # Опционально — только для консоли VK ID
VK_WEB_REDIRECT_URI=
VK_MOBILE_REDIRECT_URI=

# Telegram (опционально, legacy)
# TELEGRAM_BOT_TOKEN=
```

### VK ID (web)

- **CredentialsProvider** — ветка `username === "__vk_id__"`: one-time токен из callback Route Handler, `consumeVkIdOneTimeUser` возвращает пользователя
- **vkIdOneTimeStore** — in-memory Map, TTL 60s; `storeVkIdOneTimeUser` (callback), `consumeVkIdOneTimeUser` (CredentialsProvider)
- **Route Handler** `GET /api/auth/callback/vk-id` — PKCE exchange, `findOrCreateVkUser`, one-time token, redirect на `returnPath?vk_id_token=...` (returnPath: `/`, `/login`, `/register`)
- **Server Action** `initiateVkIdAuth` — rate limit, PKCE, cookie `vk_id_state`, возвращает URL для redirect
- **Server Action** `prepareVkIdOneTap` — rate limit, PKCE, возвращает state/codeVerifier/clientId/redirectUri для инициализации SDK One Tap. Вызывается лениво при клике (VkIdOneTap). При ошибке/rate limit компонент показывает fallback-кнопку с redirect через `initiateVkIdAuth`
- **CredentialsProvider** — для VK-only (`passwordSetAt === null`) блокирует вход по паролю, сообщение «Войдите через VK ID или установите пароль в профиле»

### Роли пользователей

```typescript
enum UserRole {
  USER = "USER", // Обычный пользователь
  TRAINER = "TRAINER", // Тренер
  ADMIN = "ADMIN", // Администратор
  MODERATOR = "MODERATOR", // Модератор
  PREMIUM = "PREMIUM", // Премиум пользователь
}
```

## 🛡️ Безопасность

### Хеширование паролей

- Используется `bcryptjs` для хеширования паролей
- Соль генерируется автоматически
- Минимальная сложность паролей

### JWT токены

- Безопасные JWT токены через NextAuth.js
- Настраиваемое время жизни токенов
- Автоматическое обновление токенов

### Cookies и сессии

- **Срок жизни**: 30 дней для всех authentication cookies
- **Сохранение между сеансами**: cookies не удаляются при закрытии вкладки/браузера
- **Session token**, **CSRF token**, **Callback URL** - все имеют одинаковый срок жизни
- **Security**: `httpOnly`, `sameSite: 'lax'`, `secure` в production

### CSRF защита

- Встроенная защита от CSRF атак
- Валидация origin для запросов
- Безопасные cookies

## 📱 Telegram (legacy)

Отдельный процесс бота удалён. Сброс пароля и смена телефона через Telegram временно недоступны до внедрения нового канала.

## 🔄 Middleware

### Автоматический редирект залогиненных пользователей

В приложении `web` настроен middleware для автоматического перенаправления:

```typescript
// apps/web/src/middleware.ts
if (token) {
  const authPages = ["/", "/login", "/register"];
  if (authPages.includes(pathname)) {
    return NextResponse.redirect(new URL("/courses", url));
  }
}
```

**Поведение:**

- Залогиненные пользователи автоматически перенаправляются с `/`, `/login`, `/register` на `/courses`
- Незалогиненные пользователи на защищенных страницах перенаправляются на `/`

### Проверка аутентификации

```typescript
import { withAuth } from "@gafus/auth/server";

export default withAuth(async function handler(req, res) {
  // req.user содержит информацию о пользователе
  res.json({ user: req.user });
});
```

### Проверка ролей

```typescript
import { withRole } from "@gafus/auth/server";

export default withRole(["ADMIN", "TRAINER"])(async function handler(req, res) {
  // Только для администраторов и тренеров
  res.json({ message: "Access granted" });
});
```

## 🧪 Тестирование

### Unit тесты

```typescript
import { checkUserConfirmed } from "@gafus/auth";

describe("Auth Package", () => {
  it("should check confirmation", async () => {
    const ok = await checkUserConfirmed("+79123456789");
    expect(typeof ok).toBe("boolean");
  });
});
```

## 📊 Мониторинг

### Логирование

- Все операции аутентификации логируются
- Отслеживание неудачных попыток входа
- Мониторинг подозрительной активности

### Метрики

- Количество активных пользователей
- Статистика регистраций
- Время отклика аутентификации

## 🔧 Разработка

### Структура пакета

```
packages/auth/
├── src/
│   ├── auth.ts              # Конфигурация NextAuth (providers, adapter, callbacks)
│   ├── checkUserConfirmed.ts # Проверка подтверждения
│   ├── getCurrentUserId.ts  # Получение ID пользователя
│   ├── getIsOwner.ts        # Проверка владения
│   ├── getUserPhoneByUsername.ts # Получение телефона
│   ├── middleware.ts        # Middleware функции
│   ├── next-auth.d.ts       # Расширение Session: needsPhone, passwordSetAt
│   ├── vkIdOneTimeStore.ts  # One-time токены для VK ID web callback
│   ├── resetPasswordByToken.ts # Сброс пароля
│   ├── sendTelegramPasswordResetRequest.ts # заглушка (legacy Telegram)
│   ├── server.ts            # Серверные функции
│   └── index.ts             # Главный экспорт
├── package.json
└── tsconfig.json
```

### Зависимости

- `@gafus/logger` - Логирование
- `@gafus/prisma` - База данных
- `bcryptjs` - Хеширование паролей
- `libphonenumber-js` - Валидация телефонов
- `next-auth` - Аутентификация
- `next` - Next.js интеграция

## 🚀 Развертывание

### Переменные окружения

Убедитесь, что все необходимые переменные окружения настроены:

```bash
# Обязательные
DATABASE_URL=postgresql://...
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-secret

# Опциональные (legacy)
# TELEGRAM_BOT_TOKEN=
```

### Безопасность в продакшене

- Используйте HTTPS для всех соединений
- Настройте безопасные cookies
- Ограничьте доступ к API endpoints
- Регулярно обновляйте зависимости

---

_Пакет @gafus/auth обеспечивает безопасную и надежную систему аутентификации для всей экосистемы GAFUS._
