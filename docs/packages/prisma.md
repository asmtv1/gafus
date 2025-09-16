# Prisma Package - База данных и ORM

## 🗄️ Описание

Пакет `@gafus/prisma` предоставляет централизованную работу с базой данных PostgreSQL через Prisma ORM. Включает в себя схему базы данных, миграции, seed данные и типизированный клиент для всех приложений в экосистеме Gafus.

## 🎯 Основные функции

### Управление схемой БД
- Централизованная схема базы данных
- Типизированные модели для всех сущностей
- Enums для константных значений
- Индексы и ограничения

### Миграции
- Версионирование изменений схемы
- Автоматическая генерация миграций
- Откат изменений
- Синхронизация между окружениями

### Seed данные
- Начальные данные для разработки
- Тестовые данные
- Демо контент
- Справочная информация

### Типизация
- Автоматическая генерация TypeScript типов
- Типобезопасные запросы
- Валидация на уровне типов
- IntelliSense поддержка

## 🏗️ Архитектура

### Технологический стек
- **PostgreSQL** - основная база данных
- **Prisma ORM** - объектно-реляционное отображение
- **Prisma Client** - типизированный клиент
- **Prisma Migrate** - система миграций
- **TypeScript** - типизация

### Структура пакета

```
packages/prisma/
├── schema.prisma              # Схема базы данных
├── migrations/                # Миграции
│   ├── 20240913102738_init/  # Начальная миграция
│   └── migration_lock.toml    # Блокировка миграций
├── seed.ts                    # Seed данные
├── src/
│   ├── client.ts             # Prisma клиент
│   └── index.ts              # Экспорт
├── dist/                     # Скомпилированный код
└── package.json              # Зависимости
```

## 📊 Схема базы данных

### Основные модели

#### User - Пользователи
```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  password      String
  name          String?
  phone         String?   @unique
  telegramId    String?   @unique
  isConfirmed   Boolean   @default(false)
  role          UserRole  @default(USER)
  petType       PetType?
  petName       String?
  petAge        Int?
  petWeight     Float?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  // Связи
  trainings     Training[]
  achievements  UserAchievement[]
  favorites     Favorite[]
  pushLogs      PushLog[]
}
```

#### Course - Курсы тренировок
```prisma
model Course {
  id             String             @id @default(cuid())
  name           String
  type           String             @unique
  description    String
  equipment      String
  trainingLevel  TrainingLevel
  shortDesc      String
  duration       String
  isPublished    Boolean            @default(false)
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt
  // Связи
  days           CourseDay[]
  trainings      Training[]
  favorites      Favorite[]
}
```

#### Training - Тренировки
```prisma
model Training {
  id          String         @id @default(cuid())
  userId      String
  courseId    String
  status      TrainingStatus @default(NOT_STARTED)
  startedAt   DateTime?
  completedAt DateTime?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  // Связи
  user        User           @relation(fields: [userId], references: [id])
  course      Course         @relation(fields: [courseId], references: [id])
  steps       TrainingStep[]
}
```

#### CourseDay - Дни курса
```prisma
model CourseDay {
  id          String    @id @default(cuid())
  courseId    String
  dayNumber   Int
  name        String
  description String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  // Связи
  course      Course    @relation(fields: [courseId], references: [id])
  steps       Step[]
}
```

#### Step - Шаги тренировки
```prisma
model Step {
  id          String    @id @default(cuid())
  courseDayId String
  stepNumber  Int
  name        String
  description String
  videoUrl    String?
  imageUrl    String?
  duration    Int?      // в минутах
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  // Связи
  courseDay   CourseDay @relation(fields: [courseDayId], references: [id])
  trainingSteps TrainingStep[]
}
```

### Enums

#### UserRole - Роли пользователей
```prisma
enum UserRole {
  USER      // Обычный пользователь
  TRAINER   // Тренер
  ADMIN     // Администратор
  MODERATOR // Модератор
  PREMIUM   // Премиум пользователь
}
```

#### TrainingStatus - Статусы тренировок
```prisma
enum TrainingStatus {
  NOT_STARTED  // Не начата
  IN_PROGRESS  // В процессе
  COMPLETED    // Завершена
}
```

#### TrainingLevel - Уровни сложности
```prisma
enum TrainingLevel {
  BEGINNER      // Начальный
  INTERMEDIATE  // Средний
  ADVANCED      // Продвинутый
  EXPERT        // Экспертный
}
```

#### PetType - Типы питомцев
```prisma
enum PetType {
  DOG  // Собака
  CAT  // Кот
}
```

## 🔧 API Reference

### Основные функции

#### Инициализация клиента
```typescript
import { prisma } from "@gafus/prisma";

// Использование в приложениях
const users = await prisma.user.findMany();
```

#### Работа с пользователями
```typescript
// Создание пользователя
const user = await prisma.user.create({
  data: {
    email: "user@example.com",
    password: "hashedPassword",
    name: "John Doe",
    role: "USER"
  }
});

// Поиск пользователя
const user = await prisma.user.findUnique({
  where: { email: "user@example.com" }
});

// Обновление пользователя
const updatedUser = await prisma.user.update({
  where: { id: userId },
  data: { name: "New Name" }
});
```

#### Работа с курсами
```typescript
// Получение курсов с днями и шагами
const courses = await prisma.course.findMany({
  include: {
    days: {
      include: {
        steps: true
      }
    }
  }
});

// Создание курса
const course = await prisma.course.create({
  data: {
    name: "Базовый курс",
    type: "basic",
    description: "Описание курса",
    trainingLevel: "BEGINNER"
  }
});
```

#### Работа с тренировками
```typescript
// Создание тренировки
const training = await prisma.training.create({
  data: {
    userId: "user_id",
    courseId: "course_id",
    status: "NOT_STARTED"
  }
});

// Обновление статуса тренировки
const updatedTraining = await prisma.training.update({
  where: { id: trainingId },
  data: { 
    status: "IN_PROGRESS",
    startedAt: new Date()
  }
});
```

## 🚀 Использование

### Установка
```bash
# В package.json приложения
{
  "dependencies": {
    "@gafus/prisma": "workspace:*"
  }
}
```

### Импорт клиента
```typescript
import { prisma } from "@gafus/prisma";

// Использование в API routes
export async function GET() {
  const users = await prisma.user.findMany();
  return Response.json(users);
}
```

### Использование в Server Components
```typescript
import { prisma } from "@gafus/prisma";

export default async function UsersPage() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  });
  
  return (
    <div>
      {users.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}
```

## 🔄 Миграции

### Команды миграций
```bash
# Создание миграции
pnpm db:migrate

# Применение миграций в продакшн
pnpm db:migrate:deploy

# Сброс базы данных
pnpm db:push

# Просмотр миграций
pnpm db:studio
```

### Создание миграции
```bash
# После изменения schema.prisma
pnpm db:migrate

# Prisma создаст файл миграции
# migrations/20240101120000_add_new_field/migration.sql
```

### Откат миграций
```bash
# Откат последней миграции
npx prisma migrate reset

# Откат к конкретной миграции
npx prisma migrate resolve --rolled-back "migration_name"
```

## 🌱 Seed данные

### Запуск seed
```bash
pnpm db:seed
```

### Структура seed.ts
```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Создание тестовых пользователей
  const user = await prisma.user.create({
    data: {
      email: "test@example.com",
      password: "hashedPassword",
      name: "Test User",
      role: "USER"
    }
  });
  
  // Создание тестовых курсов
  const course = await prisma.course.create({
    data: {
      name: "Тестовый курс",
      type: "test",
      description: "Описание тестового курса",
      trainingLevel: "BEGINNER"
    }
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

## 🔐 Безопасность

### Валидация данных
- Автоматическая валидация на уровне схемы
- Ограничения уникальности
- Проверка типов данных
- Валидация связей

### Защита от SQL инъекций
- Параметризованные запросы
- Автоматическое экранирование
- Типобезопасные запросы

### Управление подключениями
- Connection pooling
- Автоматическое переподключение
- Ограничение количества соединений

## 📊 Производительность

### Индексы
```prisma
model User {
  id    String @id @default(cuid())
  email String @unique  // Автоматический индекс
  phone String @unique  // Автоматический индекс
  
  @@index([role])       // Составной индекс
  @@index([createdAt])  // Индекс по дате
}
```

### Оптимизация запросов
```typescript
// Плохо - N+1 проблема
const users = await prisma.user.findMany();
for (const user of users) {
  const trainings = await prisma.training.findMany({
    where: { userId: user.id }
  });
}

// Хорошо - один запрос с include
const users = await prisma.user.findMany({
  include: {
    trainings: true
  }
});
```

### Пагинация
```typescript
const users = await prisma.user.findMany({
  skip: 0,
  take: 10,
  orderBy: { createdAt: 'desc' }
});
```

## 🧪 Тестирование

### Unit тесты
```typescript
import { prisma } from "@gafus/prisma";

describe("Prisma Package", () => {
  beforeEach(async () => {
    // Очистка базы данных
    await prisma.user.deleteMany();
  });
  
  test("should create user", async () => {
    const user = await prisma.user.create({
      data: {
        email: "test@example.com",
        password: "password",
        name: "Test User"
      }
    });
    
    expect(user.email).toBe("test@example.com");
  });
});
```

### Integration тесты
- Тестирование с реальной базой данных
- Проверка миграций
- Тестирование seed данных
- Проверка производительности

## 📈 Мониторинг

### Логирование запросов
```typescript
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});
```

### Метрики
- Время выполнения запросов
- Количество запросов
- Использование соединений
- Ошибки базы данных

### Health checks
```typescript
export async function healthCheck() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy' };
  } catch (error) {
    return { status: 'unhealthy', error };
  }
}
```

## 🔧 Конфигурация

### Переменные окружения
```env
# База данных
DATABASE_URL="postgresql://username:password@localhost:5432/gafus"

# Для продакшн
DATABASE_URL="postgresql://username:password@prod-host:5432/gafus?sslmode=require"
```

### Prisma конфигурация
```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl", "linux-musl-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

## 🚀 Развертывание

### Сборка
```bash
pnpm build
```

### Генерация клиента
```bash
pnpm db:generate
```

### Применение миграций
```bash
pnpm db:migrate:deploy
```

### Seed данных
```bash
pnpm db:seed
```

## 🔄 Обновления и миграции

### Обновление Prisma
- Совместимость с новыми версиями
- Миграция конфигурации
- Обновление типов

### Изменения схемы
- Планирование миграций
- Обратная совместимость
- Тестирование изменений
- Откат изменений
