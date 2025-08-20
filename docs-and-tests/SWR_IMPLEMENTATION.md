# Внедрение SWR в проект Gafus

## Обзор

Мы внедрили SWR (Stale-While-Revalidate) для оптимизации запросов и кэширования данных во всех приложениях проекта. SWR предоставляет:

- **Автоматическое кэширование** - данные кэшируются и переиспользуются
- **Фоновая ревалидация** - данные обновляются в фоне
- **Оптимистичные обновления** - мгновенный UI отклик
- **Дебаунсинг** - для поисковых запросов
- **Бесконечная прокрутка** - для больших списков

## Архитектура

### Пакет `@gafus/swr`

Общий пакет для всех приложений с конфигурацией и хуками:

```
packages/swr/
├── src/
│   ├── index.ts              # Основные экспорты
│   ├── providers/
│   │   └── SWRProvider.tsx   # Провайдер конфигурации
│   └── hooks/
│       └── useData.ts        # Специализированные хуки
```

### Конфигурация по умолчанию

```typescript
export const defaultSWRConfig = {
  revalidateOnFocus: false, // Не ревалидируем при фокусе
  revalidateOnReconnect: true, // Ревалидируем при переподключении
  dedupingInterval: 2000, // Дедупликация запросов
  errorRetryCount: 3, // Количество повторов при ошибке
  errorRetryInterval: 5000, // Интервал повторов
};
```

## Использование в приложениях

### Trainer Panel

#### Провайдер

```typescript
// apps/trainer-panel/src/providers/SWRProvider.tsx
import { SWRProvider } from '@gafus/swr';

export function TrainerPanelSWRProvider({ children }) {
  return <SWRProvider>{children}</SWRProvider>;
}
```

#### Хуки для данных

```typescript
// apps/trainer-panel/src/hooks/useStatistics.ts
import { useData, useMutate } from "@gafus/swr";

export function useCourseStatistics(userId: string, isElevated: boolean) {
  const cacheKey = `statistics:${userId}:${isElevated}`;

  return useData(cacheKey, () => getCourseStatistics(userId, isElevated), {
    revalidateOnFocus: false,
    dedupingInterval: 30000, // 30 секунд
  });
}
```

#### Поиск с дебаунсом

```typescript
// apps/trainer-panel/src/hooks/useUserSearch.ts
import { useSearchData } from "@gafus/swr";

export function useUserSearch(query: string) {
  return useSearchData(
    query,
    (searchQuery: string) => searchUsersByUsername(searchQuery),
    500, // 500ms дебаунс
  );
}
```

### Web App

#### Хуки для курсов

```typescript
// apps/web/src/hooks/useCourses.ts
export function useCourses() {
  return useData(
    "courses:with-progress",
    () => getCoursesWithProgress().then((result) => result.data),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 минута
    },
  );
}
```

#### Хуки для профиля

```typescript
// apps/web/src/hooks/useProfile.ts
export function useUserProfile() {
  return useData("user:profile", getUserProfile, {
    revalidateOnFocus: false,
    dedupingInterval: 300000, // 5 минут
  });
}
```

### Error Dashboard

#### Хуки для ошибок

```typescript
// apps/error-dashboard/src/hooks/useErrors.ts
export function useErrors(filters?: {
  appName?: string;
  environment?: string;
  resolved?: boolean;
}) {
  const cacheKey = `errors:${JSON.stringify(filters)}`;

  return useData(cacheKey, () => getErrors(filters).then((result) => result.errors), {
    revalidateOnFocus: false,
    dedupingInterval: 30000, // 30 секунд
  });
}
```

## Server Actions + useOptimistic

Для мутаций используем Server Actions с оптимистичными обновлениями:

```typescript
// Пример оптимистичного обновления
import { useOptimistic } from "react";
import { useServerAction } from "@gafus/swr";

export function useCreateCourse() {
  const { mutate } = useMutate();

  const { execute, isPending } = useServerAction(createCourse, {
    onSuccess: (data) => {
      // Инвалидируем кэш курсов
      mutate("courses:with-progress");
    },
    onError: (error) => {
      console.error("Ошибка создания курса:", error);
    },
  });

  return { execute, isPending };
}
```

## Ключи кэширования

Используем структурированные ключи для кэширования:

- `statistics:${userId}:${isElevated}` - статистика пользователя
- `courses:with-progress` - курсы с прогрессом
- `user:profile` - профиль пользователя
- `user:with-trainings` - пользователь с тренировками
- `user:pets` - питомцы пользователя
- `errors:${JSON.stringify(filters)}` - ошибки с фильтрами

## Преимущества внедрения

### 1. Производительность

- **Кэширование** - данные не загружаются повторно
- **Фоновая ревалидация** - UI всегда актуален
- **Дедупликация** - избегаем дублирующих запросов

### 2. UX

- **Мгновенный отклик** - данные показываются из кэша
- **Оптимистичные обновления** - UI обновляется сразу
- **Дебаунсинг поиска** - меньше запросов при вводе

### 3. Разработка

- **Единый API** - одинаковые хуки во всех приложениях
- **TypeScript** - полная типизация
- **Автоматическая инвалидация** - кэш обновляется автоматически

## Мониторинг

Для мониторинга производительности кэширования можно добавить:

```typescript
// В SWRProvider
const config = {
  ...defaultSWRConfig,
  onSuccess: (data, key) => {
    console.log(`✅ SWR Cache Hit: ${key}`);
  },
  onError: (error, key) => {
    console.error(`❌ SWR Error: ${key}`, error);
  },
};
```

## Следующие шаги

1. **Метрики** - добавить мониторинг hit/miss ratio
2. **Персистентность** - сохранять кэш в localStorage
3. **Префетчинг** - предзагружать данные для навигации
4. **Офлайн режим** - кэшировать данные для работы офлайн
