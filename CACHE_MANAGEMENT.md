# 🚀 Система кэширования курсов

## Обзор

Реализована многоуровневая система кэширования для оптимизации производительности загрузки курсов:

1. **Постоянное серверное кэширование** - базовый список курсов кэшируется навсегда
2. **Временное серверное кэширование** - курсы с пользовательскими данными кэшируются на 60 секунд
3. **Клиентское кэширование** - данные кэшируются в браузере
4. **Ручная инвалидация** - кэш обновляется при изменении курсов

## Архитектура

### Серверное кэширование (Next.js `unstable_cache`)

#### 1. Базовый список курсов (постоянное кэширование)
```typescript
// apps/web/src/shared/lib/actions/cachedCourses.ts
export const getAllCoursesCached = unstable_cache(
  async () => { /* ... */ },
  ["courses-all-permanent"],
  {
    revalidate: false, // Постоянное кэширование
    tags: ["courses", "courses-all-permanent"],
  }
);
```

**Характеристики:**
- ⏰ **Время жизни:** навсегда (до ручной инвалидации)
- 🏷️ **Теги:** `["courses", "courses-all-permanent"]`
- 🎯 **Назначение:** базовый список всех курсов без пользовательских данных
- 🔄 **Инвалидация:** только вручную при создании/редактировании курсов

#### 2. Курсы с прогрессом пользователя (временное кэширование)
```typescript
export const getCoursesWithProgressCached = unstable_cache(
  async (userId?: string) => { /* ... */ },
  ["courses-all"],
  {
    revalidate: 60, // 60 секунд
    tags: ["courses", "courses-all"],
  }
);
```

**Характеристики:**
- ⏰ **Время жизни:** 60 секунд
- 🏷️ **Теги:** `["courses", "courses-all"]`
- 🎯 **Назначение:** курсы с пользовательскими данными (прогресс, избранное)
- 🔄 **Инвалидация:** автоматически + при изменении курсов

### Клиентское кэширование

#### React Query + Zustand
- **Время жизни:** 1 час для курсов, 15 минут для созданных курсов
- **Офлайн поддержка:** данные сохраняются в localStorage
- **Автоматическая синхронизация:** при восстановлении соединения

## Управление кэшем

### Автоматическая инвалидация

Кэш автоматически инвалидируется при:

1. **Создании курса** (`createCourseServerAction`)
2. **Обновлении курса** (`updateCourseServerAction`) 
3. **Удалении курса** (`deleteCourseServerAction`)

```typescript
// apps/trainer-panel/src/shared/lib/actions/courses.ts
export async function createCourseServerAction(input: CreateCourseInput) {
  // ... создание курса ...
  
  // Инвалидируем кэш курсов при создании нового курса
  await invalidateCoursesCache();
  
  return { success: true, id: course.id };
}
```

### Ручная инвалидация

#### Серверное действие для администраторов
```typescript
// apps/trainer-panel/src/shared/lib/actions/invalidateCacheActions.ts
export async function invalidateCoursesCacheAction(): Promise<InvalidateCacheResult>
```

**Права доступа:** только ADMIN и MODERATOR

**Преимущества серверных действий:**
- 🚀 **Лучшая производительность** - нет дополнительных HTTP запросов
- 🔒 **Встроенная безопасность** - проверка прав на сервере
- 📦 **Меньше кода** - не нужны API endpoints
- ⚡ **Автоматическая оптимизация** - Next.js оптимизирует серверные действия

#### Компонент управления кэшем
```typescript
// apps/trainer-panel/src/features/admin/components/CacheManagement.tsx
<CacheManagement />
```

**Функции:**
- 🔄 Принудительное обновление кэша курсов через серверное действие
- 👥 Доступно только администраторам
- 📊 Отображение статуса операций

#### Страница администрирования
```typescript
// apps/trainer-panel/src/app/(main)/main-panel/admin/page.tsx
/main-panel/admin
```

**Доступ:** через меню "Администрирование" в панели тренера (только для ADMIN и MODERATOR)

### Утилиты инвалидации

```typescript
// apps/web/src/shared/lib/actions/invalidateCoursesCache.ts
// apps/trainer-panel/src/shared/lib/actions/invalidateCoursesCache.ts

// Инвалидирует все кэши курсов
export async function invalidateCoursesCache()

// Инвалидирует только базовый кэш
export async function invalidateBaseCoursesCache()

// apps/trainer-panel/src/shared/lib/actions/invalidateCacheActions.ts

// Серверное действие для инвалидации кэша (с проверкой прав)
export async function invalidateCoursesCacheAction(): Promise<InvalidateCacheResult>
```

## Использование

### В компонентах

```typescript
// Получение базового списка курсов (постоянный кэш)
const { data: allCourses } = useData("courses:all-permanent", () => 
  getAllCoursesCached()
);

// Получение курсов с прогрессом пользователя (временный кэш)
const { data: coursesWithProgress } = useData("courses:all", () => 
  getCoursesWithProgressCached(userId)
);
```

### В серверных действиях

```typescript
// При изменении курсов (автоматическая инвалидация)
await invalidateCoursesCache();

// Ручная инвалидация через серверное действие (с проверкой прав)
const result = await invalidateCoursesCacheAction();
if (result.success) {
  console.log(result.message);
} else {
  console.error(result.error);
}
```

### В клиентских компонентах

```typescript
// Использование серверного действия в компоненте
import { invalidateCoursesCacheAction } from "@shared/lib/actions/invalidateCacheActions";

const handleInvalidateCache = async () => {
  const result = await invalidateCoursesCacheAction();
  if (result.success) {
    setMessage(`✅ ${result.message}`);
  } else {
    setMessage(`❌ Ошибка: ${result.error}`);
  }
};
```

## Преимущества

### 🚀 Производительность
- **Мгновенная загрузка** повторных запросов
- **Минимальная нагрузка на БД** - запросы выполняются реже
- **Быстрый отклик** пользовательского интерфейса

### 🔄 Гибкость
- **Автоматическое обновление** при изменениях
- **Ручное управление** для администраторов
- **Гранулярная инвалидация** по типам данных

### 🌐 Офлайн поддержка
- **Работа без интернета** благодаря клиентскому кэшу
- **Автоматическая синхронизация** при восстановлении связи
- **Надежность** - данные не теряются

## Мониторинг

### Логирование
```typescript
console.warn("[React Cache] Fetching all courses (permanent cache)");
console.warn("[Cache] Invalidating courses cache...");
console.warn("[Cache] Courses cache invalidated successfully");
```

### Отслеживание
- Количество кэшированных курсов
- Время выполнения запросов
- Статус инвалидации кэша

## Рекомендации

### ✅ Что делать
- Используйте постоянный кэш для базовых данных курсов
- Инвалидируйте кэш при любых изменениях курсов
- Мониторьте производительность кэширования

### ❌ Чего избегать
- Не забывайте инвалидировать кэш при изменениях
- Не используйте постоянный кэш для часто изменяющихся данных
- Не полагайтесь только на автоматическую инвалидацию

## Будущие улучшения

1. **Redis кэширование** для масштабирования
2. **CDN интеграция** для статических данных
3. **Метрики производительности** кэширования
4. **Автоматическая оптимизация** времени жизни кэша
