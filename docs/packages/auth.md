# Auth Package - Система аутентификации

## 🔐 Описание

Пакет `@gafus/auth` предоставляет централизованную систему аутентификации и авторизации для всех приложений в экосистеме Gafus. Включает в себя NextAuth.js конфигурацию, утилиты для работы с пользователями, middleware для защиты маршрутов и функции управления паролями.

## 🎯 Основные функции

### Аутентификация
- NextAuth.js конфигурация для всех приложений
- Поддержка различных провайдеров аутентификации
- JWT токены для сессий
- Автоматическое обновление токенов

### Управление пользователями
- Регистрация новых пользователей
- Проверка подтверждения аккаунта
- Получение информации о текущем пользователе
- Проверка прав доступа

### Безопасность
- Хеширование паролей с bcrypt
- Валидация номеров телефонов
- Middleware для защиты маршрутов
- CSRF защита

### Интеграция с Telegram
- Отправка запросов на сброс пароля через Telegram
- Связывание Telegram аккаунтов с пользователями
- Уведомления через Telegram Bot

## 🏗️ Архитектура

### Технологический стек
- **NextAuth.js** - аутентификация для Next.js
- **bcryptjs** - хеширование паролей
- **libphonenumber-js** - валидация номеров телефонов
- **Prisma** - работа с базой данных
- **TypeScript** - типизация

### Структура пакета

```
packages/auth/
├── src/
│   ├── auth.ts                        # NextAuth конфигурация
│   ├── server.ts                      # Серверные утилиты
│   ├── middleware.ts                  # Middleware для защиты
│   ├── registerUser.ts               # Регистрация пользователей
│   ├── checkUserConfirmed.ts         # Проверка подтверждения
│   ├── getCurrentUserId.ts           # Получение ID пользователя
│   ├── getIsOwner.ts                 # Проверка прав владельца
│   ├── getUserPhoneByUsername.ts     # Получение телефона по username
│   ├── resetPasswordByToken.ts       # Сброс пароля по токену
│   ├── sendTelegramPasswordResetRequest.ts # Telegram сброс пароля
│   ├── next-auth.d.ts                # Типы NextAuth
│   └── index.ts                      # Экспорт всех функций
├── dist/                             # Скомпилированный код
├── package.json                      # Зависимости и конфигурация
└── tsconfig.json                     # TypeScript конфигурация
```

## 🔧 API Reference

### Основные функции

#### `auth.ts` - NextAuth конфигурация
```typescript
import { auth } from "@gafus/auth";

// Использование в Next.js приложениях
export { auth as GET, auth as POST } from "@gafus/auth";
```

#### `registerUser.ts` - Регистрация пользователей
```typescript
import { registerUser } from "@gafus/auth";

const result = await registerUser({
  email: "user@example.com",
  password: "password123",
  phone: "+1234567890",
  name: "John Doe"
});
```

#### `checkUserConfirmed.ts` - Проверка подтверждения
```typescript
import { checkUserConfirmed } from "@gafus/auth";

const isConfirmed = await checkUserConfirmed(userId);
```

#### `getCurrentUserId.ts` - Получение ID пользователя
```typescript
import { getCurrentUserId } from "@gafus/auth";

const userId = await getCurrentUserId();
```

#### `getIsOwner.ts` - Проверка прав владельца
```typescript
import { getIsOwner } from "@gafus/auth";

const isOwner = await getIsOwner(userId, resourceId);
```

### Middleware

#### `middleware.ts` - Защита маршрутов
```typescript
import { authMiddleware } from "@gafus/auth";

export default authMiddleware({
  publicRoutes: ["/login", "/register"],
  protectedRoutes: ["/dashboard", "/profile"]
});
```

### Серверные утилиты

#### `server.ts` - Серверные функции
```typescript
import { 
  getServerSession,
  getUserByEmail,
  updateUser,
  deleteUser 
} from "@gafus/auth/server";

// Получение сессии на сервере
const session = await getServerSession();

// Работа с пользователями
const user = await getUserByEmail("user@example.com");
```

## 🚀 Использование

### Установка
```bash
# В package.json приложения
{
  "dependencies": {
    "@gafus/auth": "workspace:*"
  }
}
```

### Настройка NextAuth
```typescript
// app/api/auth/[...nextauth]/route.ts
import { auth } from "@gafus/auth";

export { auth as GET, auth as POST };
```

### Использование в компонентах
```typescript
import { useSession } from "next-auth/react";
import { getCurrentUserId } from "@gafus/auth";

function MyComponent() {
  const { data: session, status } = useSession();
  
  if (status === "loading") return <p>Loading...</p>;
  if (status === "unauthenticated") return <p>Access Denied</p>;
  
  return <p>Welcome {session?.user?.name}!</p>;
}
```

### Защита API маршрутов
```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  // Защищенная логика
}
```

## 🔐 Безопасность

### Хеширование паролей
- Использование bcrypt с солью
- Автоматическое хеширование при регистрации
- Проверка паролей при входе

### Валидация данных
- Валидация email адресов
- Проверка формата номеров телефонов
- Валидация паролей (длина, сложность)

### Защита от атак
- CSRF защита через NextAuth
- Rate limiting для попыток входа
- Защита от brute force атак
- Валидация всех входных данных

## 📱 Интеграция с Telegram

### Сброс пароля через Telegram
```typescript
import { sendTelegramPasswordResetRequest } from "@gafus/auth";

// Отправка запроса на сброс пароля
await sendTelegramPasswordResetRequest({
  phone: "+1234567890",
  resetToken: "token123"
});
```

### Связывание аккаунтов
- Автоматическое связывание при подтверждении номера
- Обновление telegramId в профиле пользователя
- Синхронизация данных между системами

## 🧪 Тестирование

### Unit тесты
```typescript
import { registerUser, checkUserConfirmed } from "@gafus/auth";

describe("Auth Package", () => {
  test("should register user successfully", async () => {
    const result = await registerUser({
      email: "test@example.com",
      password: "password123",
      phone: "+1234567890",
      name: "Test User"
    });
    
    expect(result.success).toBe(true);
  });
});
```

### Integration тесты
- Тестирование с реальной базой данных
- Проверка интеграции с NextAuth
- Тестирование middleware
- Проверка Telegram интеграции

## 📊 Мониторинг

### Логирование
- Логи аутентификации
- Логи ошибок
- Логи безопасности
- Аудит действий пользователей

### Метрики
- Количество регистраций
- Успешность аутентификации
- Частота ошибок
- Время отклика

## 🔧 Конфигурация

### Переменные окружения
```env
# NextAuth
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# База данных
DATABASE_URL="postgresql://..."

# Telegram Bot
TELEGRAM_BOT_TOKEN="your-bot-token"
```

### Настройка провайдеров
```typescript
// В auth.ts
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      // Конфигурация провайдера
    }),
    // Другие провайдеры...
  ],
  // Другие настройки...
};
```

## 🚀 Развертывание

### Сборка
```bash
pnpm build
```

### Проверка типов
```bash
pnpm typecheck
```

### Очистка
```bash
pnpm clean
```

## 🔄 Миграции и обновления

### Обновление NextAuth
- Совместимость с новыми версиями
- Миграция конфигурации
- Обновление типов

### Изменения в схеме БД
- Миграции Prisma
- Обновление типов
- Обратная совместимость

## 📚 Примеры использования

### Полная регистрация пользователя
```typescript
import { registerUser, checkUserConfirmed } from "@gafus/auth";

async function handleRegistration(formData: FormData) {
  try {
    const result = await registerUser({
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      phone: formData.get("phone") as string,
      name: formData.get("name") as string
    });
    
    if (result.success) {
      // Пользователь зарегистрирован
      const isConfirmed = await checkUserConfirmed(result.userId);
      if (!isConfirmed) {
        // Отправить подтверждение
      }
    }
  } catch (error) {
    console.error("Registration failed:", error);
  }
}
```

### Защита страницы
```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";

export default async function ProtectedPage() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect("/login");
  }
  
  return <div>Protected content</div>;
}
```
