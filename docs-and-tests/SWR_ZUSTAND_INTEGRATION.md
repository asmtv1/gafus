# Интеграция SWR с Zustand Store

## 🎯 Цель

Объединить преимущества SWR и Zustand для максимальной производительности и UX:

- **SWR**: Фоновая ревалидация, дедупликация, оптимистичные обновления
- **Zustand**: Персистентность, стабильное состояние, кэширование изображений

## 🏗️ Архитектура

### Гибридный подход:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   SWR Cache     │    │  Zustand Store  │    │   Components    │
│                 │    │                 │    │                 │
│ • Фоновая       │◄──►│ • Персистентность│◄──►│ • UI Components │
│   ревалидация   │    │ • Стабильные     │    │ • Оптимистичные │
│ • Дедупликация  │    │   данные        │    │   обновления    │
│ • Автоматическая│    │ • Кэш изображений│    │ • Состояния     │
│   инвалидация   │    │ • Статистика     │    │   загрузки      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📊 Преимущества интеграции

### 1. **Производительность**

- ✅ **SWR**: Мгновенный отклик из кэша
- ✅ **Zustand**: Персистентность между сессиями
- ✅ **Комбинированный**: Лучшее из двух миров

### 2. **UX**

- ✅ **Фоновая ревалидация**: Данные всегда актуальны
- ✅ **Оптимистичные обновления**: Мгновенный UI отклик
- ✅ **Дедупликация**: Избегаем дублирующих запросов

### 3. **Разработка**

- ✅ **Единый API**: Простые хуки для компонентов
- ✅ **TypeScript**: Полная типизация
- ✅ **Отладка**: Легко отслеживать состояние

## 🔧 Реализация

### Хуки для интеграции:

```typescript
// apps/web/src/hooks/useCourseStoreSWR.ts

// Хук для курсов с интеграцией SWR + Zustand
export function useCoursesWithStore() {
  const store = useCourseStore();
  const { mutate } = useMutate();

  // SWR для загрузки данных
  const {
    data: swrData,
    error,
    isLoading,
  } = useData("courses:all", () => getCoursesWithProgress().then((result) => result.data), {
    revalidateOnFocus: false,
    dedupingInterval: 60000, // 1 минута
  });

  // Получаем данные из Zustand или SWR
  const getData = () => {
    if (swrData) return swrData;
    if (store.allCourses && !store.isStale(store.allCourses)) {
      return store.allCourses.data;
    }
    return [];
  };

  return {
    data: getData(),
    error: error || store.errors.all,
    isLoading: isLoading || store.loading.all,
    invalidateCourses: () => {
      mutate("courses:all");
      store.setAllCourses([], "all");
    },
  };
}
```

### Компоненты с гибридным подходом:

```typescript
// apps/web/src/components/CourseCard/CourseListHybrid.tsx

export default function CourseListHybrid({ title, filter }) {
  const {
    data: courses,
    error,
    isLoading,
    invalidateCourses
  } = useCoursesWithStore();

  if (isLoading) return <CircularProgress />;
  if (error) return <ErrorMessage error={error} />;

  const filteredCourses = filter ? courses.filter(filter) : courses;

  return (
    <Box>
      <Typography variant="h4">{title}</Typography>
      <CourseGrid courses={filteredCourses} />
    </Box>
  );
}
```

## 📈 Конфигурация кэширования

### SWR настройки:

```typescript
// Курсы - 1 минута
dedupingInterval: 60000,
revalidateOnFocus: false

// Избранное - 5 минут
dedupingInterval: 300000,
revalidateOnFocus: false

// Авторские курсы - 5 минут
dedupingInterval: 300000,
revalidateOnFocus: false
```

### Zustand настройки:

```typescript
// Курсы - 10 минут
CACHE_DURATION = 10 * 60 * 1000;

// Изображения - 30 минут
IMAGE_CACHE_DURATION = 30 * 60 * 1000;

// Статистика - 24 часа
STATS_CACHE_DURATION = 24 * 60 * 60 * 1000;
```

## 🚀 Использование

### 1. Замена существующих компонентов:

```typescript
// Было (только Zustand)
import { useCourseStoreActions } from "@/stores/courseStore";

// Стало (SWR + Zustand)
import { useCoursesWithStore } from "@/hooks/useCourseStoreSWR";
```

### 2. Новые возможности:

```typescript
// Оптимистичные обновления
const { data, invalidateCourses } = useCoursesWithStore();

// Мгновенное обновление UI
const handleFavorite = async (courseId) => {
  // Оптимистично обновляем UI
  optimisticUpdate((courses) =>
    courses.map((c) => (c.id === courseId ? { ...c, isFavorite: !c.isFavorite } : c)),
  );

  // Затем обновляем сервер
  await toggleFavorite(courseId);
  invalidateCourses();
};
```

## 📊 Метрики производительности

### Ожидаемые улучшения:

- **Время загрузки**: -70% для повторных запросов
- **Количество запросов**: -80% благодаря кэшированию
- **UX**: Мгновенный отклик для всех операций
- **Персистентность**: Данные сохраняются между сессиями

### Мониторинг:

```typescript
// Добавить в SWR провайдер
const config = {
  onSuccess: (data, key) => {
    console.log(`✅ SWR Cache Hit: ${key}`);
    analytics.track("cache_hit", { key });
  },
  onError: (error, key) => {
    console.error(`❌ SWR Error: ${key}`, error);
    analytics.track("cache_error", { key, error: error.message });
  },
};
```

## 🔄 Миграция

### Поэтапный план:

1. **Этап 1**: Добавить SWR провайдеры
2. **Этап 2**: Создать гибридные хуки
3. **Этап 3**: Обновить компоненты
4. **Этап 4**: Добавить оптимистичные обновления
5. **Этап 5**: Настроить мониторинг

### Обратная совместимость:

- ✅ Существующие Zustand компоненты продолжают работать
- ✅ Постепенная миграция без breaking changes
- ✅ Возможность отката к старой архитектуре

## 🎯 Результат

Интеграция SWR + Zustand дает:

- ✅ **Максимальную производительность**
- ✅ **Отличный UX**
- ✅ **Простоту разработки**
- ✅ **Гибкость архитектуры**

Все преимущества SWR и Zustand в одном решении! 🚀
