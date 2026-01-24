# @gafus/react-query - Управление состоянием

## 📋 Обзор

Пакет `@gafus/react-query` предоставляет настроенную конфигурацию TanStack Query (React Query) для управления серверным состоянием во всех React приложениях экосистемы GAFUS.

## 🎯 Основные функции

- **Настроенный QueryClient** с оптимальными настройками
- **Общие хуки** для типичных операций
- **Кэширование** и синхронизация данных
- **Обработка ошибок** и загрузочных состояний

## 📦 Использование

### Настройка провайдера

```typescript
import { QueryProvider } from '@gafus/react-query';

function App() {
  return (
    <QueryProvider>
      <MyApp />
    </QueryProvider>
  );
}
```

### Использование хуков

```typescript
import { useQuery, useMutation } from '@gafus/react-query';

function UserProfile({ userId }: { userId: string }) {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId)
  });

  const updateUser = useMutation({
    mutationFn: updateUserData,
    onSuccess: () => {
      // Инвалидация кэша
      queryClient.invalidateQueries(['user', userId]);
    }
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{user.name}</div>;
}
```

## 🔧 API

- `QueryProvider` - Провайдер React Query
- `useQuery` - Хук для получения данных
- `useMutation` - Хук для изменения данных
- `useInfiniteQuery` - Хук для бесконечных списков
- `queryClient` - Клиент для управления кэшем
