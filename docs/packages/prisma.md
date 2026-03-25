# @gafus/prisma - База данных и ORM

## 📋 Обзор

Пакет `@gafus/prisma` предоставляет централизованное управление базой данных PostgreSQL для всей экосистемы GAFUS с использованием Prisma ORM.

## 🎯 Основные функции

### База данных

- **PostgreSQL** как основная база данных
- **Prisma ORM** для работы с данными
- **Миграции** для управления схемой
- **Seed данные** для инициализации

### Схема данных

- **Пользователи и роли** - Система аутентификации
- **Курсы и тренировки** - Образовательный контент
- **Питомцы и достижения** - Управление животными
- **Экзамены и результаты** - Система оценки
- **Уведомления** - Push и Telegram уведомления

## 📦 Установка и использование

### Установка

```bash
pnpm add @gafus/prisma
```

### Базовое использование

```typescript
import { Prisma, PrismaClient } from "@gafus/prisma";

const prisma = new PrismaClient();

// Использование в приложении
const users = await prisma.user.findMany();

// Доступ к пространству имён Prisma (JsonNull, Decimal и т.д.)
const checklist = Prisma.JsonNull;
```

## 🗄️ Схема базы данных

### Основные модели

#### User (Пользователи)

```prisma
model User {
  id                String    @id @default(cuid())
  username          String    @unique
  phone             String    @unique
  password          String
  passwordSetAt     DateTime?  // null = VK-only, пароль не установлен
  telegramId        String?   @unique
  isConfirmed       Boolean   @default(false)
  role              UserRole  @default(USER)

  // Связи
  profile           UserProfile?
  pets              Pet[]
  authoredCourses   Course[]
  userTrainings     UserTraining[]
  accounts          Account[]
  sessions          Session[]

  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}
```

#### Account, Session (OAuth / NextAuth)

Для VK ID и PrismaAdapter добавлены модели:

- **Account** — связь User ↔ OAuth provider (provider, providerAccountId)
- **Session** — NextAuth сессии (strategy: JWT, таблица для adapter)

#### Pet (Питомцы)

```prisma
model Pet {
  id                String               @id @default(cuid())
  ownerId           String
  name              String
  type              PetType
  breed             String
  birthDate         DateTime
  heightCm          Float?
  weightKg          Float?
  photoUrl          String?
  notes             String?

  owner             User                 @relation(fields: [ownerId], references: [id])
  awards            Award[]
  preventionEntries PetPreventionEntry[]

  createdAt         DateTime             @default(now())
  updatedAt         DateTime             @updatedAt
}
```

#### PetPreventionEntry (Журнал профилактики питомца)

Записи о прививках, глистогонке, обработках от клещей/блох.

```prisma
model PetPreventionEntry {
  id          String            @id @default(cuid())
  petId       String
  ownerId     String
  type        PetPreventionType
  performedAt DateTime
  productName String?
  notes       String?
  clientId    String?           // UUID для идемпотентности batch sync

  pet         Pet               @relation(...)
  owner       User              @relation(...)

  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  @@unique([petId, clientId])
  @@index([petId])
  @@index([ownerId])
  @@index([petId, type, performedAt])
}
```

#### PetPreventionType (enum)

```prisma
enum PetPreventionType {
  VACCINATION  // Прививка
  DEWORMING    // Глистогонка
  TICKS_FLEAS  // Обработка от клещей/блох
}
```

#### Course (Курсы)

```prisma
model Course {
  id              String        @id @default(cuid())
  name            String
  type            String        @unique
  description     String
  trainingLevel   TrainingLevel
  duration        String
  logoImg         String
  isPrivate       Boolean       @default(false)
  isPaid          Boolean       @default(false)

  authorId        String
  author          User          @relation(fields: [authorId], references: [id])
  dayLinks        DayOnCourse[]
  userCourses     UserCourse[]

  avgRating       Float?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
}
```

#### TrainingDay (Дни тренировок)

```prisma
model TrainingDay {
  id          String        @id @default(cuid())
  title       String
  equipment   String
  description String
  type        String        @default("regular")

  authorId    String
  author      User          @relation(fields: [authorId], references: [id])
  stepLinks   StepOnDay[]
  dayLinks    DayOnCourse[]

  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
}
```

#### Step (Шаги тренировок)

```prisma
model Step {
  id                    String    @id @default(cuid())
  title                 String
  description           String
  durationSec           Int?      // Фактическая длительность для таймера тренировочного шага (TRAINING)
  estimatedDurationSec  Int?      // Оценочное время прохождения шага (THEORY, EXAMINATION, опционально TRAINING)
  type                  StepType  @default(TRAINING)
  imageUrls             String[]
  pdfUrls               String[]
  videoUrl              String?
  checklist             Json?     // Для экзаменационных шагов

  // Экзаменационные поля
  requiresVideoReport   Boolean   @default(false)
  requiresWrittenFeedback Boolean @default(false)
  hasTestQuestions      Boolean   @default(false)

  authorId              String
  author                User      @relation(fields: [authorId], references: [id])
  stepLinks             StepOnDay[]
  examResults           ExamResult[]

  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
}
```

#### ExamResult (Результаты экзаменов)

```prisma
model ExamResult {
  id                    String    @id @default(cuid())
  userStepId           String    @unique
  stepId               String

  // Тестовые вопросы
  testAnswers          Json?
  testScore            Int?
  testMaxScore         Int?

  // Видео отчет
  videoReportUrl       String?

  // Письменная обратная связь
  writtenFeedback      String?

  // Общая оценка
  overallScore         Int?
  isPassed             Boolean?

  userStep             UserStep  @relation(fields: [userStepId], references: [id])
  step                 Step      @relation(fields: [stepId], references: [id])

  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
}
```

### Enums (Перечисления)

#### UserRole

```prisma
enum UserRole {
  USER
  TRAINER
  ADMIN
  MODERATOR
  PREMIUM
}
```

#### PetType

```prisma
enum PetType {
  DOG
  CAT
}
```

#### TrainingLevel

```prisma
enum TrainingLevel {
  BEGINNER      // Начальный
  INTERMEDIATE  // Средний
  ADVANCED      // Продвинутый
  EXPERT        // Экспертный
}
```

#### StepType

```prisma
enum StepType {
  TRAINING      // Тренировочный
  EXAMINATION   // Экзаменационный
}
```

#### TrainingStatus

```prisma
enum TrainingStatus {
  NOT_STARTED
  IN_PROGRESS
  COMPLETED
  PAUSED
  RESET
}
```

#### ConsentType

```prisma
enum ConsentType {
  PERSONAL_DATA      // Согласие на обработку персональных данных
  PRIVACY_POLICY     // Политика конфиденциальности
  DATA_DISTRIBUTION  // Согласие на размещение в публичном профиле
}
```

#### ConsentLogStatus

```prisma
enum ConsentLogStatus {
  PENDING    // Создано, ожидает привязки к пользователю
  COMPLETED  // Привязано к userId
  FAILED     // Регистрация не удалась
}
```

#### ConsentLog (согласия при регистрации)

```prisma
model ConsentLog {
  id             String          @id @default(cuid())
  tempSessionId  String
  consentType    ConsentType
  userId         String?
  user           User?           @relation(...)
  consentVersion String
  consentText    Json?           // { url: string }
  consentDate    DateTime
  ipAddress      String?
  userAgent      String?
  formData       Json?
  status         ConsentLogStatus
  createdAt      DateTime
  updatedAt      DateTime

  @@unique([tempSessionId, consentType])
  @@index([userId])
  @@index([tempSessionId])
  @@index([status])
  @@index([createdAt])
}
```

При регистрации создаётся по одной записи на каждый тип согласия. Подробнее: [docs/features/consent-registration.md](../features/consent-registration.md).

#### OfertaAcceptance (согласие с Офертой при оплате)

```prisma
model OfertaAcceptance {
  id                    String    @id @default(cuid())
  userId                String
  courseId              String
  paymentId             String?
  appleIapTransactionId String?   // покупка курса через Apple IAP — вместо paymentId
  acceptedAt            DateTime  @default(now())
  ipAddress             String?
  userAgent             String?
  documentVersions      Json
  source                String    @db.VarChar(10)  // "web" | "mobile"

  user                 User                  @relation(...)
  course               Course                @relation(...)
  payment              Payment?              @relation(...)
  appleIapTransaction  AppleIapTransaction?  @relation(...)

  @@index([userId])
  @@index([courseId])
  @@index([paymentId])
  @@index([appleIapTransactionId])
  @@index([acceptedAt])
}
```

Запись создаётся fire-and-forget при успешном создании платежа (web/mobile ЮKassa) или после успешного `verify` Apple IAP для курса. Подробнее: [docs/payments/oferta-compliance.md](../payments/oferta-compliance.md), [iap-apple.md](../payments/iap-apple.md).

#### AppleIapTransaction (леджер покупок App Store)

Отдельная таблица от `Payment` (ЮKassa): `originalTransactionId` уникален глобально, CHECK в миграции — ровно одно из `courseId` / `articleId`. Enum `AppleIapEnvironment` (SANDBOX | PRODUCTION). См. миграции `20260325120000_add_apple_iap_transaction`, `20260325123000_oferta_acceptance_apple_iap`.

## 🔧 API Reference

### Основные операции

#### Создание пользователя

```typescript
const user = await prisma.user.create({
  data: {
    username: "john_doe",
    phone: "+79123456789",
    password: "hashed_password",
    role: "USER",
  },
});
```

#### Получение курсов с авторами

```typescript
const courses = await prisma.course.findMany({
  include: {
    author: {
      select: {
        username: true,
        profile: {
          select: {
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    },
    dayLinks: {
      include: {
        day: true,
      },
    },
  },
});
```

#### Создание тренировки пользователя

```typescript
const userTraining = await prisma.userTraining.create({
  data: {
    userId: "user_id",
    dayOnCourseId: "day_on_course_id",
    status: "IN_PROGRESS",
    currentStepIndex: 0,
  },
});
```

#### Обновление прогресса шага

```typescript
const userStep = await prisma.userStep.upsert({
  where: {
    userTrainingId_stepOnDayId: {
      userTrainingId: "training_id",
      stepOnDayId: "step_on_day_id",
    },
  },
  update: {
    status: "COMPLETED",
    paused: false,
    remainingSec: null,
  },
  create: {
    userTrainingId: "training_id",
    stepOnDayId: "step_on_day_id",
    status: "COMPLETED",
  },
});
```

### Сложные запросы

#### Статистика пользователя

```typescript
const userStats = await prisma.user.findUnique({
  where: { id: userId },
  include: {
    userTrainings: {
      where: { status: "COMPLETED" },
      include: {
        dayOnCourse: {
          include: {
            course: true,
          },
        },
      },
    },
    pets: {
      include: {
        awards: true,
      },
    },
  },
});
```

#### Экзаменационные результаты

```typescript
const examResults = await prisma.examResult.findMany({
  where: {
    step: {
      type: "EXAMINATION",
    },
  },
  include: {
    userStep: {
      include: {
        userTraining: {
          include: {
            user: true,
          },
        },
      },
    },
    step: {
      include: {
        author: true,
      },
    },
  },
});
```

## 🚀 Миграции

### Создание миграции

```bash
npx prisma migrate dev --name add_new_field
```

### Применение миграций

```bash
npx prisma migrate deploy
```

### Ноябрь 2024: поля проверки тренером

- Миграция `20241108120000_exam_result_trainer_review` добавляет поля `trainerComment`, `reviewedAt`, `reviewedById`, внешний ключ на `User` и индексы для выборок по проверкам.
- В продакшене 11.11.2025 эти объекты были добавлены вручную перед отметкой миграций как применённых, поэтому при деплое на новые среды обязательно прогоняйте `pnpm prisma migrate deploy`, чтобы схему привести автоматически.
- Миграция `20251108120000_exam_review_fields` оставлена как заглушка для сохранения истории и не содержит дополнительных изменений.

### Сброс базы данных

```bash
npx prisma migrate reset
```

## 🌱 Seed данные

### Запуск seed

```bash
npx prisma db seed
```

### Пример seed данных

```typescript
// seed.ts
import { PrismaClient, UserRole, PetType, TrainingLevel } from "@gafus/prisma";

const prisma = new PrismaClient();

async function main() {
  // Создание администратора
  const admin = await prisma.user.create({
    data: {
      username: "admin",
      phone: "+79123456789",
      password: "hashed_password",
      role: UserRole.ADMIN,
      isConfirmed: true,
    },
  });

  // Создание тестового курса
  const course = await prisma.course.create({
    data: {
      name: "Основы дрессировки собак",
      type: "basic_dog_training",
      description: "Базовый курс для начинающих",
      trainingLevel: TrainingLevel.BEGINNER,
      duration: "30 дней",
      logoImg: "/uploads/course-logos/basic-dog-training.jpg",
      authorId: admin.id,
    },
  });
}
```

## 🔍 Индексы и производительность

### Важные индексы

```prisma
// Индексы для производительности
model User {
  @@index([username])
  @@index([phone])
  @@index([role])
}

model UserTraining {
  @@index([userId])
  @@index([status])
}

model ExamResult {
  @@index([stepId])
  @@index([userStepId])
}
```

### Оптимизация запросов

```typescript
// Использование select для ограничения полей
const users = await prisma.user.findMany({
  select: {
    id: true,
    username: true,
    role: true,
  },
});

// Пагинация
const courses = await prisma.course.findMany({
  skip: 0,
  take: 20,
  orderBy: {
    createdAt: "desc",
  },
});
```

## 🧪 Тестирование

### Тестовая база данных

```typescript
import { PrismaClient } from "@gafus/prisma";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL,
    },
  },
});

beforeEach(async () => {
  // Очистка тестовых данных
  await prisma.userTraining.deleteMany();
  await prisma.user.deleteMany();
});
```

## 📊 Мониторинг

### Логирование запросов

```typescript
const prisma = new PrismaClient({
  log: [
    { level: "query", emit: "event" },
    { level: "error", emit: "stdout" },
    { level: "info", emit: "stdout" },
    { level: "warn", emit: "stdout" },
  ],
});

prisma.$on("query", (e) => {
  console.log("Query: " + e.query);
  console.log("Params: " + e.params);
  console.log("Duration: " + e.duration + "ms");
});
```

## 🔧 Разработка

### Структура пакета

```
packages/prisma/
├── src/
│   ├── client.ts           # Prisma клиент
│   ├── migrations/         # Миграции
│   └── seed.ts            # Seed данные
├── schema.prisma          # Схема базы данных
├── package.json
└── tsconfig.json
```

### Зависимости

- `@prisma/client` - Prisma клиент
- `prisma` - Prisma CLI
- `@gafus/logger` - Логирование

## 🚀 Развертывание

### Переменные окружения

```env
DATABASE_URL=postgresql://user:password@localhost:5432/gafus
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/gafus_test
```

### Продакшн настройки

- Настройте connection pooling
- Используйте SSL соединения
- Настройте мониторинг производительности
- Регулярно создавайте бэкапы

---

_Пакет @gafus/prisma обеспечивает надежное и производительное управление данными для всей экосистемы GAFUS._
