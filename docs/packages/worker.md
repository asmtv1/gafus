# @gafus/worker - Фоновые задачи

## 📋 Обзор

Пакет `@gafus/worker` предоставляет систему для выполнения фоновых задач и обработки очередей в экосистеме GAFUS.

## 🎯 Основные функции

- **Обработка очередей** задач
- **Фоновые процессы** для тяжелых операций
- **Планировщик задач** с cron-like функциональностью
- **Мониторинг** выполнения задач

## 📦 Использование

### Создание воркера

```typescript
import { createWorker } from "@gafus/worker";

const worker = createWorker({
  queues: ["email", "notification", "image-processing"],
  concurrency: 5,
});

worker.start();
```

### Обработка задач

```typescript
import { processJob } from "@gafus/worker";

processJob("email", "send-welcome", async (job) => {
  const { userId, email } = job.data;
  await sendWelcomeEmail(userId, email);
});

processJob("image-processing", "resize", async (job) => {
  const { imageUrl, sizes } = job.data;
  await resizeImage(imageUrl, sizes);
});
```

## 🔧 API

- `createWorker(options)` - Создание воркера
- `processJob(queue, jobType, handler)` - Обработка задач
- `scheduleJob(queue, jobType, data, schedule)` - Планирование задач
- `getWorkerStats()` - Статистика воркера
