# @gafus/queues - Система очередей

## 📋 Обзор

Пакет `@gafus/queues` предоставляет систему очередей на основе Redis и Bull для асинхронной обработки задач во всех приложениях экосистемы GAFUS.

## 🎯 Основные функции

- **Очереди задач** на основе Redis
- **Асинхронная обработка** фоновых задач
- **Повторные попытки** при ошибках
- **Мониторинг очередей** через Bull Board

## 📦 Использование

### Создание очереди
```typescript
import { createQueue } from '@gafus/queues';

const emailQueue = createQueue('email', {
  redis: {
    host: 'localhost',
    port: 6379
  }
});
```

### Добавление задачи
```typescript
import { addJob } from '@gafus/queues';

await addJob('email', 'send-welcome', {
  userId: '123',
  email: 'user@example.com'
}, {
  delay: 5000, // Задержка 5 секунд
  attempts: 3  // 3 попытки
});
```

### Обработка задач
```typescript
import { processQueue } from '@gafus/queues';

processQueue('email', 'send-welcome', async (job) => {
  const { userId, email } = job.data;
  await sendWelcomeEmail(userId, email);
});
```

## 🔧 API

- `createQueue(name, options)` - Создание очереди
- `addJob(queue, jobType, data, options)` - Добавление задачи
- `processQueue(queue, jobType, handler)` - Обработка задач
- `getQueueStats(queue)` - Статистика очереди
