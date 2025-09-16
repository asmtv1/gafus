# Types Package - Общие TypeScript типы

## 📝 Описание

Пакет `@gafus/types` содержит все общие TypeScript типы, интерфейсы и утилиты для всей экосистемы Gafus. Обеспечивает типобезопасность и консистентность типов между всеми приложениями и пакетами.

## 🎯 Основные функции

### Централизованные типы
- Общие интерфейсы для всех приложений
- Типы для API запросов и ответов
- Типы для компонентов UI
- Типы для состояния приложений

### Типобезопасность
- Строгая типизация всех данных
- Валидация типов на этапе компиляции
- IntelliSense поддержка
- Автокомплит в IDE

### Переиспользование
- Общие типы для всех пакетов
- Консистентность между приложениями
- Единый источник истины для типов
- Версионирование типов

## 🏗️ Архитектура

### Структура пакета

```
packages/types/
├── src/
│   ├── auth/                    # Типы аутентификации
│   │   ├── user.ts             # Типы пользователей
│   │   ├── session.ts          # Типы сессий
│   │   ├── permissions.ts      # Типы прав доступа
│   │   └── ...
│   ├── components/              # Типы UI компонентов
│   │   ├── button.ts           # Типы кнопок
│   │   ├── form.ts             # Типы форм
│   │   ├── modal.ts            # Типы модальных окон
│   │   └── ...
│   ├── data/                    # Типы данных
│   │   ├── course.ts           # Типы курсов
│   │   ├── training.ts         # Типы тренировок
│   │   ├── achievement.ts      # Типы достижений
│   │   └── ...
│   ├── stores/                  # Типы состояний
│   │   ├── user-store.ts       # Типы пользовательского состояния
│   │   ├── training-store.ts   # Типы состояния тренировок
│   │   └── ...
│   ├── utils/                   # Утилитарные типы
│   │   ├── api.ts              # Типы API
│   │   ├── validation.ts       # Типы валидации
│   │   ├── common.ts           # Общие типы
│   │   └── ...
│   ├── pages/                   # Типы страниц
│   │   ├── home.ts             # Типы главной страницы
│   │   ├── profile.ts          # Типы профиля
│   │   └── ...
│   └── index.ts                 # Главный экспорт
├── dist/                        # Скомпилированные типы
└── package.json                 # Зависимости
```

## 🔧 API Reference

### Основные категории типов

#### Auth типы
```typescript
// Типы пользователей
export interface User {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  telegramId?: string;
  isConfirmed: boolean;
  role: UserRole;
  petType?: PetType;
  petName?: string;
  petAge?: number;
  petWeight?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Роли пользователей
export enum UserRole {
  USER = 'USER',
  TRAINER = 'TRAINER',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
  PREMIUM = 'PREMIUM'
}

// Типы сессий
export interface Session {
  user: User;
  expires: string;
  accessToken?: string;
  refreshToken?: string;
}
```

#### Data типы
```typescript
// Типы курсов
export interface Course {
  id: string;
  name: string;
  type: string;
  description: string;
  equipment: string;
  trainingLevel: TrainingLevel;
  shortDesc: string;
  duration: string;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  days?: CourseDay[];
}

// Типы тренировок
export interface Training {
  id: string;
  userId: string;
  courseId: string;
  status: TrainingStatus;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  user?: User;
  course?: Course;
  steps?: TrainingStep[];
}

// Статусы тренировок
export enum TrainingStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED'
}
```

#### Component типы
```typescript
// Типы кнопок
export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

// Типы форм
export interface FormProps<T> {
  initialValues: T;
  validationSchema?: ValidationSchema<T>;
  onSubmit: (values: T) => void | Promise<void>;
  children: React.ReactNode;
}

// Типы модальных окон
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large';
}
```

#### Store типы
```typescript
// Типы пользовательского состояния
export interface UserState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

// Действия пользовательского состояния
export interface UserActions {
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
}

// Типы состояния тренировок
export interface TrainingState {
  trainings: Training[];
  currentTraining: Training | null;
  isLoading: boolean;
  error: string | null;
}
```

#### API типы
```typescript
// Базовые типы API
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  error?: string;
}

export interface ApiError {
  message: string;
  code: string;
  details?: Record<string, any>;
}

// Типы запросов
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  phone?: string;
}

// Типы ответов
export interface LoginResponse {
  user: User;
  session: Session;
  accessToken: string;
  refreshToken: string;
}
```

#### Validation типы
```typescript
// Схемы валидации
export interface ValidationSchema<T> {
  [K in keyof T]: ValidationRule<T[K]>;
}

export interface ValidationRule<T> {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: T) => string | null;
}

// Типы ошибок валидации
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}
```

## 🚀 Использование

### Установка
```bash
# В package.json приложения
{
  "dependencies": {
    "@gafus/types": "workspace:*"
  }
}
```

### Импорт типов
```typescript
// Импорт конкретных типов
import { User, UserRole, Training, TrainingStatus } from "@gafus/types";

// Импорт всех типов
import * as Types from "@gafus/types";

// Импорт типов по категориям
import { User, Session } from "@gafus/types/auth";
import { Course, Training } from "@gafus/types/data";
import { ButtonProps, FormProps } from "@gafus/types/components";
```

### Использование в компонентах
```typescript
import React from 'react';
import { User, ButtonProps } from "@gafus/types";

interface UserProfileProps {
  user: User;
  onEdit: (user: User) => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ user, onEdit }) => {
  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
      <button onClick={() => onEdit(user)}>
        Редактировать
      </button>
    </div>
  );
};
```

### Использование в API
```typescript
import { ApiResponse, User, LoginRequest } from "@gafus/types";

export async function loginUser(
  credentials: LoginRequest
): Promise<ApiResponse<User>> {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    
    return await response.json();
  } catch (error) {
    return {
      data: null as any,
      success: false,
      error: error.message
    };
  }
}
```

### Использование в формах
```typescript
import { useForm } from 'react-hook-form';
import { User, ValidationSchema } from "@gafus/types";

const userValidationSchema: ValidationSchema<Partial<User>> = {
  email: {
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  name: {
    required: true,
    min: 2,
    max: 50
  }
};

function UserForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<Partial<User>>();
  
  const onSubmit = (data: Partial<User>) => {
    console.log(data);
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} placeholder="Email" />
      {errors.email && <span>Неверный email</span>}
      
      <input {...register('name')} placeholder="Имя" />
      {errors.name && <span>Имя обязательно</span>}
      
      <button type="submit">Сохранить</button>
    </form>
  );
}
```

## 🔧 Утилитарные типы

### Generic типы
```typescript
// Утилитарные типы
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type Required<T, K extends keyof T> = T & { [P in K]-?: T[P] };
export type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>;

// Примеры использования
type CreateUserRequest = Optional<User, 'id' | 'createdAt' | 'updatedAt'>;
type UpdateUserRequest = PartialExcept<User, 'id'>;
```

### Union типы
```typescript
// Состояния загрузки
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

// Размеры компонентов
export type ComponentSize = 'small' | 'medium' | 'large';

// Варианты кнопок
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success';
```

### Conditional типы
```typescript
// Условные типы
export type ApiEndpoint<T> = T extends 'user' ? '/api/users' : 
                           T extends 'course' ? '/api/courses' : 
                           T extends 'training' ? '/api/trainings' : 
                           never;

// Типы на основе ролей
export type UserPermissions<T extends UserRole> = 
  T extends 'ADMIN' ? 'all' :
  T extends 'TRAINER' ? 'manage_courses' | 'view_users' :
  T extends 'USER' ? 'view_own_data' :
  'none';
```

## 🧪 Тестирование типов

### Type tests
```typescript
// Тестирование типов
import { User, UserRole, Training } from "@gafus/types";

// Проверка структуры User
type UserTest = {
  id: string;
  email: string;
  role: UserRole;
} extends User ? true : false; // должно быть true

// Проверка обязательных полей
type RequiredFieldsTest = {
  id: string;
  email: string;
} extends Pick<User, 'id' | 'email'> ? true : false; // должно быть true
```

### Runtime валидация
```typescript
import { z } from 'zod';
import { User, UserRole } from "@gafus/types";

// Схема валидации для User
const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  role: z.nativeEnum(UserRole),
  isConfirmed: z.boolean()
});

// Валидация во время выполнения
function validateUser(data: unknown): User {
  return UserSchema.parse(data);
}
```

## 📊 Производительность

### Оптимизация импортов
```typescript
// Плохо - импорт всего пакета
import * as Types from "@gafus/types";

// Хорошо - импорт только нужных типов
import { User, Training } from "@gafus/types";
```

### Tree shaking
- Типы не влияют на размер бандла
- TypeScript компилятор удаляет неиспользуемые типы
- Оптимизация импортов для лучшей производительности

## 🔄 Версионирование

### Semantic Versioning
- **Major** - breaking changes в типах
- **Minor** - новые типы, обратно совместимые
- **Patch** - исправления типов

### Миграция типов
```typescript
// Старая версия
interface OldUser {
  id: string;
  name: string;
}

// Новая версия с обратной совместимостью
interface NewUser {
  id: string;
  name: string;
  email: string; // новое поле
}

// Тип для миграции
type MigratedUser = OldUser & { email?: string };
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

## 🔧 Разработка

### Добавление новых типов
1. Создать файл в соответствующей категории
2. Определить типы и интерфейсы
3. Экспортировать из index.ts
4. Обновить документацию
5. Добавить тесты типов

### Структура нового типа
```typescript
// src/data/new-entity.ts
export interface NewEntity {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateNewEntityRequest = Omit<NewEntity, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateNewEntityRequest = Partial<CreateNewEntityRequest>;
```

### Экспорт из index.ts
```typescript
// src/index.ts
export * from './data/new-entity';
```
