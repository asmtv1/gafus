# Стандарты организации типов в `@packages/types`

## Цель

Обеспечить чёткое разделение типов между shared пакетом `@packages/types` и приложениями (web, trainer-panel, admin-panel, React Native) для максимального переиспользования и минимальной связанности.

## Базовые принципы

### 1. Платформенная агностичность

`@packages/types` **НЕ ДОЛЖЕН** зависеть от:

- React/React Native специфичных типов (`React.FC`, `ViewStyle`, `HTMLAttributes`)
- Next.js специфичных типов (`NextApiRequest`, `NextResponse`)
- UI библиотек (MUI, styled-components)
- Browser/Native API (DOM, Window, AsyncStorage)

### 2. Минимальность зависимостей

`@packages/types` может зависеть только от:

- TypeScript стандартной библиотеки
- Валидационных библиотек (Zod) - только types, без runtime кода
- Других internal пакетов если необходимо

### 3. Направление зависимостей

```
apps/web → @packages/types ✅
apps/trainer-panel → @packages/types ✅
@packages/types → apps/web ❌ НИКОГДА
```

## Что ДОЛЖНО быть в `@packages/types`

### ✅ 1. Доменные модели и DTO (Data Transfer Objects)

Типы данных, описывающие сущности бизнес-логики:

```typescript
// ✅ В @packages/types
export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
}

export interface Course {
  id: string;
  name: string;
  description: string;
  authorId: string;
}

export interface TrainingDay {
  id: string;
  title: string;
  steps: Step[];
}
```

**Критерий:** Используется в 2+ приложениях или между frontend/backend

### ✅ 2. API контракты

Типы запросов/ответов API:

```typescript
// ✅ В @packages/types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateCourseRequest {
  name: string;
  description: string;
  isPrivate: boolean;
}

export interface GetCoursesResponse {
  courses: Course[];
  total: number;
}
```

### ✅ 3. Enums и константы

Перечисления и константы бизнес-логики:

```typescript
// ✅ В @packages/types
export enum UserRole {
  USER = "USER",
  TRAINER = "TRAINER",
  ADMIN = "ADMIN",
}

export enum TrainingStatus {
  NOT_STARTED = "NOT_STARTED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
}

export const TRAINING_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"] as const;
export type TrainingLevel = (typeof TRAINING_LEVELS)[number];
```

### ✅ 4. Utility Types

Общие вспомогательные типы:

```typescript
// ✅ В @packages/types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type ID = string;
export type Timestamp = number;

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};
```

### ✅ 5. State Shape (без методов)

Форма данных для state management (БЕЗ actions/методов):

```typescript
// ✅ В @packages/types
export interface UserStateData {
  currentUser: User | null;
  preferences: UserPreferences;
  isLoading: boolean;
}

export interface CourseStateData {
  allCourses: Course[];
  favorites: Course[];
  loading: boolean;
  error: string | null;
}

// ❌ НЕ ВКЛЮЧАТЬ методы stores
// Методы должны быть в приложениях
```

**Критерий:** Только shape данных, без методов и действий

### ✅ 6. Валидационные схемы (только types)

Типы для валидации данных:

```typescript
// ✅ В @packages/types
import { z } from "zod";

export const createCourseSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  isPrivate: z.boolean(),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
```

### ✅ 7. Базовые компонентные интерфейсы (data-only)

Только данные для компонентов, БЕЗ UI-специфичных пропсов:

```typescript
// ✅ В @packages/types - только данные
export interface CourseData {
  id: string;
  name: string;
  logoImg: string;
  duration: string;
  avgRating: number | null;
}

export interface StepData {
  id: string;
  title: string;
  description: string;
  durationSec: number;
  videoUrl?: string;
}
```

## Что НЕ ДОЛЖНО быть в `@packages/types`

### ❌ 1. React/UI Component Props

Пропсы компонентов с UI-специфичными полями:

```typescript
// ❌ НЕ В @packages/types
interface CourseCardProps {
  course: CourseData; // ✅ данные из types
  onClick: () => void; // ❌ UI событие
  className?: string; // ❌ UI атрибут
  onToggleFavorite?: () => void; // ❌ UI действие
}

// ✅ Это должно быть в apps/web/src/features/courses/components/CourseCard/types.ts
```

**Критерий:** Если есть `onClick`, `className`, `style`, `children` как ReactNode - это локальный тип

### ❌ 2. Store Actions и методы

Полные интерфейсы stores с методами:

```typescript
// ❌ НЕ В @packages/types
interface CourseStore {
  // ✅ Data - может быть в types
  courses: Course[];
  loading: boolean;

  // ❌ Actions - только в приложениях
  fetchCourses: () => Promise<void>;
  addToFavorites: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

// ✅ CourseStateData в @packages/types
// ✅ CourseStore с методами в apps/web/src/shared/stores/courseStore.ts
```

### ❌ 3. Platform-специфичные типы

Типы, зависящие от платформы:

```typescript
// ❌ НЕ В @packages/types
import { NextApiRequest } from "next"; // ❌ Next.js
import { ViewStyle } from "react-native"; // ❌ React Native
import { MouseEvent } from "react"; // ❌ React DOM

interface PageProps {
  searchParams: { [key: string]: string }; // ❌ Next.js App Router
}
```

### ❌ 4. Framework-специфичные абстракции

```typescript
// ❌ НЕ В @packages/types
export type ServerAction<T> = (formData: FormData) => Promise<ActionResult<T>>;
export type ReactComponent<P> = React.FC<P>;
export type UseFormReturn<T> = { ... }; // react-hook-form
```

**Исключение:** Можно создать framework-agnostic абстракции в `types/react-types.ts` и `types/next-types.ts` как заглушки

### ❌ 5. Локальные UI состояния

```typescript
// ❌ НЕ В @packages/types
interface AccordionStepProps {
  isOpen: boolean; // локальное UI состояние
  onToggle: () => void; // UI действие
}

interface ModalState {
  isVisible: boolean;
  content: ReactNode; // ❌ React-специфично
}
```

### ❌ 6. View Models

Типы, адаптированные для конкретного UI:

```typescript
// ❌ НЕ В @packages/types
// В apps/trainer-panel/src/features/trainer-videos/types.ts
export type TrainerVideoViewModel = Omit<TrainerVideoDto, "createdAt"> & {
  createdAt: string; // преобразовано для UI
  formattedDuration: string; // computed для UI
};
```

## Структура `@packages/types`

```
packages/types/src/
├── auth/              # Типы аутентификации
│   ├── session.ts     # User, Session
│   ├── csrf.ts        # CSRF tokens
│   └── forms.ts       # Login/Register forms
├── data/              # Доменные модели
│   ├── user.ts        # User, UserPreferences
│   ├── course.ts      # Course, CourseWithProgress
│   ├── training.ts    # TrainingDay, Step
│   ├── pet.ts         # Pet, PetAward
│   └── achievements.ts
├── api/               # API контракты
│   ├── requests.ts    # Request types
│   ├── responses.ts   # Response types
│   └── errors.ts      # Error types
├── state/             # State shapes (БЕЗ методов)
│   ├── user-state.ts
│   ├── course-state.ts
│   └── training-state.ts
├── validation/        # Валидационные схемы
│   ├── user.ts
│   └── course.ts
├── utils/             # Utility types
│   ├── common.ts      # Nullable, Optional, ID
│   ├── training-status.ts
│   └── logger.ts
├── queues/            # Queue job types
│   └── video-transcoding.ts
├── error-handling/    # Error types
│   ├── reporting.ts
│   └── monitoring.ts
└── index.ts           # Barrel export
```

## Структура типов в приложениях

### apps/web/

```
apps/web/src/
├── features/
│   └── courses/
│       ├── components/
│       │   └── CourseCard/
│       │       ├── CourseCard.tsx
│       │       └── types.ts          # ✅ CourseCardProps (UI props)
│       └── lib/
│           └── types.ts              # ✅ Feature-specific types
├── shared/
│   ├── stores/
│   │   └── courseStore.ts            # ✅ CourseStore с actions
│   ├── hooks/
│   │   └── useCourse.ts
│   └── types/
│       ├── next-auth.d.ts            # ✅ Type augmentation
│       └── components.ts             # ✅ Shared UI types
```

### apps/trainer-panel/

```
apps/trainer-panel/src/
├── features/
│   └── trainer-videos/
│       └── types.ts                  # ✅ TrainerVideoViewModel
```

## Правила принятия решений

### Чек-лист: "Должен ли тип быть в @packages/types?"

Ответьте на вопросы:

1. ✅ Используется в 2+ приложениях? → Да = кандидат в types
2. ✅ Не зависит от UI фреймворка? → Да = в types
3. ✅ Не содержит методы/actions? → Да = в types
4. ✅ Описывает данные, а не поведение? → Да = в types
5. ✅ Может использоваться в React Native? → Да = в types

Если хотя бы на один вопрос "Нет" → тип остаётся в приложении

### Примеры решений

| Тип                             | В @packages/types? | Почему                                   |
| ------------------------------- | ------------------ | ---------------------------------------- |
| `User` interface                | ✅ Да              | Доменная модель, используется везде      |
| `CourseData`                    | ✅ Да              | Данные курса без UI                      |
| `CourseCardProps`               | ❌ Нет             | Содержит onClick, className              |
| `TrainingStatus` enum           | ✅ Да              | Бизнес-логика, везде используется        |
| `CourseStore` (с методами)      | ❌ Нет             | Содержит actions, специфично для Zustand |
| `CourseStateData` (без методов) | ✅ Да              | Только shape данных                      |
| `ApiResponse<T>`                | ✅ Да              | API контракт                             |
| `AccordionStepProps`            | ❌ Нет             | UI компонент, локальное состояние        |
| `TrainerVideoViewModel`         | ❌ Нет             | View model, адаптация для UI             |
| `CreateCourseInput` (Zod)       | ✅ Да              | Валидация, используется везде            |

## Migration Strategy (для будущей работы)

При рефакторинге существующего кода:

1. **Определите тип** по чек-листу выше
2. **Если переносите В types:**
   - Убедитесь, что нет UI зависимостей
   - Переместите в соответствующую директорию
   - Обновите импорты во всех приложениях
3. **Если переносите ИЗ types:**
   - Создайте локальный файл в feature/component
   - Обновите импорты
   - Удалите из @packages/types

## Best Practices

### 1. Colocation (размещение рядом)

```typescript
// ✅ Хорошо - типы рядом с компонентом
apps/web/src/features/courses/components/CourseCard/
├── CourseCard.tsx
├── CourseCard.module.css
└── types.ts  // CourseCardProps здесь

// ❌ Плохо - типы далеко от использования
apps/web/src/types/course-card.ts
```

### 2. Barrel Exports

```typescript
// @packages/types/src/index.ts
export * from "./data/user";
export * from "./data/course";
export * from "./api/responses";
export type { UserStateData } from "./state/user-state";
// Экспортируем только то, что нужно переиспользовать
```

### 3. Naming Conventions

```typescript
// Данные (в @packages/types)
export interface UserData { ... }
export interface CourseData { ... }

// State shape (в @packages/types)
export interface UserStateData { ... }

// Store (в приложениях)
export interface UserStore extends UserStateData { ... }

// Props (в приложениях)
export interface UserCardProps { ... }

// View Models (в приложениях)
export type UserViewModel = ...
```

### 4. Type Augmentation

```typescript
// apps/web/src/shared/types/next-auth.d.ts
import "next-auth";
import type { AuthUser } from "@gafus/types";

declare module "next-auth" {
  interface Session {
    user: AuthUser; // ✅ Используем тип из @packages/types
  }
}
```

## React Native Compatibility

Для подготовки к React Native:

### ✅ Можно использовать

- Чистые TypeScript типы
- Enums, interfaces, type aliases
- Zod схемы (типы, не runtime валидация)
- Utility types

### ❌ Избегать в @packages/types

- React.FC, ReactNode, ReactElement
- Next.js типы (NextApiRequest, etc.)
- DOM типы (HTMLElement, MouseEvent)
- Web API (fetch Response, Blob)

### Абстракции для совместимости

Если нужны фреймворк-специфичные типы, создавайте заглушки:

```typescript
// @packages/types/src/types/react-types.ts
// Заглушки, которые заменяются в runtime
export type ReactNode = any; // Заменится на React.ReactNode
export interface FormEvent {
  preventDefault: () => void;
  target: { value: string };
}
```

## Заключение

**Золотое правило:** Если сомневаетесь - оставьте тип в приложении. Легче переместить тип В @packages/types при необходимости, чем рефакторить неправильно вынесенный тип ИЗ пакета.

---

_Документ создан на основе лучших практик monorepo проектов (Turborepo, Vercel) и современных стандартов TypeScript 2026_
