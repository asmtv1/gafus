# @gafus/worker - Фоновые задачи

## 📋 Обзор

Пакет `@gafus/worker` предоставляет систему для выполнения фоновых задач и обработки очередей в экосистеме GAFUS.

## 🎯 Основные функции

- **Обработка очередей** задач
- **Фоновые процессы** для тяжелых операций
- **Планировщик задач** с cron-like функциональностью
- **Мониторинг** выполнения задач
- **Health server** — HTTP `/health` для liveness (blackbox-exporter, Docker healthcheck)

## Health endpoint

- **Файл:** `packages/worker/src/health-server.ts`
- **Endpoint:** `GET /health` и `HEAD /health` → 200, `{"ok": true}`
- **Порт:** `WORKER_HEALTH_PORT` (по умолчанию 3003)
- **Сеть:** слушает `0.0.0.0` для доступа внутри Docker
- **Зависимости:** только `node:http`, без внешних пакетов

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

## 📦 Воркеры и расписания

| Воркер | Очередь | Расписание | Описание |
|--------|---------|------------|----------|
| Exam Cleanup | exam-cleanup | 03:00 MSK | Очистка старых результатов экзаменов |
| Consent Log Cleanup | consent-log-cleanup | 02:00 MSK | Удаление orphaned FAILED ConsentLog старше 90 дней |
| Re-engagement | reengagement | cron | Re-engagement письма |
| Push | push | — | Push (Web/VAPID, Expo/FCM, RuStore) |
| Video Transcoding | video-transcoding | — | Транскодирование видео |

## 🔧 API

- `createWorker(options)` - Создание воркера
- `processJob(queue, jobType, handler)` - Обработка задач
- `scheduleJob(queue, jobType, data, schedule)` - Планирование задач
- `getWorkerStats()` - Статистика воркера
- `startHealthServer()` - Запуск HTTP-сервера для `/health` (liveness)

## Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `WORKER_HEALTH_PORT` | 3003 | Порт HTTP-сервера для healthcheck |
