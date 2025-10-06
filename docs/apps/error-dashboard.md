# Error Dashboard (@gafus/error-dashboard)

## 📋 Обзор

Error Dashboard - это система мониторинга ошибок и централизованного логирования для всей экосистемы GAFUS. Предоставляет веб-интерфейс для просмотра, анализа и управления ошибками, возникающими во всех приложениях.

## 🎯 Основные функции

### Мониторинг ошибок
- **🔍 Централизованный сбор** ошибок из всех приложений
- **📊 Анализ и группировка** ошибок по типам и частоте
- **🚨 Алертинг** при критических ошибках
- **📈 Статистика** и тренды ошибок

### Управление ошибками
- **✅ Отметка как решенные** ошибки
- **🏷️ Тегирование** ошибок для категоризации
- **👤 Назначение** ошибок разработчикам
- **📝 Комментарии** и заметки по ошибкам

### Аналитика
- **📊 Дашборд** с ключевыми метриками
- **📈 Графики** частоты ошибок
- **🔍 Фильтрация** и поиск ошибок
- **📤 Экспорт** данных для анализа

## 🏗️ Архитектура

### Структура приложения
```
apps/error-dashboard/
├── src/
│   ├── app/                    # App Router страницы
│   │   ├── api/               # API endpoints
│   │   │   ├── auth/          # Аутентификация
│   │   │   ├── csrf-token/    # CSRF токены
│   │   │   ├── debug/         # Отладочные данные
│   │   │   ├── push-logs/     # Push логи
│   │   │   └── report/        # Отчеты об ошибках
│   │   ├── login/             # Страница входа
│   │   ├── push-logs/         # Просмотр push логов
│   │   └── page.tsx           # Главная страница
│   ├── features/              # Функциональные модули
│   │   └── errors/            # Управление ошибками
│   │       └── components/    # Компоненты ошибок
│   ├── shared/                # Общие компоненты
│   │   ├── contexts/          # React контексты
│   │   ├── hooks/             # React хуки
│   │   ├── lib/               # Утилиты и библиотеки
│   │   └── providers/         # Context провайдеры
│   └── middleware.ts          # Middleware для аутентификации
└── public/                    # Статические файлы
```

### API Endpoints
```typescript
// API структура
app/api/
├── auth/
│   └── route.ts              # Аутентификация
├── csrf-token/
│   └── route.ts              # Получение CSRF токена
├── debug/
│   └── route.ts              # Отладочная информация
├── push-logs/
│   └── route.ts              # Push логи
└── report/
    └── route.ts              # Отчеты об ошибках
```

## 🎨 UI и UX

### Основные страницы

#### Dashboard (Главная)
- Общая статистика ошибок
- Топ ошибок по частоте
- Статус всех приложений
- Последние критические ошибки

#### Список ошибок
- Таблица всех ошибок с фильтрацией
- Группировка по типам и приложениям
- Статусы (новые, в работе, решенные)
- Поиск и сортировка

#### Детали ошибки
- Полная информация об ошибке
- Stack trace и контекст
- История изменений статуса
- Комментарии и заметки

### Компоненты интерфейса

#### Фильтры ошибок
```typescript
import { useErrorFilters } from '@/shared/hooks/useErrorFilters';

function ErrorFilters() {
  const { filters, setFilters } = useErrorFilters();

  return (
    <div className="filters">
      <Select
        value={filters.appName}
        onChange={(value) => setFilters({ ...filters, appName: value })}
      >
        <Option value="">Все приложения</Option>
        <Option value="web">Web App</Option>
        <Option value="trainer-panel">Trainer Panel</Option>
        <Option value="telegram-bot">Telegram Bot</Option>
      </Select>

      <Select
        value={filters.environment}
        onChange={(value) => setFilters({ ...filters, environment: value })}
      >
        <Option value="">Все окружения</Option>
        <Option value="development">Development</Option>
        <Option value="production">Production</Option>
      </Select>

      <Select
        value={filters.status}
        onChange={(value) => setFilters({ ...filters, status: value })}
      >
        <Option value="">Все статусы</Option>
        <Option value="unresolved">Не решены</Option>
        <Option value="resolved">Решены</Option>
      </Select>
    </div>
  );
}
```

#### Статистика ошибок
```typescript
function ErrorStats() {
  const { data: stats } = useErrorStats();

  return (
    <div className="stats-grid">
      <StatCard
        title="Всего ошибок"
        value={stats?.totalErrors}
        trend={stats?.errorsTrend}
        icon={<ErrorIcon />}
      />
      <StatCard
        title="Новых сегодня"
        value={stats?.newToday}
        trend={stats?.newTodayTrend}
        icon={<NewIcon />}
      />
      <StatCard
        title="Критических"
        value={stats?.critical}
        trend={stats?.criticalTrend}
        icon={<WarningIcon />}
      />
      <StatCard
        title="Решенных"
        value={stats?.resolved}
        trend={stats?.resolvedTrend}
        icon={<CheckIcon />}
      />
    </div>
  );
}
```

## 🔧 Технические особенности

### Сбор ошибок
```typescript
// API endpoint для получения отчетов об ошибках
// app/api/report/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@gafus/prisma';
import { logger } from '@gafus/logger';

export async function POST(request: NextRequest) {
  try {
    const errorData = await request.json();
    
    // Валидация данных
    const validatedData = validateErrorReport(errorData);
    
    // Сохранение в базу данных
    const errorReport = await prisma.errorReport.create({
      data: {
        message: validatedData.message,
        stack: validatedData.stack,
        appName: validatedData.appName,
        environment: validatedData.environment,
        url: validatedData.url,
        userAgent: validatedData.userAgent,
        userId: validatedData.userId,
        sessionId: validatedData.sessionId,
        componentStack: validatedData.componentStack,
        additionalContext: validatedData.additionalContext,
        tags: validatedData.tags || []
      }
    });

    logger.info('Error report received', {
      errorId: errorReport.id,
      appName: validatedData.appName,
      message: validatedData.message
    });

    return NextResponse.json({ success: true, errorId: errorReport.id });
    
  } catch (error) {
    logger.error('Failed to process error report', { error: error.message });
    return NextResponse.json(
      { success: false, error: 'Failed to process error report' },
      { status: 500 }
    );
  }
}
```

### Фильтрация и поиск
```typescript
// Хук для фильтрации ошибок
export function useErrorFilters() {
  const [filters, setFilters] = useState({
    appName: '',
    environment: '',
    status: 'unresolved',
    dateRange: '7d',
    search: ''
  });

  const { data: errors, isLoading } = useQuery({
    queryKey: ['errors', filters],
    queryFn: () => fetchErrors(filters)
  });

  return {
    filters,
    setFilters,
    errors,
    isLoading
  };
}

// Функция получения ошибок с фильтрацией
async function fetchErrors(filters: ErrorFilters) {
  const params = new URLSearchParams();
  
  if (filters.appName) params.append('appName', filters.appName);
  if (filters.environment) params.append('environment', filters.environment);
  if (filters.status) params.append('resolved', filters.status === 'resolved' ? 'true' : 'false');
  if (filters.search) params.append('search', filters.search);
  
  const response = await fetch(`/api/errors?${params}`);
  return response.json();
}
```

### Управление статусами
```typescript
// Компонент для изменения статуса ошибки
function ErrorStatusActions({ error }: { error: ErrorReport }) {
  const queryClient = useQueryClient();
  
  const updateStatus = useMutation({
    mutationFn: (status: 'resolved' | 'unresolved') => 
      updateErrorStatus(error.id, status),
    onSuccess: () => {
      queryClient.invalidateQueries(['errors']);
    }
  });

  const addTag = useMutation({
    mutationFn: (tag: string) => addErrorTag(error.id, tag),
    onSuccess: () => {
      queryClient.invalidateQueries(['errors']);
    }
  });

  return (
    <div className="error-actions">
      <Button
        onClick={() => updateStatus.mutate('resolved')}
        disabled={error.resolved}
      >
        Отметить как решенную
      </Button>
      
      <Button
        onClick={() => updateStatus.mutate('unresolved')}
        disabled={!error.resolved}
      >
        Отметить как не решенную
      </Button>

      <TagInput onAddTag={(tag) => addTag.mutate(tag)} />
    </div>
  );
}
```

## 📊 Аналитика и отчеты

### Дашборд метрики
```typescript
// Хук для получения статистики
export function useErrorStats() {
  return useQuery({
    queryKey: ['error-stats'],
    queryFn: fetchErrorStats,
    refetchInterval: 30000 // Обновление каждые 30 секунд
  });
}

// Компонент графика ошибок
function ErrorTrendChart() {
  const { data: trendData } = useQuery({
    queryKey: ['error-trend'],
    queryFn: fetchErrorTrend
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={trendData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="total" stroke="#8884d8" />
        <Line type="monotone" dataKey="critical" stroke="#ff7300" />
        <Line type="monotone" dataKey="resolved" stroke="#82ca9d" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### Экспорт данных
```typescript
// Функция экспорта ошибок
async function exportErrors(filters: ErrorFilters, format: 'csv' | 'json') {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  params.append('format', format);

  const response = await fetch(`/api/errors/export?${params}`);
  const blob = await response.blob();
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `errors-${new Date().toISOString().split('T')[0]}.${format}`;
  a.click();
}
```

## 🔐 Безопасность

### Аутентификация
```typescript
// Middleware для защиты маршрутов
import { withAuth } from 'next-auth/middleware';

export default withAuth({
  callbacks: {
    authorized: ({ token }) => {
      // Доступ только для администраторов
      return token?.role === 'ADMIN';
    },
  },
});

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*']
};
```

### Валидация данных
```typescript
// Схема валидации отчетов об ошибках
import { z } from 'zod';

const ErrorReportSchema = z.object({
  message: z.string().min(1),
  stack: z.string().optional(),
  appName: z.enum(['web', 'trainer-panel', 'telegram-bot', 'error-dashboard']),
  environment: z.enum(['development', 'production', 'staging']),
  url: z.string().url().optional(),
  userAgent: z.string().optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  componentStack: z.string().optional(),
  additionalContext: z.record(z.any()).optional(),
  tags: z.array(z.string()).default([])
});

function validateErrorReport(data: unknown) {
  return ErrorReportSchema.parse(data);
}
```

## 🧪 Тестирование

### Unit тесты
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorList } from './ErrorList';

test('should filter errors by app name', () => {
  const mockErrors = [
    { id: '1', appName: 'web', message: 'Test error 1' },
    { id: '2', appName: 'trainer-panel', message: 'Test error 2' }
  ];

  render(<ErrorList errors={mockErrors} />);
  
  fireEvent.change(screen.getByLabelText('Приложение'), {
    target: { value: 'web' }
  });
  
  expect(screen.getByText('Test error 1')).toBeInTheDocument();
  expect(screen.queryByText('Test error 2')).not.toBeInTheDocument();
});
```

### Integration тесты
```typescript
import { test, expect } from '@playwright/test';

test('should create error report', async ({ page }) => {
  await page.goto('/');
  
  // Симуляция отправки отчета об ошибке
  await page.evaluate(() => {
    return fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Test error',
        appName: 'web',
        environment: 'development'
      })
    });
  });
  
  await page.reload();
  await expect(page.locator('[data-testid="error-item"]')).toBeVisible();
});
```

## 🚀 Развертывание

### Переменные окружения
```env
# Next.js
NEXT_PUBLIC_APP_URL=https://errors.gafus.ru
NEXTAUTH_URL=https://errors.gafus.ru
NEXTAUTH_SECRET=your-secret

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/gafus

# Error Dashboard
ERROR_DASHBOARD_API_KEY=your-api-key
ERROR_SAMPLE_RATE=1.0
```

### Docker
```dockerfile
FROM node:18-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runtime
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["npm", "start"]
```

## 🔧 Разработка

### Команды разработки
```bash
# Разработка
pnpm dev                    # Запуск в режиме разработки (порт 3000)
pnpm build                  # Сборка для продакшена
pnpm start                  # Запуск продакшен версии

# Тестирование
pnpm test                   # Запуск тестов
pnpm test:e2e              # E2E тесты
```

### Структура компонентов
```typescript
// Компоненты ошибок
features/errors/components/
├── ErrorList.tsx           # Список ошибок
├── ErrorDetail.tsx         # Детали ошибки
├── ErrorFilters.tsx        # Фильтры
├── ErrorStats.tsx          # Статистика
├── ErrorChart.tsx          # Графики
└── ErrorActions.tsx        # Действия с ошибками
```

---

*Error Dashboard обеспечивает централизованный мониторинг и управление ошибками для всей экосистемы GAFUS.*
