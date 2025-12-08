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

### Мониторинг системы
- **🖥️ Статус всех сервисов** (web, trainer-panel, admin-panel, bull-board)
- **💾 Состояние баз данных** (PostgreSQL, Redis)
- **📊 Системные метрики** (CPU, Memory, Uptime)
- **⚡ Real-time обновление** статуса каждые 30 секунд

### Управление очередями
- **📊 Статистика всех очередей** (push, reengagement, examCleanup)
- **🔍 Мониторинг задач** (waiting, active, completed, failed, delayed)
- **⚠️ Быстрый доступ** к проблемным задачам
- **🔄 Повторный запуск** failed jobs (одиночный и массовый)
- **🗑️ Управление задачами** (retry, remove, promote)

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
│   │   │   ├── queues/        # Управление очередями
│   │   │   │   ├── jobs/      # Получение задач
│   │   │   │   ├── retry/     # Повторный запуск
│   │   │   │   └── stats/     # Статистика очередей
│   │   │   ├── report/        # Отчеты об ошибках
│   │   │   └── system-status/ # Статус системы
│   │   ├── login/             # Страница входа
│   │   ├── queues/            # Мониторинг очередей
│   │   ├── system-status/     # Мониторинг системы
│   │   └── page.tsx           # Главная страница
│   ├── features/              # Функциональные модули
│   │   ├── errors/            # Управление ошибками
│   │   │   └── components/    # Компоненты ошибок
│   │   ├── queues/            # Управление очередями
│   │   │   └── components/    # Компоненты очередей
│   │   └── system/            # Мониторинг системы
│   │       └── components/    # Компоненты статуса
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
├── queues/
│   ├── jobs/
│   │   └── route.ts          # Получение задач из очередей
│   ├── retry/
│   │   └── route.ts          # Повторный запуск задач
│   └── stats/
│       └── route.ts          # Статистика очередей
├── report/
│   └── route.ts              # Отчеты об ошибках
└── system-status/
    └── route.ts              # Статус системы и метрики
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
- Показывает полный `additionalContext` включая `pushSpecific` для push-уведомлений

#### Статус системы
- Мониторинг всех сервисов в реальном времени
- Состояние PostgreSQL и Redis
- Использование CPU и памяти
- Время работы системы (uptime)
- Автоматическое обновление каждые 30 секунд

#### Управление очередями
- Статистика всех очередей (push, reengagement, examCleanup)
- Мониторинг задач по статусам
- Список проблемных задач с деталями
- Повторный запуск failed jobs
- Массовый retry для всей очереди
- Удаление и продвижение задач

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

## 📋 Управление очередями

### Статистика очередей
```typescript
// API endpoint для получения статистики всех очередей
// app/api/queues/stats/route.ts
import { pushQueue, reengagementQueue } from "@gafus/queues";

export async function GET() {
  // Получаем статистику для всех очередей параллельно
  const [pushStats, reengagementStats, examCleanupStats] = await Promise.all([
    getQueueStats("push", pushQueue),
    getQueueStats("reengagement", reengagementQueue),
    getQueueStats("examCleanup", examCleanupQueue),
  ]);

  const totalJobs = {
    waiting: queues.reduce((sum, q) => sum + q.waiting, 0),
    active: queues.reduce((sum, q) => sum + q.active, 0),
    completed: queues.reduce((sum, q) => sum + q.completed, 0),
    failed: queues.reduce((sum, q) => sum + q.failed, 0),
    delayed: queues.reduce((sum, q) => sum + q.delayed, 0),
  };

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    queues: [pushStats, reengagementStats, examCleanupStats],
    totalJobs,
  });
}
```

### Получение failed jobs
```typescript
// API endpoint для получения проблемных задач
// app/api/queues/jobs/route.ts
export async function GET(request: NextRequest) {
  const queueName = searchParams.get("queue");
  const status = searchParams.get("status") || "failed";
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  // Получаем задачи из конкретной очереди
  const queue = getQueueByName(queueName);
  const jobs = await queue.getFailed(0, limit - 1);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    jobs: jobs.map((job) => ({
      id: job.id,
      name: job.name,
      queueName,
      data: job.data,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
    })),
    count: jobs.length,
  });
}
```

### Повторный запуск задач
```typescript
// API endpoint для retry задач
// app/api/queues/retry/route.ts

// Одиночный retry
export async function POST(request: NextRequest) {
  const { queueName, jobId, action } = await request.json();

  const queue = getQueueByName(queueName);
  const job = await queue.getJob(jobId);

  switch (action) {
    case "retry":
      await job.retry();
      break;
    case "remove":
      await job.remove();
      break;
    case "promote":
      await job.promote();
      break;
  }

  return NextResponse.json({ success: true });
}

// Массовый retry
export async function PUT(request: NextRequest) {
  const { queueName } = await request.json();

  const queue = getQueueByName(queueName);
  const failedJobs = await queue.getFailed(0, -1);

  // Повторно запускаем все failed jobs
  await Promise.allSettled(failedJobs.map((job) => job.retry()));

  return NextResponse.json({ success: true });
}
```

### Компоненты очередей
```typescript
// Компонент статистики очереди
import { QueueStatsCard } from "@features/queues/components/QueueStatsCard";

function QueuesStats() {
  const { data } = useQueuesStats();

  return (
    <Box display="grid" gridTemplateColumns="repeat(3, 1fr)" gap={3}>
      {data?.queues.map((queueStats) => (
        <QueueStatsCard
          key={queueStats.name}
          stats={queueStats}
          onClick={() => handleQueueClick(queueStats.name)}
        />
      ))}
    </Box>
  );
}
```

### Список failed jobs
```typescript
// Компонент списка проблемных задач
import { FailedJobsList } from "@features/queues/components/FailedJobsList";
import { useQueueJobs, useRetryJob } from "@shared/hooks/useQueueJobs";

function FailedJobs() {
  const { data } = useQueueJobs(undefined, "failed", 50);
  const retryJob = useRetryJob();

  const handleRetry = async (job: FailedJob) => {
    await retryJob.mutateAsync({
      queueName: job.queueName,
      jobId: job.id,
      action: "retry",
    });
  };

  return <FailedJobsList jobs={data?.jobs || []} />;
}
```

### Массовый retry
```typescript
// Хук для массового retry
import { useBulkRetry } from "@shared/hooks/useQueueJobs";

function BulkRetryButton({ queueName }: { queueName: string }) {
  const bulkRetry = useBulkRetry();

  const handleBulkRetry = async () => {
    await bulkRetry.mutateAsync({ queueName });
  };

  return (
    <Button
      onClick={handleBulkRetry}
      disabled={bulkRetry.isPending}
      startIcon={<RetryIcon />}
    >
      Повторить все
    </Button>
  );
}
```

## 🖥️ Мониторинг системы

### Статус сервисов

Мониторинг статуса сервисов выполняется через прямые HTTP health-check запросы к каждому сервису.

```typescript
// API endpoint для получения статуса системы
// app/api/system-status/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Проверяем статус сервисов через health endpoints
    const [webStatus, trainerStatus, adminStatus, bullBoardStatus] = 
      await Promise.all([
        checkServiceHealth("Web App", "http://web:3000/api/health"),
        checkServiceHealth("Trainer Panel", "http://trainer-panel:3001/api/health"),
        checkServiceHealth("Admin Panel", "http://admin-panel:3006/api/health"),
        checkServiceHealth("Bull Board", "http://bull-board:3002/health"),
      ]);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      services: [webStatus, trainerStatus, adminStatus, bullBoardStatus],
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get system status" },
      { status: 500 }
    );
  }
}
```

### Компоненты статуса
```typescript
// Компонент статуса сервиса
import { ServiceStatusCard } from "@features/system/components/ServiceStatusCard";

function SystemStatus() {
  const { data, refetch } = useSystemStatus();

  return (
    <Grid container spacing={3}>
      {data?.services.map((service) => (
        <Grid item xs={12} sm={6} md={4} lg={3} key={service.name}>
          <ServiceStatusCard service={service} />
        </Grid>
      ))}
    </Grid>
  );
}
```

### Системные метрики
```typescript
// Компонент системных метрик
import { SystemMetricsCard } from "@features/system/components/SystemMetricsCard";

function SystemMetrics() {
  const { data } = useSystemStatus();

  if (!data) return null;

  return <SystemMetricsCard metrics={data.metrics} />;
}
```

### Навигация между разделами
```typescript
// Компонент навигации с вкладками
import { NavigationTabs } from "@shared/components/NavigationTabs";

function Layout({ children }) {
  return (
    <>
      <NavigationTabs />
      {children}
    </>
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

### Генерация тестовых ошибок

Для проверки работы error-dashboard можно сгенерировать тестовые ошибки из всех приложений и пакетов.

#### Универсальный скрипт

Используйте универсальный скрипт для генерации ошибок:

```bash
# Все тесты (все приложения и пакеты)
pnpm test:errors

# Конкретный тест
node scripts/generate-test-errors.js web
node scripts/generate-test-errors.js logger
node scripts/generate-test-errors.js auth

# Список доступных тестов
node scripts/generate-test-errors.js --help
```

#### Доступные тесты

- `logger` - ошибки из пакета logger
- `error-handling` - ошибки из пакета error-handling
- `auth` - ошибки аутентификации
- `prisma` - ошибки базы данных
- `queues` - ошибки очередей
- `webpush` - ошибки push-уведомлений
- `csrf` - ошибки CSRF защиты
- `types` - ошибки типов
- `react-query` - ошибки React Query
- `web` - ошибки web приложения
- `trainer-panel` - ошибки trainer panel
- `telegram-bot` - ошибки telegram бота
- `bull-board` - ошибки bull board

#### Индивидуальные тесты

Каждый пакет/приложение имеет свой тестовый скрипт:

```bash
# Logger
node packages/logger/test-error-dashboard.js

# Error Handling
node packages/error-handling/test-error-handling-error-dashboard.js

# Web приложение
node apps/web/test-web-error-dashboard.js

# Trainer Panel
node apps/trainer-panel/test-trainer-panel-error-dashboard.js
```

#### Проверка результатов

После запуска тестов проверьте error-dashboard:

- **Главная страница**: http://localhost:3001
- **Логи контейнеров**: http://localhost:3001/container-logs
- **Статистика**: http://localhost:3001/stats

Ошибки появятся в соответствующих разделах с тегами и контекстом.

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

## 📝 История изменений

### Version 1.4.0 - Упрощение логики удаления

**Дата:** 03 декабря 2025

**Проблема:**
- Удаление не работало из-за несовпадения `tag_*` labels между запросом на удаление и реальными labels в stream Seq
- Запрос на удаление использовал слишком специфичные labels (`tag_fatal`, `tag_telegram_bot`, `tag_error_report`), которых может не быть в stream
- Задержка 500ms была недостаточной для асинхронного удаления Seq

**Изменения:**
- Убрано использование `tag_*` labels для удаления - теперь используются только базовые labels, которые точно есть в stream
- Используются только: `app`, `level`, `environment`, `context`, `service_name`, `container`
- Увеличена задержка после удаления с 500ms до 2 секунд для асинхронного удаления Seq
- Временное окно: ±5ms при наличии `timestampNs`, иначе ±1 секунда
- Улучшено логирование используемых labels для отладки

**Техническая архитектура:**

Упрощённая логика удаления в `deleteError.ts`:

```typescript
// Используем только базовые labels, которые точно есть в stream
const environmentLabel = rawLabels.environment || targetError.environment;
const contextLabel = rawLabels.context;
const serviceNameLabel = rawLabels.service_name || rawLabels.serviceName;
const containerLabel = rawLabels.container_name || rawLabels.container;

// НЕ используем tag_* labels и filters.tags
const result = await client.deleteLogs({
  appName,
  level: levelMatcher,
  environment: environmentLabel,
  context: contextLabel,
  serviceName: serviceNameLabel,
  container: containerLabel,
  // НЕ передаём tags и tag_* labels
  startTime,
  endTime,
  startIso,
  endIso,
});

// Увеличена задержка для асинхронного удаления Seq
await new Promise((resolve) => setTimeout(resolve, 2000));
```

**Преимущества:**
- Удаление работает надёжно, так как использует только базовые labels, которые всегда есть в stream
- Нет проблем с несовпадением `tag_*` labels
- Достаточная задержка для асинхронного удаления Seq
- Упрощённая логика легче поддерживать

### Version 1.3.0 - Точное удаление по RFC3339

**Дата:** 03 декабря 2025

**Изменения:**
- `deleteError` теперь преобразует наносекундные метки Loki в ISO 8601 (RFC3339) и использует окно ±5 мс при наличии `timestampNs`
- `SeqClient.deleteLogs` принимает `startIso/endIso` и всегда отправляет в Seq корректные значения `start/end`, избегая `invalid start time`
- В логах отображаются ISO-интервалы и длительность окна, что упрощает отладку
- Добавлены рекомендации по использованию ISO меток в этом документе


### Version 1.2.0 - Переписана логика удаления логов

**Дата:** 02 декабря 2024

**Проблема:**
- Неправильный парсинг ID ошибки (не учитывались дефисы в имени приложения)
- Отсутствие валидации timestamp приводило к `Invalid Date`
- Слишком широкое временное окно удаляло лишние логи
- Не учитывался уровень логирования (level)

**Изменения:**
- Полностью переписана логика парсинга ID с учетом дефисов в именах приложений
- Добавлена комплексная валидация timestamp и создаваемых дат
- Сужено временное окно до ±100ms с фильтрацией по level='error'
- Улучшено логирование на всех уровнях (server action, SeqClient, UI)

**Техническая архитектура:**

Правильный парсинг ID справа налево в `deleteError.ts`:

```typescript
// ID формат: app-timestamp-random
// app может содержать дефисы: "error-dashboard-1764717287731000000-abc123"
// Парсим справа налево:
const parts = errorId.split('-');
if (parts.length < 3) {
  return { success: false, error: "Неверный формат ID" };
}

// Последняя часть - random ID
const randomPart = parts[parts.length - 1];
// Предпоследняя - timestamp (наносекунды)
const timestampStr = parts[parts.length - 2];
// Все остальное - app name (может содержать дефисы)
const appName = parts.slice(0, parts.length - 2).join('-');

// Валидация timestamp
const timestampNs = parseInt(timestampStr, 10);
if (isNaN(timestampNs) || timestampNs <= 0) {
  return { success: false, error: "Некорректный timestamp в ID" };
}

// Преобразование наносекунд в миллисекунды
const timestampMs = timestampNs / 1000000;
const errorTime = new Date(timestampMs);

// Валидация даты
if (isNaN(errorTime.getTime())) {
  return { success: false, error: "Некорректная дата из timestamp" };
}

// Узкое временное окно ±100ms (достаточно для точности)
const startTime = new Date(errorTime.getTime() - 100);
const endTime = new Date(errorTime.getTime() + 100);

// Удаление с учетом app и level
const result = await client.deleteLogs({
  appName,
  level: 'error', // Удаляем только error level
  startTime,
  endTime,
});
```

Улучшенная валидация в `SeqClient.deleteLogs`:

```typescript
// Валидация базового URL
if (!this.baseUrl) {
  return { success: false, error: "Seq baseUrl не настроен" };
}

// Валидация времени
if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
  return { success: false, error: "Некорректные даты для удаления" };
}

if (startTime >= endTime) {
  return { success: false, error: "startTime должен быть меньше endTime" };
}
```

Улучшенный UX в `RecentErrors.tsx`:

```typescript
// Показываем информацию об удаляемой ошибке
const confirmMessage = error 
  ? `Вы уверены, что хотите удалить эту ошибку?\n\nПриложение: ${error.appName}\nСообщение: ${error.message.substring(0, 100)}\n\nЭто действие нельзя отменить.`
  : 'Вы уверены, что хотите удалить эту ошибку?';

// Детальное логирование времени выполнения
const startTime = Date.now();
const result = await deleteError(errorId);
const duration = Date.now() - startTime;
```

**Преимущества:**
- Правильный парсинг ID с дефисами в именах приложений (`error-dashboard`, `trainer-panel`)
- Полная валидация данных предотвращает ошибки `Invalid Date`
- Точное удаление (±100ms + level filter) не затрагивает другие логи
- Детальные сообщения об ошибках помогают диагностировать проблемы
- Улучшенный UX с информацией о том, что удаляется

### Version 1.1.0 - Исправление удаления логов из Seq

**Дата:** 02 декабря 2024

**Изменения:**
- Добавлена переменная окружения `SEQ_URL` в production конфигурацию Docker
- Расширено временное окно удаления логов с ±1 до ±5 секунд для надежности
- Улучшено логирование операций удаления для диагностики

---

*Error Dashboard обеспечивает централизованный мониторинг и управление ошибками для всей экосистемы GAFUS.*
