# React Native Mobile Application

**Дата создания:** 19 января 2026  
**Версия документа:** 1.1.0  
**Статус:** MVP в разработке

## Текущий статус реализации

### Реализовано (v1.3.0)

- [x] Конфигурация проекта (package.json, tsconfig.json, app.json)
- [x] MMKV Storage адаптер для Zustand
- [x] API клиент с авторизацией
- [x] API модули: auth, courses, training, **pets, achievements, user, subscriptions**
- [x] Zustand stores: authStore, courseStore, trainingStore, stepStore, timerStore
- [x] Провайдеры: Query, Auth, Theme
- [x] Базовые UI компоненты: Button, Input, Card, Loading
- [x] Layouts: root, auth, main, tabs
- [x] Страница авторизации (login, register, reset-password)
- [x] Главная страница (dashboard)
- [x] Страница курсов с фильтрами
- [x] **Страница достижений** (логика и дизайн как web: статистика, достижения по категориям, детальная статистика по курсам)
- [x] Страница профиля
- [x] **Редактирование профиля** (`/profile/edit`)
- [x] Экран списка дней курса (`/training/[courseType]`)
- [x] Экран дня тренировки с шагами (`/training/[courseType]/[dayId]`); в днях «Подведение итогов» при включённой опции — кнопка экспорта PDF «Ваш путь» (открывает web API, в офлайне недоступна)
- [x] Компонент таймера шага (StepTimer)
- [x] Компонент аккордеона шага (AccordionStep)
- [x] Хуки для тренировок
- [x] **Видео плеер (VideoPlayer)** с fullscreen и управлением
- [x] **Экран питомцев** (`/pets`) с CRUD операциями
- [x] **Network status хук и OfflineIndicator**
- [x] **Push уведомления** (регистрация и сохранение токена)
- [x] **Haptic feedback утилиты**
- [x] **Календарь тренировок** (TrainingCalendar)
- [x] **Смена аватара пользователя** (профиль: нажатие на аватар → выбор фото → загрузка через `POST /api/v1/user/avatar`)
- [x] **Смена фото питомца** (профиль: нажатие на фото питомца → выбор фото → загрузка через `POST /api/v1/pets/:petId/photo`)
- [x] **Офлайн режим**: скачивание курсов (meta + медиа), локальное HLS, очередь скачивания, воспроизведение из кэша; синхронизация прогресса при появлении сети (очередь мутаций startStep/pause/resume/complete)

### В планах

- [ ] (Опционально) WatermelonDB для офлайна — текущая реализация на meta.json + expo-file-system

---

## Содержание

1. [Обзор проекта](#обзор-проекта)
2. [Архитектура](#архитектура)
3. [Технологический стек](#технологический-стек)
4. [Структура проекта](#структура-проекта)
5. [Переиспользование кода](#переиспользование-кода)
6. [API взаимодействие](#api-взаимодействие)
7. [Типизация](#типизация)
8. [State Management](#state-management)
9. [Навигация](#навигация)
10. [UI компоненты](#ui-компоненты)
11. [Офлайн режим](#офлайн-режим)
12. [Push уведомления](#push-уведомления)
13. [Медиа (видео/изображения)](#медиа)
14. [Аутентификация](#аутентификация)
15. [Безопасность](#безопасность)
16. [Тестирование](#тестирование)
17. [CI/CD и публикация](#cicd-и-публикация)
18. [Критические нюансы и подводные камни](#критические-нюансы)
19. [Чеклист готовности](#чеклист-готовности)

---

## Обзор проекта

### Цель

Создание мобильного приложения на React Native, которое является полным аналогом web-приложения GAFUS для iOS и Android. Приложение должно обеспечивать:

- Идентичный функционал с web-версией
- Нативный пользовательский опыт
- Офлайн работу с курсами
- Push-уведомления
- Оптимизированную производительность

### Принципы разработки

1. **Паритет функций** — все функции web-версии должны быть в mobile
2. **Единая кодовая база типов** — используем `@gafus/types`
3. **Идентичная бизнес-логика** — переиспользуем логику из web
4. **Нативный UX** — используем нативные компоненты где это улучшает UX
5. **Offline-first** — приложение должно работать без интернета

---

## Архитектура

### Высокоуровневая схема

```
┌─────────────────────────────────────────────────────────────┐
│                    React Native App                          │
├─────────────────────────────────────────────────────────────┤
│  UI Layer (React Native + React Native Paper)                │
├─────────────────────────────────────────────────────────────┤
│  State Management (Zustand - stores из web)                  │
├─────────────────────────────────────────────────────────────┤
│  API Layer (React Query + Fetch)                             │
├─────────────────────────────────────────────────────────────┤
│  Offline Storage (MMKV + WatermelonDB/SQLite)               │
├─────────────────────────────────────────────────────────────┤
│  Native Modules (Push, Video, Haptics)                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend API (Next.js)                     │
│                    /api/v1/* endpoints                       │
└─────────────────────────────────────────────────────────────┘
```

### Взаимодействие с Backend

```
Mobile App ──HTTP/HTTPS──► API Routes (/api/v1/*) ──► Prisma ──► PostgreSQL
                              │
                              ├──► BullMQ (очереди)
                              └──► Redis (кэш)
```

**ВАЖНО:** Mobile приложение НЕ взаимодействует напрямую с Prisma. Вся работа с БД идёт через API Routes.

---

## Технологический стек

### Core

| Технология   | Версия  | Назначение                       |
| ------------ | ------- | -------------------------------- |
| React Native | 0.76+   | Фреймворк                        |
| Expo         | SDK 52+ | Инфраструктура и нативные модули |
| TypeScript   | 5.8+    | Типизация                        |

### State & Data

| Технология                   | Назначение                       |
| ---------------------------- | -------------------------------- |
| Zustand                      | Глобальное состояние (как в web) |
| TanStack Query (React Query) | Кэширование API запросов         |
| MMKV                         | Быстрое key-value хранилище      |
| WatermelonDB или SQLite      | Офлайн база данных               |

### UI

| Технология                   | Назначение                 |
| ---------------------------- | -------------------------- |
| React Native Paper           | Material Design компоненты |
| React Navigation             | Навигация                  |
| React Native Reanimated      | Анимации                   |
| React Native Gesture Handler | Жесты                      |

### Native Features

| Технология         | Назначение                |
| ------------------ | ------------------------- |
| expo-notifications | Push уведомления          |
| expo-av            | Видео плеер               |
| expo-haptics       | Тактильная обратная связь |
| expo-file-system   | Работа с файлами          |
| expo-secure-store  | Безопасное хранение       |

### Выбор: Expo vs React Native CLI

**Рекомендация: Expo (Managed Workflow)**

Причины:

1. Expo SDK 52+ поддерживает все нужные нативные модули
2. EAS Build для сборки под iOS/Android без локальных зависимостей
3. OTA обновления для быстрых исправлений
4. Упрощённая настройка push-уведомлений
5. Встроенная поддержка видео и файловой системы

---

## Структура проекта

```
apps/mobile/
├── app/                          # Expo Router (file-based routing)
│   ├── (auth)/                   # Группа авторизации
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   └── reset-password.tsx
│   ├── (main)/                   # Основное приложение (требует auth)
│   │   ├── (tabs)/               # Tab навигация
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx         # Главная/Курсы
│   │   │   ├── achievements.tsx  # Достижения
│   │   │   └── profile.tsx       # Профиль
│   │   ├── training/
│   │   │   ├── [courseType]/
│   │   │   │   ├── index.tsx     # Список дней
│   │   │   │   └── [dayId].tsx   # День с шагами
│   │   └── _layout.tsx
│   ├── _layout.tsx               # Root layout
│   └── +not-found.tsx
│
├── src/
│   ├── features/                 # Фичи (аналог web)
│   │   ├── achievements/
│   │   │   ├── components/
│   │   │   └── hooks/
│   │   ├── courses/
│   │   │   ├── components/
│   │   │   │   ├── CourseCard.tsx
│   │   │   │   ├── CourseFilters.tsx
│   │   │   │   └── CourseList.tsx
│   │   │   ├── hooks/
│   │   │   └── types.ts
│   │   ├── profile/
│   │   │   ├── components/
│   │   │   └── hooks/
│   │   └── training/
│   │       ├── components/
│   │       │   ├── AccordionStep.tsx
│   │       │   ├── StepTimer.tsx
│   │       │   ├── TrainingDayList.tsx
│   │       │   └── VideoPlayer.tsx
│   │       ├── hooks/
│   │       │   └── useTrainingDay.ts
│   │       └── types.ts
│   │
│   ├── shared/
│   │   ├── components/           # Переиспользуемые компоненты
│   │   │   ├── ui/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   └── Loading.tsx
│   │   │   ├── Avatar.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   └── OfflineIndicator.tsx
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useOffline.ts
│   │   │   └── useNetworkStatus.ts
│   │   ├── lib/
│   │   │   ├── api/              # API клиент
│   │   │   │   ├── client.ts     # Базовый fetch клиент
│   │   │   │   ├── auth.ts
│   │   │   │   ├── courses.ts
│   │   │   │   ├── training.ts
│   │   │   │   └── user.ts
│   │   │   ├── offline/          # Офлайн функционал
│   │   │   │   ├── storage.ts
│   │   │   │   ├── sync.ts
│   │   │   │   └── queue.ts
│   │   │   └── utils/
│   │   │       ├── haptics.ts
│   │   │       ├── notifications.ts
│   │   │       └── video.ts
│   │   ├── stores/               # Zustand stores
│   │   │   ├── authStore.ts
│   │   │   ├── trainingStore.ts
│   │   │   ├── stepStore.ts
│   │   │   ├── timerStore.ts
│   │   │   ├── offlineStore.ts
│   │   │   └── index.ts
│   │   └── providers/
│   │       ├── AuthProvider.tsx
│   │       ├── QueryProvider.tsx
│   │       └── ThemeProvider.tsx
│   │
│   └── types/                    # Локальные типы (расширения)
│       └── navigation.ts
│
├── assets/                       # Статические ресурсы
│   ├── fonts/
│   ├── images/
│   └── animations/
│
├── app.json                      # Expo конфигурация
├── eas.json                      # EAS Build конфигурация
├── babel.config.js
├── metro.config.js
├── package.json
└── tsconfig.json
```

---

## Переиспользование кода

### Что переиспользуем из монорепозитория

#### 1. Типы (`@gafus/types`) ✅ ПОЛНОСТЬЮ

```typescript
// Импорт типов напрямую из пакета
import type {
  User,
  Pet,
  Course,
  TrainingStatus,
  UserStep,
  ApiResponse,
  PaginatedResponse,
} from "@gafus/types";

// Пример использования
const [user, setUser] = useState<User | null>(null);
```

**Все типы из `@gafus/types` работают в React Native без изменений**, так как это чистый TypeScript без зависимостей от браузера/Node.js.

#### 2. Логика stores (концепции) ✅ АДАПТИРУЕМ

Stores из web используют Zustand, который работает в React Native. Но нужна адаптация:

**Web версия (`apps/web/src/shared/stores/trainingStore.ts`):**

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useTrainingStore = create<TrainingStore>()(
  persist(
    (set, get) => ({
      // ... логика
    }),
    {
      name: "training-storage", // localStorage в web
    },
  ),
);
```

**Mobile версия (`apps/mobile/src/shared/stores/trainingStore.ts`):**

```typescript
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { MMKV } from "react-native-mmkv";

// MMKV вместо localStorage
const storage = new MMKV();

const mmkvStorage = {
  getItem: (name: string) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  setItem: (name: string, value: string) => {
    storage.set(name, value);
  },
  removeItem: (name: string) => {
    storage.delete(name);
  },
};

export const useTrainingStore = create<TrainingStore>()(
  persist(
    (set, get) => ({
      // ТА ЖЕ логика что и в web
    }),
    {
      name: "training-storage",
      storage: createJSONStorage(() => mmkvStorage), // MMKV вместо localStorage
    },
  ),
);
```

#### 3. Утилиты расчёта статусов (`@gafus/core`) ✅ ПОЛНОСТЬЮ

```typescript
// Переиспользуем напрямую
import { calculateDayStatus } from "@gafus/core/utils/training";

// Работает идентично web
const status = calculateDayStatus(courseId, dayOnCourseId, stepStates);
```

#### 4. Zod схемы валидации ✅ ПОЛНОСТЬЮ

```typescript
import { z } from "zod";

// Схемы из web работают без изменений
const loginSchema = z.object({
  username: z.string().min(3, "Минимум 3 символа"),
  password: z.string().min(6, "Минимум 6 символов"),
});
```

### Что НЕ переиспользуем (создаём заново)

| Категория      | Причина                                           |
| -------------- | ------------------------------------------------- |
| UI компоненты  | React Native использует View/Text вместо div/span |
| Навигация      | React Navigation вместо Next.js App Router        |
| Server Actions | Заменяем на API запросы                           |
| CSS Modules    | Заменяем на StyleSheet или React Native Paper     |
| next/image     | Заменяем на expo-image                            |
| Service Worker | Нет в RN, используем нативный офлайн              |
| localStorage   | Заменяем на MMKV                                  |
| IndexedDB      | Заменяем на SQLite/WatermelonDB                   |

### Таблица соответствия web → mobile

| Web                          | Mobile                              |
| ---------------------------- | ----------------------------------- |
| `<Link href="/path">`        | `<Link href="/path">` (Expo Router) |
| `useRouter()`                | `useRouter()` (Expo Router)         |
| `localStorage`               | `MMKV`                              |
| `IndexedDB`                  | `WatermelonDB` / `SQLite`           |
| `fetch()`                    | `fetch()` (работает)                |
| `Image` (next/image)         | `Image` (expo-image)                |
| CSS Modules                  | `StyleSheet.create()`               |
| `window.navigator.vibrate()` | `Haptics.impactAsync()`             |
| Service Worker cache         | File System cache                   |

---

## API взаимодействие

### Базовый API клиент

```typescript
// src/shared/lib/api/client.ts
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "@/constants";

interface ApiClientOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export async function apiClient<T>(
  endpoint: string,
  options: ApiClientOptions = {},
): Promise<ApiResponse<T>> {
  const { method = "GET", body, headers = {} } = options;

  // Получаем токен авторизации
  const token = await SecureStore.getItemAsync("auth_token");

  const config: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
  };

  if (body && method !== "GET") {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Ошибка запроса",
        code: data.code,
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Сетевая ошибка",
      code: "NETWORK_ERROR",
    };
  }
}
```

### API модули (по доменам)

```typescript
// src/shared/lib/api/training.ts
import { apiClient } from "./client";
import type { TrainingDay, UserStep } from "@gafus/types";

export const trainingApi = {
  // GET /api/v1/training/days
  getDays: async (courseType: string) => {
    return apiClient<{
      trainingDays: TrainingDay[];
      courseDescription: string;
      courseId: string;
      courseVideoUrl: string;
    }>(`/api/v1/training/days?type=${courseType}`);
  },

  // GET /api/v1/training/day
  getDay: async (courseType: string, dayOnCourseId: string, createIfMissing = true) => {
    const params = new URLSearchParams({
      courseType,
      dayOnCourseId,
      createIfMissing: String(createIfMissing),
    });
    return apiClient<{
      trainingDayId: string;
      dayOnCourseId: string;
      title: string;
      type: string;
      steps: UserStep[];
    }>(`/api/v1/training/day?${params}`);
  },

  // POST /api/v1/training/step/start
  startStep: async (data: {
    courseId: string;
    dayOnCourseId: string;
    stepIndex: number;
    status: string;
    durationSec: number;
  }) => {
    return apiClient("/api/v1/training/step/start", {
      method: "POST",
      body: data,
    });
  },

  // POST /api/v1/training/step/complete/theory
  completeTheoryStep: async (data: {
    courseId: string;
    dayOnCourseId: string;
    stepIndex: number;
    stepTitle?: string;
    stepOrder?: number;
  }) => {
    return apiClient("/api/v1/training/step/complete/theory", {
      method: "POST",
      body: data,
    });
  },

  // POST /api/v1/training/step/complete/practice
  completePracticeStep: async (data: {
    courseId: string;
    dayOnCourseId: string;
    stepIndex: number;
    stepTitle?: string;
    stepOrder?: number;
  }) => {
    return apiClient("/api/v1/training/step/complete/practice", {
      method: "POST",
      body: data,
    });
  },

  // POST /api/v1/training/step/pause
  pauseStep: async (data: {
    courseId: string;
    dayOnCourseId: string;
    stepIndex: number;
    timeLeftSec: number;
  }) => {
    return apiClient("/api/v1/training/step/pause", {
      method: "POST",
      body: data,
    });
  },

  // POST /api/v1/training/step/resume
  resumeStep: async (data: { courseId: string; dayOnCourseId: string; stepIndex: number }) => {
    return apiClient("/api/v1/training/step/resume", {
      method: "POST",
      body: data,
    });
  },
};
```

### React Query интеграция

```typescript
// src/shared/hooks/useTrainingDays.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trainingApi } from "@/shared/lib/api/training";

export function useTrainingDays(courseType: string) {
  return useQuery({
    queryKey: ["trainingDays", courseType],
    queryFn: () => trainingApi.getDays(courseType),
    staleTime: 5 * 60 * 1000, // 5 минут
  });
}

export function useTrainingDay(courseType: string, dayOnCourseId: string) {
  return useQuery({
    queryKey: ["trainingDay", courseType, dayOnCourseId],
    queryFn: () => trainingApi.getDay(courseType, dayOnCourseId),
  });
}

export function useStartStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: trainingApi.startStep,
    onSuccess: (_, variables) => {
      // Инвалидируем кэш дня
      queryClient.invalidateQueries({
        queryKey: ["trainingDay", variables.courseId],
      });
    },
  });
}
```

---

## Типизация

### Источники типов

```typescript
// tsconfig.json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@gafus/types": ["../../packages/types/src"],
      "@gafus/core/*": ["../../packages/core/src/*"]
    }
  }
}
```

### Типы навигации

```typescript
// src/types/navigation.ts
export type RootStackParamList = {
  "(auth)": undefined;
  "(main)": undefined;
};

export type AuthStackParamList = {
  login: undefined;
  register: undefined;
  "reset-password": undefined;
};

export type MainTabsParamList = {
  index: undefined;
  achievements: undefined;
  profile: undefined;
};

export type TrainingStackParamList = {
  "[courseType]": { courseType: string };
  "[courseType]/[dayId]": { courseType: string; dayId: string };
};
```

### Типы API ответов

```typescript
// Используем типы из @gafus/types напрямую
import type {
  ApiResponse,
  User,
  Course,
  TrainingDay,
  UserStep,
  Pet,
  ExamResult,
} from "@gafus/types";

// Для специфичных mobile типов создаём расширения
interface MobileUserStep extends UserStep {
  // Дополнительные поля для mobile
  localProgress?: number;
  offlineSynced?: boolean;
}
```

---

## State Management

### Структура stores

Stores полностью повторяют логику из web с адаптацией хранилища:

```typescript
// src/shared/stores/index.ts
export { useAuthStore } from "./authStore";
export { useTrainingStore } from "./trainingStore";
export { useStepStore } from "./stepStore";
export { useTimerStore } from "./timerStore";
export { useOfflineStore } from "./offlineStore";
export { useCourseStore } from "./courseStore";
export { usePetsStore } from "./petsStore";
```

### Пример: Training Store

```typescript
// src/shared/stores/trainingStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { mmkvStorage } from "./storage";
import type { TrainingStoreState } from "@gafus/types";

// Интерфейс ИДЕНТИЧЕН web версии
interface TrainingStore extends TrainingStoreState {
  // Геттеры
  getOpenIndex: (courseId: string, dayOnCourseId: string) => number | null;
  getRunningIndex: (courseId: string, dayOnCourseId: string) => number | null;

  // Сеттеры
  setOpenIndex: (courseId: string, dayOnCourseId: string, index: number | null) => void;
  setRunningIndex: (courseId: string, dayOnCourseId: string, index: number | null) => void;

  // Кэширование
  getCachedTrainingDays: (courseType: string) => { data: unknown; isExpired: boolean };
  setCachedTrainingDays: (courseType: string, data: unknown) => void;
  clearCachedTrainingDays: (courseType?: string) => void;
}

export const useTrainingStore = create<TrainingStore>()(
  persist(
    (set, get) => ({
      // Начальное состояние
      openIndexes: {},
      runningSteps: {},
      cachedTrainingDays: {},

      // Утилиты
      getDayKey: (courseId, dayOnCourseId) => `${courseId}-${dayOnCourseId}`,

      // Геттеры (ЛОГИКА ИДЕНТИЧНА WEB)
      getOpenIndex: (courseId, dayOnCourseId) => {
        const dayKey = `${courseId}-${dayOnCourseId}`;
        return get().openIndexes[dayKey] ?? null;
      },

      getRunningIndex: (courseId, dayOnCourseId) => {
        const dayKey = `${courseId}-${dayOnCourseId}`;
        return get().runningSteps[dayKey] ?? null;
      },

      // Сеттеры (ЛОГИКА ИДЕНТИЧНА WEB)
      setOpenIndex: (courseId, dayOnCourseId, index) => {
        const dayKey = `${courseId}-${dayOnCourseId}`;
        set((state) => ({
          openIndexes: { ...state.openIndexes, [dayKey]: index },
        }));
      },

      setRunningIndex: (courseId, dayOnCourseId, index) => {
        const dayKey = `${courseId}-${dayOnCourseId}`;
        set((state) => ({
          runningSteps: { ...state.runningSteps, [dayKey]: index },
        }));
      },

      // Кэширование (ЛОГИКА ИДЕНТИЧНА WEB)
      getCachedTrainingDays: (courseType) => {
        const cached = get().cachedTrainingDays[courseType];
        if (!cached) return { data: null, isExpired: true };

        const CACHE_DURATION = 2 * 60 * 1000;
        const isExpired = Date.now() - cached.timestamp > CACHE_DURATION;
        return { data: cached.data, isExpired };
      },

      setCachedTrainingDays: (courseType, data) => {
        set((state) => ({
          cachedTrainingDays: {
            ...state.cachedTrainingDays,
            [courseType]: { data, timestamp: Date.now() },
          },
        }));
      },

      clearCachedTrainingDays: (courseType) => {
        if (courseType) {
          set((state) => {
            const newCached = { ...state.cachedTrainingDays };
            delete newCached[courseType];
            return { cachedTrainingDays: newCached };
          });
        } else {
          set({ cachedTrainingDays: {} });
        }
      },
    }),
    {
      name: "training-storage",
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        openIndexes: state.openIndexes,
        runningSteps: state.runningSteps,
        cachedTrainingDays: state.cachedTrainingDays,
      }),
    },
  ),
);
```

### MMKV Storage Adapter

```typescript
// src/shared/stores/storage.ts
import { MMKV } from "react-native-mmkv";
import type { StateStorage } from "zustand/middleware";

const storage = new MMKV();

export const mmkvStorage: StateStorage = {
  getItem: (name) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  setItem: (name, value) => {
    storage.set(name, value);
  },
  removeItem: (name) => {
    storage.delete(name);
  },
};
```

---

## Навигация

### Expo Router (рекомендуется)

Expo Router — file-based routing, похожий на Next.js App Router.

```typescript
// app/_layout.tsx
import { Stack } from "expo-router";
import { QueryProvider } from "@/shared/providers/QueryProvider";
import { AuthProvider } from "@/shared/providers/AuthProvider";

export default function RootLayout() {
  return (
    <QueryProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(main)" />
        </Stack>
      </AuthProvider>
    </QueryProvider>
  );
}
```

```typescript
// app/(main)/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#6200ee" }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Курсы",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="book-open" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="achievements"
        options={{
          title: "Достижения",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="trophy" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Профиль",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
```

### Навигация к тренировке

```typescript
// app/(main)/training/[courseType]/index.tsx
import { useLocalSearchParams } from "expo-router";
import { TrainingDayList } from "@/features/training/components/TrainingDayList";

export default function CourseScreen() {
  const { courseType } = useLocalSearchParams<{ courseType: string }>();

  return <TrainingDayList courseType={courseType} />;
}
```

```typescript
// app/(main)/training/[courseType]/[dayId].tsx
import { useLocalSearchParams } from "expo-router";
import { TrainingDayScreen } from "@/features/training/components/TrainingDayScreen";

export default function DayScreen() {
  const { courseType, dayId } = useLocalSearchParams<{
    courseType: string;
    dayId: string;
  }>();

  return <TrainingDayScreen courseType={courseType} dayId={dayId} />;
}
```

---

## UI компоненты

### Библиотека компонентов: React Native Paper

React Native Paper реализует Material Design и наиболее близок к MUI из web.

```bash
npx expo install react-native-paper react-native-safe-area-context
```

### Пример: Карточка курса

**Web версия (`CourseCard.tsx`):**

```tsx
<div className={styles.card}>
  <Image src={course.logoImg} alt={course.name} />
  <h3>{course.name}</h3>
  <p>{course.shortDesc}</p>
</div>
```

**Mobile версия:**

```tsx
// src/features/courses/components/CourseCard.tsx
import { View, StyleSheet } from "react-native";
import { Card, Title, Paragraph, Chip } from "react-native-paper";
import { Image } from "expo-image";
import { Link } from "expo-router";
import type { Course } from "@gafus/types";

interface CourseCardProps {
  course: Course;
}

export function CourseCard({ course }: CourseCardProps) {
  return (
    <Link href={`/training/${course.type}`} asChild>
      <Card style={styles.card} mode="elevated">
        <Card.Cover source={{ uri: course.logoImg }} style={styles.cover} />
        <Card.Content>
          <Title numberOfLines={2}>{course.name}</Title>
          <Paragraph numberOfLines={3}>{course.shortDesc}</Paragraph>
          <View style={styles.chips}>
            <Chip icon="clock">{course.duration}</Chip>
            <Chip icon="signal">{course.trainingLevel}</Chip>
          </View>
        </Card.Content>
      </Card>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    borderRadius: 12,
  },
  cover: {
    height: 160,
  },
  chips: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
});
```

### Пример: Список дней тренировок

```tsx
// src/features/training/components/TrainingDayList.tsx
import { View, FlatList, StyleSheet } from "react-native";
import { List, Badge, ActivityIndicator, Text } from "react-native-paper";
import { Link } from "expo-router";
import { useTrainingDays } from "@/shared/hooks/useTrainingDays";
import { useStepStore } from "@/shared/stores/stepStore";
import { calculateDayStatus } from "@gafus/core/utils/training";

interface TrainingDayListProps {
  courseType: string;
}

export function TrainingDayList({ courseType }: TrainingDayListProps) {
  const { data, isLoading, error, refetch } = useTrainingDays(courseType);
  const { stepStates } = useStepStore();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !data?.success) {
    return (
      <View style={styles.center}>
        <Text>Ошибка загрузки</Text>
      </View>
    );
  }

  const renderItem = ({ item, index }: { item: TrainingDay; index: number }) => {
    const localStatus = calculateDayStatus(item.courseId, item.dayOnCourseId, stepStates);
    const isCompleted = localStatus === "COMPLETED" || item.userStatus === "COMPLETED";
    const isInProgress = localStatus === "IN_PROGRESS" || item.userStatus === "IN_PROGRESS";

    return (
      <Link href={`/training/${courseType}/${item.trainingDayId}`} asChild>
        <List.Item
          title={item.title}
          description={`День ${index + 1}`}
          left={(props) => (
            <List.Icon
              {...props}
              icon={isCompleted ? "check-circle" : isInProgress ? "play-circle" : "circle-outline"}
              color={isCompleted ? "#4CAF50" : isInProgress ? "#2196F3" : "#9E9E9E"}
            />
          )}
          right={() =>
            item.estimatedDuration ? (
              <Badge style={styles.badge}>{item.estimatedDuration} мин</Badge>
            ) : null
          }
          style={[styles.item, isCompleted && styles.completed, isInProgress && styles.inProgress]}
        />
      </Link>
    );
  };

  return (
    <FlatList
      data={data.data.trainingDays}
      renderItem={renderItem}
      keyExtractor={(item) => item.dayOnCourseId}
      refreshing={isLoading}
      onRefresh={refetch}
      contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    padding: 16,
  },
  item: {
    backgroundColor: "#fff",
    marginBottom: 8,
    borderRadius: 8,
  },
  completed: {
    backgroundColor: "#E8F5E9",
  },
  inProgress: {
    backgroundColor: "#E3F2FD",
  },
  badge: {
    alignSelf: "center",
  },
});
```

### Haptic Feedback

```typescript
// src/shared/lib/utils/haptics.ts
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export const hapticFeedback = {
  // Лёгкий feedback (нажатие кнопки)
  light: async () => {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  },

  // Средний feedback (старт таймера)
  medium: async () => {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  },

  // Успех (завершение шага)
  success: async () => {
    if (Platform.OS !== "web") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  },

  // Ошибка
  error: async () => {
    if (Platform.OS !== "web") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  },

  // Предупреждение
  warning: async () => {
    if (Platform.OS !== "web") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  },
};
```

---

## Офлайн режим

Реализован без WatermelonDB: данные курса хранятся в `meta.json` (с `schemaVersion: 1`), медиа — в файловой системе (expo-file-system). Прогресс шагов — в stepStore; при офлайне мутации (startStep, pause, resume, complete) попадают в очередь и отправляются при появлении сети.

### Архитектура офлайн хранения

- **Zustand + persist (AsyncStorage):** `offlineStore` (очередь скачивания, список скачанных курсов), `progressSyncStore` (очередь мутаций прогресса).
- **Файловая система (expo-file-system):** директория `offline/<courseType>/`: `meta.json`, `videos/<videoId>/` (HLS: manifest + сегменты), `images/`, `pdfs/`.
- **meta.json:** версия курса, структура дней и шагов (из API `GET /offline/course/download`); при несовпадении `schemaVersion` данные не используются.

### Ключевые модули

- `shared/lib/api/offline.ts` — `offlineApi.getVersion`, `checkUpdates`, `downloadCourse`.
- `shared/lib/offline/offlineStorage.ts` — сохранение/чтение meta, список офлайн-курсов, удаление курса, `getOfflineVideoUri`.
- `shared/lib/offline/downloadHLSForOffline.ts` — загрузка HLS (signed URL → манифест и сегменты, перезапись манифеста на локальные пути).
- `shared/lib/offline/downloadCourseForOffline.ts` — проверка места на диске, вызов API, сохранение meta, загрузка CDN-видео (HLS), изображений и PDF; при ошибке — откат (`deleteCourseData`); retry при сетевых ошибках.
- `shared/lib/offline/mapOfflineMetaToTraining.ts` — маппинг meta в ответы `TrainingDaysResponse` / `TrainingDayResponse` с учётом stepStore.
- `shared/stores/offlineStore.ts` — очередь скачивания, прогресс, отмена (AbortController).
- `shared/stores/progressSyncStore.ts` — очередь мутаций (startStep, pauseStep, resumeStep, completeTheoryStep, completePracticeStep); при 401 три раза подряд — уведомление и остановка.

### Синхронизация прогресса при появлении сети

- В хуках `useStartStep`, `usePauseStep`, `useResumeStep`, `useCompleteTheoryStep`, `useCompletePracticeStep` при `isOffline` действие добавляется в `progressSyncStore` и возвращается успех (UI уже обновлён через onMutate).
- Хук `useSyncProgressOnReconnect` (подключён в root layout) при переходе из офлайна в онлайн обрабатывает очередь по одному запросу; при трёх подряд 401 показывает Alert и прекращает повтор.

### Определение офлайна

- **Источник:** `@react-native-community/netinfo` (NetInfo).
- **Текущая логика:** `isOffline = state.isConnected === false`. При первом монтировании вызывается `NetInfo.fetch()`, подписка через `NetInfo.addEventListener`.
- **Где используется:** `OfflineIndicator` (баннер «Нет подключения»), `useTrainingDay` / шаги тренировки (очередь мутаций), `useSyncProgressOnReconnect`, `downloadCourseForOffline` (retry при сетевых ошибках).
- **Рекомендации (best practices):**
  - Не считать офлайном только по одному неудачному запросу — возможны 404/503 при работающей сети; полагаться на NetInfo.
  - Опционально: учитывать `isInternetReachable` (Wi‑Fi без интернета) — при `isConnected === true` и `isInternetReachable === false` можно показывать предупреждение «Интернет недоступен» без полного офлайн-режима.
  - Начальное состояние: до первого `fetch()` считаем онлайн (`isOffline: false`), чтобы не мигать баннером при старте.

### Страница «Скачанные курсы» (офлайн)

- **Требование:** экран «Скачанные» показывается **только при офлайне**. В онлайне не отображается в навигации.
- **Реализация:** при попытке открыть контент без сети (вкладки «Курсы» или «Избранное») вместо списка курсов показывается экран «Скачанные курсы». Список строится по `getOfflineCourseTypes()` и `getCourseMeta(courseType)` (название из meta.json). Тап по курсу открывает `/training/[courseType]`. Компонент: `src/features/offline/components/OfflineDownloadedScreen.tsx`; подключён в `(tabs)/index.tsx` и `(tabs)/courses.tsx` при `isOffline === true`.

### Network Status Hook

```typescript
// src/shared/hooks/useNetworkStatus.ts
import { useEffect, useState } from "react";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const [connectionType, setConnectionType] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setIsConnected(state.isConnected);
      setConnectionType(state.type);
    });

    return () => unsubscribe();
  }, []);

  return { isConnected, connectionType, isOffline: isConnected === false };
}
```

---

## Push уведомления

### Настройка Expo Notifications

```typescript
// src/shared/lib/utils/notifications.ts
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { subscriptionsApi } from "@/shared/lib/api/subscriptions";

// Настройка поведения уведомлений
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  // Проверяем, что это реальное устройство
  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return null;
  }

  // Запрашиваем разрешения
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permissions denied");
    return null;
  }

  // Получаем токен
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: "your-expo-project-id", // из app.json
  });

  const token = tokenData.data;

  // Специфичные настройки для Android
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  return token;
}

export async function savePushToken(token: string): Promise<void> {
  // Сохраняем токен на сервере
  // Для Expo Push используем формат Expo Push Token
  await subscriptionsApi.savePushSubscription({
    endpoint: token, // Expo Push Token
    keys: {
      p256dh: "expo", // Маркер для бэкенда
      auth: "expo",
    },
  });
}
```

### Обработка уведомлений

```typescript
// src/shared/providers/NotificationProvider.tsx
import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    // Получение уведомления (когда приложение открыто)
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log("Notification received:", notification);
      }
    );

    // Клик по уведомлению
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;

        // Навигация по URL из уведомления
        if (data?.url) {
          router.push(data.url as string);
        }
      }
    );

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [router]);

  return <>{children}</>;
}
```

### Адаптация Backend для Expo Push

На backend нужно добавить поддержку Expo Push Token:

```typescript
// Пример серверной логики (не для mobile app)
import Expo from "expo-server-sdk";

const expo = new Expo();

async function sendPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
  url?: string,
) {
  if (!Expo.isExpoPushToken(expoPushToken)) {
    throw new Error("Invalid Expo Push Token");
  }

  await expo.sendPushNotificationsAsync([
    {
      to: expoPushToken,
      title,
      body,
      data: { url },
      sound: "default",
    },
  ]);
}
```

---

## Медиа

### Видео плеер

```typescript
// src/shared/components/VideoPlayer.tsx
import { useRef, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { IconButton, ActivityIndicator } from "react-native-paper";
import * as ScreenOrientation from "expo-screen-orientation";

interface VideoPlayerProps {
  uri: string;
  poster?: string;
  onComplete?: () => void;
}

export function VideoPlayer({ uri, poster, onComplete }: VideoPlayerProps) {
  const videoRef = useRef<Video>(null);
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isPlaying = status?.isLoaded && status.isPlaying;
  const isBuffering = status?.isLoaded && status.isBuffering;

  const togglePlay = async () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  };

  const toggleFullscreen = async () => {
    if (isFullscreen) {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      setIsFullscreen(false);
    } else {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      setIsFullscreen(true);
    }
  };

  const handlePlaybackStatusUpdate = (newStatus: AVPlaybackStatus) => {
    setStatus(newStatus);

    if (newStatus.isLoaded && newStatus.didJustFinish) {
      onComplete?.();
    }
  };

  return (
    <View style={[styles.container, isFullscreen && styles.fullscreen]}>
      <Video
        ref={videoRef}
        source={{ uri }}
        posterSource={poster ? { uri: poster } : undefined}
        usePoster={!!poster}
        resizeMode={ResizeMode.CONTAIN}
        style={styles.video}
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
      />

      <Pressable style={styles.controls} onPress={togglePlay}>
        {isBuffering && <ActivityIndicator size="large" color="#fff" />}
        {!isBuffering && (
          <IconButton
            icon={isPlaying ? "pause" : "play"}
            iconColor="#fff"
            size={48}
          />
        )}
      </Pressable>

      <View style={styles.bottomControls}>
        <IconButton
          icon={isFullscreen ? "fullscreen-exit" : "fullscreen"}
          iconColor="#fff"
          onPress={toggleFullscreen}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderRadius: 8,
    overflow: "hidden",
  },
  fullscreen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  video: {
    flex: 1,
  },
  controls: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  bottomControls: {
    position: "absolute",
    bottom: 0,
    right: 0,
    flexDirection: "row",
  },
});
```

### Офлайн видео

```typescript
// src/shared/lib/offline/video.ts
import * as FileSystem from "expo-file-system";

const VIDEO_DIR = `${FileSystem.documentDirectory}videos/`;

export async function getVideoUri(serverUrl: string, isOffline: boolean): Promise<string> {
  if (!isOffline) {
    return serverUrl;
  }

  // Проверяем наличие локального файла
  const filename = getVideoFilename(serverUrl);
  const localPath = `${VIDEO_DIR}${filename}`;

  const fileInfo = await FileSystem.getInfoAsync(localPath);

  if (fileInfo.exists) {
    return localPath;
  }

  // Если файла нет, возвращаем серверный URL (потребуется интернет)
  return serverUrl;
}

export async function downloadVideo(serverUrl: string): Promise<string> {
  const filename = getVideoFilename(serverUrl);
  const localPath = `${VIDEO_DIR}${filename}`;

  // Создаём директорию если не существует
  await FileSystem.makeDirectoryAsync(VIDEO_DIR, { intermediates: true });

  // Скачиваем
  const downloadResult = await FileSystem.downloadAsync(serverUrl, localPath);

  if (downloadResult.status !== 200) {
    throw new Error(`Failed to download video: ${downloadResult.status}`);
  }

  return localPath;
}

function getVideoFilename(url: string): string {
  const urlObj = new URL(url);
  return urlObj.pathname.split("/").pop() || "video.mp4";
}
```

### Изображения

```typescript
// src/shared/components/OptimizedImage.tsx
import { Image, ImageProps } from "expo-image";
import { useState } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";

interface OptimizedImageProps extends Omit<ImageProps, "source"> {
  uri: string;
  fallback?: string;
}

export function OptimizedImage({ uri, fallback, style, ...props }: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  return (
    <View style={[styles.container, style]}>
      <Image
        source={{ uri: hasError && fallback ? fallback : uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={200}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        onError={() => setHasError(true)}
        {...props}
      />
      {isLoading && (
        <View style={styles.loader}>
          <ActivityIndicator />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
});
```

---

## Аутентификация

### Auth Store

```typescript
// src/shared/stores/authStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import * as SecureStore from "expo-secure-store";
import type { User } from "@gafus/types";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User) => void;
}

type AuthStore = AuthState & AuthActions;

// Secure Storage для токена (не persist в обычное хранилище)
const secureStorage = {
  getItem: async (name: string) => {
    return await SecureStore.getItemAsync(name);
  },
  setItem: async (name: string, value: string) => {
    await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name: string) => {
    await SecureStore.deleteItemAsync(name);
  },
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: true,
      isAuthenticated: false,

      login: async (username, password) => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/callback/credentials`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });

          if (!response.ok) {
            return false;
          }

          const data = await response.json();

          // Сохраняем токен безопасно
          await SecureStore.setItemAsync("auth_token", data.token);

          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
          });

          return true;
        } catch (error) {
          console.error("Login error:", error);
          return false;
        }
      },

      logout: async () => {
        await SecureStore.deleteItemAsync("auth_token");
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },

      checkAuth: async () => {
        set({ isLoading: true });

        try {
          const token = await SecureStore.getItemAsync("auth_token");

          if (!token) {
            set({ isLoading: false, isAuthenticated: false });
            return;
          }

          // Проверяем токен на сервере
          const response = await fetch(`${API_BASE_URL}/api/v1/user/profile`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (response.ok) {
            const { data } = await response.json();
            set({
              user: data,
              token,
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            // Токен невалиден
            await SecureStore.deleteItemAsync("auth_token");
            set({ isLoading: false, isAuthenticated: false });
          }
        } catch (error) {
          console.error("Auth check error:", error);
          set({ isLoading: false });
        }
      },

      setUser: (user) => set({ user }),
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({ user: state.user }), // Токен НЕ в persist
    },
  ),
);
```

### Auth Provider

```typescript
// src/shared/providers/AuthProvider.tsx
import { useEffect } from "react";
import { useSegments, useRouter } from "expo-router";
import { useAuthStore } from "@/shared/stores/authStore";
import { View, ActivityIndicator, StyleSheet } from "react-native";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!isAuthenticated && !inAuthGroup) {
      // Перенаправляем на логин
      router.replace("/login");
    } else if (isAuthenticated && inAuthGroup) {
      // Перенаправляем на главную
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
```

---

## Безопасность

### Хранение секретов

```typescript
// ПРАВИЛЬНО: Secure Store для токенов
import * as SecureStore from "expo-secure-store";

await SecureStore.setItemAsync("auth_token", token);
const token = await SecureStore.getItemAsync("auth_token");

// НЕПРАВИЛЬНО: AsyncStorage/MMKV для токенов
// import { MMKV } from "react-native-mmkv";
// storage.set("auth_token", token); // НЕ безопасно!
```

### Certificate Pinning (опционально)

```typescript
// app.json
{
  "expo": {
    "plugins": [
      [
        "expo-build-properties",
        {
          "android": {
            "networkSecurityConfig": "./network-security-config.xml"
          }
        }
      ]
    ]
  }
}
```

### Валидация ввода

```typescript
// Используем те же Zod схемы что и в web
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
});

// В компоненте
const handleLogin = async (data: unknown) => {
  const result = loginSchema.safeParse(data);

  if (!result.success) {
    // Показываем ошибки валидации
    return;
  }

  await login(result.data.username, result.data.password);
};
```

### Обфускация (production)

```javascript
// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Включаем minification
config.transformer.minifierConfig = {
  keep_classnames: false,
  keep_fnames: false,
  mangle: {
    keep_classnames: false,
    keep_fnames: false,
  },
};

module.exports = config;
```

---

## Тестирование

### Unit тесты

```typescript
// __tests__/stores/trainingStore.test.ts
import { renderHook, act } from "@testing-library/react-hooks";
import { useTrainingStore } from "@/shared/stores/trainingStore";

describe("trainingStore", () => {
  beforeEach(() => {
    useTrainingStore.getState().clearCachedTrainingDays();
  });

  it("should set and get open index", () => {
    const { result } = renderHook(() => useTrainingStore());

    act(() => {
      result.current.setOpenIndex("course-1", "day-1", 5);
    });

    expect(result.current.getOpenIndex("course-1", "day-1")).toBe(5);
  });

  it("should cache training days", () => {
    const { result } = renderHook(() => useTrainingStore());
    const mockData = { trainingDays: [], courseId: "1" };

    act(() => {
      result.current.setCachedTrainingDays("personal", mockData);
    });

    const cached = result.current.getCachedTrainingDays("personal");
    expect(cached.data).toEqual(mockData);
    expect(cached.isExpired).toBe(false);
  });
});
```

### Component тесты

```typescript
// __tests__/components/CourseCard.test.tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import { CourseCard } from "@/features/courses/components/CourseCard";

const mockCourse = {
  id: "1",
  name: "Базовый курс",
  shortDesc: "Описание курса",
  logoImg: "https://example.com/logo.jpg",
  type: "personal",
  duration: "4 недели",
  trainingLevel: "BEGINNER",
};

describe("CourseCard", () => {
  it("renders course information", () => {
    render(<CourseCard course={mockCourse} />);

    expect(screen.getByText("Базовый курс")).toBeTruthy();
    expect(screen.getByText("Описание курса")).toBeTruthy();
  });
});
```

### E2E тесты (Detox)

```typescript
// e2e/login.test.ts
describe("Login Flow", () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  it("should login successfully with valid credentials", async () => {
    await element(by.id("username-input")).typeText("testuser");
    await element(by.id("password-input")).typeText("password123");
    await element(by.id("login-button")).tap();

    await expect(element(by.text("Курсы"))).toBeVisible();
  });

  it("should show error with invalid credentials", async () => {
    await element(by.id("username-input")).typeText("wronguser");
    await element(by.id("password-input")).typeText("wrongpass");
    await element(by.id("login-button")).tap();

    await expect(element(by.text("Неверные учётные данные"))).toBeVisible();
  });
});
```

---

## CI/CD и публикация

### EAS Build Configuration

```json
// eas.json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "autoIncrement": true,
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your@email.com",
        "ascAppId": "123456789"
      },
      "android": {
        "serviceAccountKeyPath": "./google-services.json",
        "track": "internal"
      }
    }
  }
}
```

### GitHub Actions

```yaml
# .github/workflows/mobile-build.yml
name: Mobile Build

on:
  push:
    branches: [main]
    paths:
      - "apps/mobile/**"
  pull_request:
    branches: [main]
    paths:
      - "apps/mobile/**"

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/mobile

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install

      - name: Type check
        run: pnpm tsc --noEmit

      - name: Lint
        run: pnpm lint

      - name: Test
        run: pnpm test

      - name: Setup EAS
        uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Build Preview
        if: github.event_name == 'pull_request'
        run: eas build --platform all --profile preview --non-interactive

      - name: Build Production
        if: github.ref == 'refs/heads/main'
        run: eas build --platform all --profile production --non-interactive
```

### Версионирование

```json
// app.json
{
  "expo": {
    "name": "GAFUS",
    "slug": "gafus",
    "version": "1.0.0",
    "runtimeVersion": {
      "policy": "sdkVersion"
    },
    "updates": {
      "url": "https://u.expo.dev/your-project-id"
    },
    "ios": {
      "bundleIdentifier": "ru.gafus.app",
      "buildNumber": "1"
    },
    "android": {
      "package": "ru.gafus.app",
      "versionCode": 1
    }
  }
}
```

---

## Критические нюансы

### 1. Производительность FlatList

```typescript
// ❌ ПЛОХО: Re-render при каждом scroll
<FlatList
  data={items}
  renderItem={({ item }) => <Item data={item} onPress={() => handlePress(item)} />}
/>

// ✅ ХОРОШО: Мемоизация
const MemoizedItem = memo(Item);

const renderItem = useCallback(({ item }) => (
  <MemoizedItem data={item} onPress={handlePress} />
), [handlePress]);

<FlatList
  data={items}
  renderItem={renderItem}
  keyExtractor={(item) => item.id}
  removeClippedSubviews={true}
  maxToRenderPerBatch={10}
  windowSize={5}
/>
```

### 2. Утечки памяти в подписках

```typescript
// ❌ ПЛОХО: Забыли отписаться
useEffect(() => {
  const subscription = someEmitter.addListener("event", handler);
  // Нет cleanup!
}, []);

// ✅ ХОРОШО: Cleanup
useEffect(() => {
  const subscription = someEmitter.addListener("event", handler);
  return () => subscription.remove();
}, []);
```

### 3. Обработка состояния приложения

```typescript
// Важно для синхронизации и таймеров
import { AppState, AppStateStatus } from "react-native";

useEffect(() => {
  const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
    if (nextState === "active") {
      // Приложение снова активно - синхронизируем данные
      syncProgress();
    } else if (nextState === "background") {
      // Сохраняем состояние перед уходом в фон
      saveCurrentState();
    }
  });

  return () => subscription.remove();
}, []);
```

### 4. Deep Linking

```typescript
// app.json
{
  "expo": {
    "scheme": "gafus",
    "ios": {
      "associatedDomains": ["applinks:gafus.ru"]
    },
    "android": {
      "intentFilters": [
        {
          "action": "VIEW",
          "data": [{ "scheme": "https", "host": "gafus.ru", "pathPrefix": "/training" }],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

### 5. Различия платформ

```typescript
import { Platform } from "react-native";

const styles = StyleSheet.create({
  container: {
    paddingTop: Platform.select({
      ios: 44, // Notch
      android: 0,
    }),
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
      },
      android: {
        elevation: 4,
      },
    }),
  },
});
```

### 6. Обработка ошибок сети

```typescript
// Централизованная обработка
export async function apiClient<T>(
  endpoint: string,
  options?: ApiClientOptions,
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(url, config);
    // ...
  } catch (error) {
    // Проверяем тип ошибки
    if (error instanceof TypeError && error.message === "Network request failed") {
      // Сетевая ошибка - добавляем в очередь для офлайн синхронизации
      if (options?.method !== "GET") {
        await addToSyncQueue(endpoint, options);
      }
      return { success: false, error: "Нет подключения к интернету", code: "NETWORK_ERROR" };
    }
    throw error;
  }
}
```

### 7. Таймеры в фоне

```typescript
// iOS: Background Tasks для коротких задач
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";

TaskManager.defineTask("SYNC_PROGRESS", async () => {
  await syncProgress();
  return BackgroundFetch.BackgroundFetchResult.NewData;
});

// Регистрация
await BackgroundFetch.registerTaskAsync("SYNC_PROGRESS", {
  minimumInterval: 15 * 60, // 15 минут
  stopOnTerminate: false,
  startOnBoot: true,
});
```

---

## Чеклист готовности

### Перед разработкой

- [ ] Expo SDK 52+ установлен
- [ ] EAS CLI настроен
- [ ] Доступы к App Store Connect / Google Play Console
- [ ] Push сертификаты (iOS) / Firebase Cloud Messaging (Android)
- [ ] Backend API v1 развёрнут и доступен

### Функционал (MVP)

- [ ] **Auth**
  - [ ] Логин
  - [ ] Регистрация
  - [ ] Сброс пароля
  - [ ] Persistent session

- [ ] **Курсы**
  - [ ] Список курсов
  - [ ] Фильтрация
  - [ ] Детали курса
  - [ ] Избранное

- [ ] **Тренировки**
  - [ ] Список дней
  - [ ] Шаги с контентом
  - [ ] Таймер
  - [ ] Пауза/возобновление
  - [ ] Завершение шагов
  - [ ] Видео плеер
  - [ ] PDF просмотр

- [ ] **Профиль**
  - [ ] Просмотр/редактирование
  - [ ] Аватар
  - [ ] Питомцы (CRUD)

- [ ] **Достижения**
  - [ ] Календарь тренировок
  - [ ] Статистика

- [ ] **Офлайн**
  - [ ] Скачивание курса
  - [ ] Работа без интернета
  - [ ] Синхронизация прогресса

- [ ] **Push уведомления**
  - [ ] Регистрация токена
  - [ ] Получение уведомлений
  - [ ] Deep links из уведомлений

### Качество

- [ ] Unit тесты > 70% coverage
- [ ] E2E тесты критических путей
- [ ] Performance профилирование
- [ ] Memory leak проверка
- [ ] Accessibility (a11y)

### Публикация

- [ ] App Store (iOS) метаданные
- [ ] Google Play метаданные
- [ ] Скриншоты для всех размеров
- [ ] Privacy Policy URL
- [ ] Terms of Service URL

---

## Ссылки

### Официальная документация

- [Expo Documentation](https://docs.expo.dev/)
- [React Native](https://reactnative.dev/)
- [React Navigation](https://reactnavigation.org/)
- [React Native Paper](https://callstack.github.io/react-native-paper/)
- [Zustand](https://zustand-demo.pmnd.rs/)
- [TanStack Query](https://tanstack.com/query)

### Внутренняя документация

- [API Routes v1](../api/v1-routes.md)
- [@gafus/types](../packages/types.md)
- [Web приложение](./web.md)

---

**Версия документа:** 1.0.0  
**Автор:** GAFUS Team  
**Дата:** 19 января 2026
