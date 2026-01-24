# API Документация

## 📋 Обзор

Система GAFUS предоставляет несколько типов API для взаимодействия с различными компонентами:

- **REST API** - Стандартные HTTP endpoints
- **Server Actions** - Next.js Server Actions для клиент-серверного взаимодействия
- **GraphQL** - (планируется) Для сложных запросов данных

## 🔗 REST API

### Базовый URL

```
Production: https://api.gafus.ru
Development: http://localhost:3002/api
```

### Аутентификация

Все API endpoints требуют аутентификации через JWT токены:

```http
Authorization: Bearer <jwt-token>
```

### Основные endpoints

#### Пользователи

```http
GET    /api/users              # Получить список пользователей
GET    /api/users/:id          # Получить пользователя по ID
PUT    /api/users/:id          # Обновить пользователя
DELETE /api/users/:id          # Удалить пользователя
```

#### Курсы

```http
GET    /api/courses            # Получить список курсов
GET    /api/courses/:id        # Получить курс по ID
POST   /api/courses            # Создать новый курс
PUT    /api/courses/:id        # Обновить курс
DELETE /api/courses/:id        # Удалить курс
```

#### Тренировки

```http
GET    /api/trainings          # Получить тренировки пользователя
POST   /api/trainings          # Начать новую тренировку
PUT    /api/trainings/:id      # Обновить прогресс тренировки
```

#### Питомцы

```http
GET    /api/pets               # Получить питомцев пользователя
POST   /api/pets               # Добавить нового питомца
PUT    /api/pets/:id           # Обновить информацию о питомце
DELETE /api/pets/:id           # Удалить питомца
```

### Формат ответов

#### Успешный ответ

```json
{
  "success": true,
  "data": {
    // данные ответа
  },
  "message": "Операция выполнена успешно"
}
```

#### Ответ с ошибкой

```json
{
  "success": false,
  "error": "Описание ошибки",
  "code": "ERROR_CODE",
  "details": {
    // дополнительная информация об ошибке
  }
}
```

## ⚡ Server Actions

Server Actions предоставляют типобезопасное взаимодействие между клиентом и сервером в Next.js приложениях.

### Основные Actions

#### Аутентификация

```typescript
// server-actions/auth.ts
"use server";

import { signIn, signOut } from "@gafus/auth/server";

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  return await signIn("credentials", {
    email,
    password,
    redirect: false,
  });
}

export async function logoutAction() {
  return await signOut();
}
```

#### Управление курсами

```typescript
// server-actions/courses.ts
"use server";

import { prisma } from "@gafus/prisma";
import { revalidatePath } from "next/cache";

export async function createCourseAction(data: CreateCourseData) {
  try {
    const course = await prisma.course.create({
      data: {
        name: data.name,
        description: data.description,
        trainingLevel: data.trainingLevel,
        authorId: data.authorId,
      },
    });

    revalidatePath("/courses");
    return { success: true, course };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateCourseAction(id: string, data: UpdateCourseData) {
  try {
    const course = await prisma.course.update({
      where: { id },
      data,
    });

    revalidatePath("/courses");
    return { success: true, course };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

#### Управление тренировками

```typescript
// server-actions/trainings.ts
"use server";

import { prisma } from "@gafus/prisma";

export async function startTrainingAction(courseId: string, userId: string) {
  try {
    const userCourse = await prisma.userCourse.findFirst({
      where: {
        userId,
        courseId,
        status: "NOT_STARTED",
      },
    });

    if (!userCourse) {
      return { success: false, error: "Курс не найден или уже начат" };
    }

    const updatedCourse = await prisma.userCourse.update({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });

    return { success: true, userCourse: updatedCourse };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

## 📱 WebSocket API

### Подключение

```typescript
const ws = new WebSocket("wss://gafus.ru/ws");

ws.onopen = () => {
  console.log("WebSocket подключен");

  // Аутентификация
  ws.send(
    JSON.stringify({
      type: "auth",
      token: "jwt-token",
    }),
  );
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log("Получено сообщение:", message);
};
```

### Типы сообщений

#### Уведомления о тренировках

```json
{
  "type": "training_notification",
  "data": {
    "trainingId": "training_123",
    "message": "Время для тренировки!",
    "courseName": "Основы дрессировки",
    "stepTitle": "Шаг 1: Команда 'Сидеть'"
  }
}
```

#### Прогресс тренировки

```json
{
  "type": "training_progress",
  "data": {
    "trainingId": "training_123",
    "progress": 75,
    "currentStep": 3,
    "totalSteps": 4
  }
}
```

## 🔐 Безопасность API

### Rate Limiting

```typescript
// middleware.ts
import { rateLimit } from "express-rate-limit";

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов в окне
  message: {
    error: "Слишком много запросов, попробуйте позже",
  },
});

export default apiLimiter;
```

### Валидация данных

```typescript
import { z } from "zod";

const CreateCourseSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(10).max(1000),
  trainingLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]),
  duration: z.string().min(1),
  equipment: z.string().optional(),
});

export async function createCourseAction(data: unknown) {
  try {
    const validatedData = CreateCourseSchema.parse(data);
    // обработка данных
  } catch (error) {
    return { success: false, error: "Неверные данные" };
  }
}
```

## 📊 Мониторинг API

### Логирование запросов

```typescript
// middleware/logging.ts
import { logger } from "@gafus/logger";

export function apiLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startTime;

    logger.info("API Request", {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get("User-Agent"),
      ip: req.ip,
    });
  });

  next();
}
```

### Метрики производительности

```typescript
// middleware/metrics.ts
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startTime;

    // Отправка метрик в систему мониторинга
    metrics.histogram("api_request_duration", duration, {
      method: req.method,
      endpoint: req.path,
      status_code: res.statusCode,
    });
  });

  next();
}
```

## 🧪 Тестирование API

### Unit тесты

```typescript
import { describe, it, expect } from "@jest/globals";
import { createCourseAction } from "./server-actions/courses";

describe("Course API", () => {
  it("should create course successfully", async () => {
    const courseData = {
      name: "Test Course",
      description: "Test Description",
      trainingLevel: "BEGINNER" as const,
      duration: "30 дней",
      authorId: "user_123",
    };

    const result = await createCourseAction(courseData);

    expect(result.success).toBe(true);
    expect(result.course).toBeDefined();
  });
});
```

### Integration тесты

```typescript
import { test, expect } from "@playwright/test";

test("API should return courses list", async ({ request }) => {
  const response = await request.get("/api/courses");

  expect(response.status()).toBe(200);

  const data = await response.json();
  expect(data.success).toBe(true);
  expect(Array.isArray(data.data)).toBe(true);
});
```

---

_API документация обеспечивает полное понимание интерфейсов взаимодействия с системой GAFUS._
