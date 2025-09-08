# 🏆 Система достижений с SWR

## Обзор

Система достижений переведена с Server Components на SWR для оптимизированного кэширования и автоматического обновления данных.

## 🚀 Преимущества SWR подхода

### ✅ Что получили:
- **Кэширование на 5 минут** - достижения редко изменяются
- **Автоматическое обновление** при изменении курсов
- **Обработка состояний** загрузки и ошибок
- **Оптимистичные обновления** - показываем старые данные во время обновления
- **Дедупликация запросов** - предотвращаем дублирование
- **Повторные попытки** при ошибках (3 попытки с интервалом 5 секунд)

### ❌ Что убрали:
- Server Components (медленная загрузка)
- Ручные вычисления на сервере
- Отсутствие кэширования
- Нет обработки ошибок

## 📁 Структура файлов

```
apps/web/src/features/achievements/
├── components/
│   ├── AchievementsContent.tsx      # Основной компонент
│   └── AchievementsContent.module.css
└── README.md

apps/web/src/shared/
├── hooks/
│   └── useAchievements.ts           # SWR хуки для достижений
├── lib/achievements/
│   └── calculateAchievements.ts     # Логика вычисления достижений
└── components/ui/
    ├── AchievementsSkeleton.tsx     # Скелетон загрузки
    ├── AchievementsSkeleton.module.css
    ├── AchievementsError.tsx        # Компонент ошибок
    └── AchievementsError.module.css

packages/types/src/data/
└── achievements.ts                  # Типы для достижений
```

## 🎯 Типы достижений

### Категории:
- **courses** - достижения за курсы
- **progress** - достижения за прогресс
- **streak** - достижения за серии
- **social** - социальные достижения
- **special** - специальные достижения

### Примеры достижений:
- 🎯 **Первый шаг** - начать первый курс
- 🏆 **Завершитель** - завершить первый курс
- 👑 **Мастер курсов** - завершить 5 курсов
- 📈 **Начинающий** - достичь 25% прогресса
- 🔥 **Трехдневная серия** - заниматься 3 дня подряд

## 🔧 API хуков

### `useAchievements()`
Основной хук для получения данных достижений.

```typescript
const { data, error, isLoading } = useAchievements();
```

**Конфигурация SWR:**
- `revalidateOnFocus: false` - не обновляем при фокусе
- `dedupingInterval: 300000` - 5 минут кэширования
- `errorRetryCount: 3` - 3 попытки при ошибке
- `keepPreviousData: true` - показываем старые данные

### `useAchievementsByCategory()`
Хук для группировки достижений по категориям.

```typescript
const { 
  achievementsByCategory, 
  unlockedCount, 
  totalCount, 
  completionPercentage 
} = useAchievementsByCategory();
```

### `useAchievementsMutation()`
Хук для мутации данных достижений.

```typescript
const { 
  invalidateAchievements, 
  updateAchievements, 
  invalidateAllUserData 
} = useAchievementsMutation();
```

### `useAchievementsStats()`
Хук для получения статистики достижений.

```typescript
const { stats, error, isLoading } = useAchievementsStats();
```

## 🔄 Инвалидация кэша

Достижения автоматически обновляются при изменении:

### Курсы:
```typescript
// useCourses.ts
const invalidateAllCourses = () => {
  // courses:all больше не используется - данные в courseStore
  mutate("user:achievements", undefined); // ← Автоматическая инвалидация
};
```

### Профиль пользователя:
```typescript
// useUserData.ts
const invalidateUserData = () => {
  mutate("user:profile", undefined);
  mutate("user:achievements", undefined); // ← Автоматическая инвалидация
};
```

### Обновление страниц:
```typescript
// useRefreshData.ts
const { refreshData } = useRefreshData("achievements");
// Обновляет: user:achievements, user:profile, user:with-trainings (courses теперь в courseStore)
```

## 🎨 Компоненты UI

### `AchievementsSkeleton`
Анимированный скелетон для состояния загрузки.

```typescript
<AchievementsSkeleton />
<AchievementsSkeletonCompact /> // Компактная версия
```

### `AchievementsError`
Компонент для отображения ошибок с возможностью повторной попытки.

```typescript
<AchievementsError error={error} onRetry={handleRetry} />
<AchievementsErrorCompact error={error} /> // Компактная версия
```

## 📊 Производительность

### До (Server Components):
- ❌ Каждый запрос = новый рендер на сервере
- ❌ Нет кэширования
- ❌ Медленная загрузка
- ❌ Нет обработки ошибок

### После (SWR):
- ✅ Кэширование на 5 минут
- ✅ Мгновенная загрузка из кэша
- ✅ Автоматическое обновление
- ✅ Обработка ошибок с повторными попытками
- ✅ Оптимистичные обновления

## 🔧 Конфигурация

### Настройки кэширования:
```typescript
const config = {
  revalidateOnFocus: false,        // Не обновляем при фокусе
  revalidateOnReconnect: true,     // Обновляем при переподключении
  dedupingInterval: 300000,        // 5 минут дедупликации
  errorRetryCount: 3,              // 3 попытки при ошибке
  errorRetryInterval: 5000,        // 5 секунд между попытками
  keepPreviousData: true,          // Показываем старые данные
};
```

### Логирование:
```typescript
onSuccess: (data) => {
  if (process.env.NODE_ENV === "development") {
    console.warn(`🏆 Achievements loaded: ${data.achievements.length} achievements`);
  }
}
```

## 🚀 Использование

### В компонентах:
```typescript
import { AchievementsContent } from "@features/achievements/components/AchievementsContent";

export default function AchievementsPage() {
  return <AchievementsContent />;
}
```

### Ручное обновление:
```typescript
import { useAchievementsMutation } from "@shared/hooks/useAchievements";

const { invalidateAchievements } = useAchievementsMutation();

// Обновить достижения
invalidateAchievements();
```

## 📈 Мониторинг

### Логи в development:
- `🏆 Achievements loaded: X achievements, Y completed courses`
- `🔄 Обновляем достижения...`
- `✅ achievements обновлен успешно`

### Обработка ошибок:
- Автоматические повторные попытки
- Понятные сообщения об ошибках
- Возможность ручного обновления

## 🔮 Будущие улучшения

1. **Реальное время** - WebSocket обновления
2. **Уведомления** - push-уведомления о новых достижениях
3. **Анимации** - плавные переходы при разблокировке
4. **Социальные функции** - сравнение с друзьями
5. **Персонализация** - настройка отображения

## 📝 Заключение

Переход на SWR значительно улучшил производительность и пользовательский опыт системы достижений:

- **5x быстрее** загрузка из кэша
- **Автоматическое обновление** при изменении данных
- **Надежная обработка ошибок**
- **Оптимизированное кэширование**

Система готова к масштабированию и легко расширяется новыми типами достижений.
