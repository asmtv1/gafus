# @gafus/types - Общие типы TypeScript

## 📋 Обзор

Пакет `@gafus/types` содержит все общие TypeScript типы, интерфейсы и утилиты, используемые во всей экосистеме GAFUS для обеспечения типобезопасности и единообразия.

> **📚 Стандарты организации типов:** См. [Стандарты организации типов](./types-standards.md) для чётких правил о том, что должно быть в `@packages/types`, а что остаётся в приложениях.

## 🎯 Основные функции

### Типобезопасность

- **Общие интерфейсы** для всех приложений
- **Валидация типов** на этапе компиляции
- **Единообразные типы** для API и компонентов
- **Утилиты типов** для сложных операций

### Категории типов

- **Auth** - Типы аутентификации и авторизации
- **Components** - Типы для React компонентов
- **Data** - Типы данных и API
- **Stores** - Типы для управления состоянием
- **Utils** - Утилитарные типы
- **Error Handling** - Типы обработки ошибок

## 📦 Установка и использование

### Установка

```bash
pnpm add @gafus/types
```

### Базовое использование

```typescript
import { User, Pet, Course } from "@gafus/types";

const user: User = {
  id: "123",
  username: "john_doe",
  role: "USER",
};
```

## 🔧 API Reference

### Auth типы

#### `User`

Основной тип пользователя.

```typescript
interface User {
  id: string;
  username: string;
  phone: string;
  role: UserRole;
  isConfirmed: boolean;
  telegramId?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

#### `UserRole`

Роли пользователей в системе.

```typescript
type UserRole = "USER" | "TRAINER" | "ADMIN" | "MODERATOR" | "PREMIUM";
```

#### `UserProfile`

Профиль пользователя.

```typescript
interface UserProfile {
  id: string;
  userId: string;
  fullName?: string;
  birthDate?: Date;
  about?: string;
  telegram?: string;
  instagram?: string;
  website?: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Data типы

#### `Pet`

Тип домашнего животного.

```typescript
interface Pet {
  id: string;
  ownerId: string;
  name: string;
  type: PetType;
  breed: string;
  birthDate: Date;
  heightCm?: number;
  weightKg?: number;
  photoUrl?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

#### `PetType`

Типы домашних животных.

```typescript
type PetType = "DOG" | "CAT";
```

#### `Course`

Тип курса обучения.

```typescript
interface Course {
  id: string;
  name: string;
  type: string;
  description: string;
  equipment: string;
  trainingLevel: TrainingLevel;
  shortDesc: string;
  duration: string;
  logoImg: string;
  isPrivate: boolean;
  isPaid: boolean;
  authorId: string;
  avgRating?: number;
  videoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

#### `TrainingLevel`

Уровни сложности тренировок.

```typescript
type TrainingLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
```

#### `Step`

Тип шага тренировки.

```typescript
interface Step {
  id: string;
  title: string;
  description: string;
  durationSec?: number;
  type: StepType;
  imageUrls: string[];
  pdfUrls: string[];
  videoUrl?: string;
  checklist?: any; // JSON для экзаменационных шагов
  requiresVideoReport: boolean;
  requiresWrittenFeedback: boolean;
  hasTestQuestions: boolean;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

#### `StepType`

Типы шагов тренировок.

```typescript
type StepType = "TRAINING" | "EXAMINATION";
```

#### `TrainingStatus`

Статусы тренировок.

```typescript
type TrainingStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED" | "RESET";
```

### Store типы

#### `UserState`

Состояние пользователя в store.

```typescript
interface UserState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  preferences: UserPreferences;
}
```

#### `UserPreferences`

Настройки пользователя.

```typescript
interface UserPreferences {
  notifications: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  language: string;
  theme: "light" | "dark";
}
```

#### `PetsState`

Состояние питомцев в store.

```typescript
interface PetsState {
  pets: Pet[];
  currentPet: Pet | null;
  isLoading: boolean;
  error: string | null;
}
```

#### `CreatePetInput`

Входные данные для создания питомца.

```typescript
interface CreatePetInput {
  name: string;
  type: PetType;
  breed: string;
  birthDate: Date;
  heightCm?: number;
  weightKg?: number;
  photoUrl?: string;
  notes?: string;
}
```

### Component типы

#### `FormField`

Тип для полей форм.

```typescript
interface FormField {
  name: string;
  label: string;
  type: "text" | "email" | "password" | "number" | "date" | "file";
  required: boolean;
  placeholder?: string;
  validation?: ValidationRule[];
}
```

#### `ValidationRule`

Правила валидации.

```typescript
interface ValidationRule {
  type: "required" | "minLength" | "maxLength" | "pattern" | "custom";
  value?: any;
  message: string;
}
```

### Error Handling типы

#### `ErrorInfo`

Информация об ошибке.

```typescript
interface ErrorInfo {
  message: string;
  stack?: string;
  componentStack?: string;
  errorBoundary?: string;
  errorId?: string;
  timestamp: Date;
}
```

#### `ErrorBoundaryConfig`

Конфигурация для Error Boundary.

```typescript
interface ErrorBoundaryConfig {
  fallback?: React.ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  reportError?: boolean;
}
```

### Utility типы

#### `ApiResponse<T>`

Стандартный ответ API.

```typescript
interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  error?: string;
}
```

#### `PaginatedResponse<T>`

Пагинированный ответ API.

```typescript
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

#### `FormState<T>`

Состояние формы.

```typescript
interface FormState<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isSubmitting: boolean;
  isValid: boolean;
}
```

## 🎯 Специализированные типы

### Training типы

#### `UserTraining`

Тренировка пользователя.

```typescript
interface UserTraining {
  id: string;
  userId: string;
  dayOnCourseId: string;
  status: TrainingStatus;
  currentStepIndex: number;
  createdAt: Date;
  updatedAt: Date;
}
```

#### `UserStep`

Шаг тренировки пользователя.

```typescript
interface UserStep {
  id: string;
  userTrainingId: string;
  stepOnDayId: string;
  status: TrainingStatus;
  paused: boolean;
  remainingSec?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### Exam типы

#### `ExamResult`

Результат экзамена.

```typescript
interface ExamResult {
  id: string;
  userStepId: string;
  stepId: string;
  testAnswers?: any; // JSON
  testScore?: number;
  testMaxScore?: number;
  videoReportUrl?: string;
  writtenFeedback?: string;
  overallScore?: number;
  isPassed?: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Notification типы

#### `PushSubscription`

Push подписка.

```typescript
interface PushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

#### `StepNotification`

Уведомление о шаге.

```typescript
interface StepNotification {
  id: string;
  userId: string;
  day: number;
  stepIndex: number;
  endTs: number;
  sent: boolean;
  subscription: any; // JSON
  url?: string;
  jobId?: string;
  paused: boolean;
  remainingSec?: number;
  stepTitle?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

## 🔧 Утилитарные типы

### Generic типы

#### `Optional<T, K extends keyof T>`

Делает указанные поля необязательными.

```typescript
type PartialUser = Optional<User, "telegramId" | "isConfirmed">;
```

#### `RequiredFields<T, K extends keyof T>`

Делает указанные поля обязательными.

```typescript
type RequiredUser = RequiredFields<User, "telegramId">;
```

#### `PickByType<T, U>`

Выбирает поля определенного типа.

```typescript
type StringFields = PickByType<User, string>;
```

### Validation типы

#### `ValidationSchema<T>`

Схема валидации для типа.

```typescript
type ValidationSchema<T> = {
  [K in keyof T]: ValidationRule[];
};
```

#### `FormErrors<T>`

Ошибки формы для типа.

```typescript
type FormErrors<T> = Partial<Record<keyof T, string>>;
```

## 🧪 Тестирование

### Мокирование типов

```typescript
import { User, Pet, Course } from "@gafus/types";

const mockUser: User = {
  id: "1",
  username: "test_user",
  phone: "+79123456789",
  role: "USER",
  isConfirmed: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPet: Pet = {
  id: "1",
  ownerId: "1",
  name: "Buddy",
  type: "DOG",
  breed: "Golden Retriever",
  birthDate: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};
```

### Type Guards

```typescript
import { User, Pet } from "@gafus/types";

function isUser(obj: any): obj is User {
  return obj && typeof obj.id === "string" && typeof obj.username === "string";
}

function isPet(obj: any): obj is Pet {
  return (
    obj &&
    typeof obj.id === "string" &&
    typeof obj.name === "string" &&
    ["DOG", "CAT"].includes(obj.type)
  );
}
```

## 🔧 Разработка

### Структура пакета

```
packages/types/
├── src/
│   ├── auth.ts              # Типы аутентификации
│   ├── components.ts        # Типы компонентов
│   ├── data.ts             # Типы данных
│   ├── stores/
│   │   ├── csrf.ts         # CSRF store
│   │   ├── notification.ts # Notification store
│   │   ├── petsStore.ts    # Pets store
│   │   ├── step.ts         # Step store
│   │   ├── timer.ts        # Timer store
│   │   ├── training.ts     # Training store
│   │   └── userStore.ts    # User store
│   ├── utils/
│   │   ├── logger.ts       # Logger утилиты
│   │   └── validation.ts   # Validation утилиты
│   ├── pages.ts            # Типы страниц
│   ├── error-handling.ts   # Обработка ошибок
│   ├── offline.ts          # Офлайн типы
│   ├── error-reporting.ts  # Отчеты об ошибках
│   ├── swr.ts             # SWR типы
│   ├── types.ts           # Основные типы
│   └── index.ts           # Главный экспорт
├── package.json
└── tsconfig.json
```

### Зависимости

- `react-hook-form` - Типы для форм
- `@gafus/logger` - Логирование

## 🚀 Использование в проектах

### В веб-приложении

```typescript
import { User, Pet, Course, TrainingStatus } from "@gafus/types";

function UserDashboard({ user }: { user: User }) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);

  // Типобезопасное использование
}
```

### В панели тренера

```typescript
import { User, Course, TrainingLevel } from "@gafus/types";

function CourseEditor({ course }: { course: Course }) {
  // Типобезопасное редактирование курса
}
```

### В API routes

```typescript
import { ApiResponse, User, CreatePetInput } from "@gafus/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<User>>,
) {
  // Типобезопасные API endpoints
}
```

---

_Пакет @gafus/types обеспечивает типобезопасность и единообразие типов во всей экосистеме GAFUS._
