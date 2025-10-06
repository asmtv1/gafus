# Bull Board (@gafus/bull-board)

## 📋 Обзор

Bull Board - это веб-интерфейс для мониторинга и управления очередями задач (Bull Queues) в экосистеме GAFUS. Предоставляет инструменты для просмотра, управления и отладки фоновых задач.

## 🎯 Основные функции

### Мониторинг очередей
- **📊 Просмотр очередей** и их статусов
- **🔍 Детальная информация** о задачах
- **⏱️ Мониторинг производительности** выполнения
- **📈 Статистика** очередей и задач

### Управление задачами
- **⏸️ Пауза/возобновление** задач
- **🔄 Повторное выполнение** неудачных задач
- **🗑️ Удаление** задач из очередей
- **📝 Просмотр логов** выполнения

### Отладка
- **🔍 Детальный просмотр** данных задач
- **📊 Анализ ошибок** выполнения
- **⏱️ Профилирование** времени выполнения
- **📈 Мониторинг** использования ресурсов

## 🏗️ Архитектура

### Структура приложения
```
apps/bull-board/
├── bull-board.ts           # Основной файл конфигурации
├── package.json
└── tsconfig.json
```

### Интеграция с очередями
```typescript
// bull-board.ts - Конфигурация Bull Board
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bull';
import { logger } from '@gafus/logger';

// Инициализация очередей
const emailQueue = new Queue('email', process.env.REDIS_URL!);
const notificationQueue = new Queue('notification', process.env.REDIS_URL!);
const imageProcessingQueue = new Queue('image-processing', process.env.REDIS_URL!);

// Создание Bull Board
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullAdapter(emailQueue),
    new BullAdapter(notificationQueue),
    new BullAdapter(imageProcessingQueue)
  ],
  serverAdapter
});

export { serverAdapter };
```

## 🔧 Технические особенности

### Настройка Express сервера
```typescript
// Интеграция с Express
import express from 'express';
import { serverAdapter } from './bull-board';

const app = express();

// Middleware для аутентификации
app.use('/admin/queues', authenticateAdmin);

// Подключение Bull Board
app.use('/admin/queues', serverAdapter.getRouter());

const PORT = process.env.BULL_BOARD_PORT || 3003;
app.listen(PORT, () => {
  logger.info(`Bull Board running on port ${PORT}`);
});
```

### Аутентификация
```typescript
// Middleware для защиты Bull Board
function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.status(401).send('Authentication required');
    return;
  }
  
  const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
  const [username, password] = credentials.split(':');
  
  if (username === process.env.BULL_BOARD_USERNAME && 
      password === process.env.BULL_BOARD_PASSWORD) {
    next();
  } else {
    res.status(401).send('Invalid credentials');
  }
}
```

### Кастомные действия
```typescript
// Добавление кастомных действий для очередей
serverAdapter.addAction('retry-failed', async (req, res) => {
  const { queueName, jobId } = req.params;
  const queue = getQueueByName(queueName);
  
  try {
    const job = await queue.getJob(jobId);
    if (job) {
      await job.retry();
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Job not found' });
    }
  } catch (error) {
    logger.error('Failed to retry job', { queueName, jobId, error });
    res.status(500).json({ error: 'Failed to retry job' });
  }
});
```

## 📊 Мониторинг и аналитика

### Статистика очередей
```typescript
// Получение статистики очередей
async function getQueueStats() {
  const stats = await Promise.all([
    emailQueue.getJobCounts(),
    notificationQueue.getJobCounts(),
    imageProcessingQueue.getJobCounts()
  ]);

  return {
    email: stats[0],
    notification: stats[1],
    imageProcessing: stats[2],
    timestamp: new Date().toISOString()
  };
}

// API endpoint для статистики
app.get('/api/queue-stats', async (req, res) => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get queue stats', { error });
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});
```

### Мониторинг производительности
```typescript
// Отслеживание времени выполнения задач
emailQueue.on('completed', async (job, result) => {
  const duration = Date.now() - job.processedOn!;
  
  logger.info('Job completed', {
    queueName: 'email',
    jobId: job.id,
    jobName: job.name,
    duration,
    result
  });

  // Сохранение метрик
  await saveJobMetrics({
    queueName: 'email',
    jobName: job.name,
    duration,
    status: 'completed',
    timestamp: new Date()
  });
});

emailQueue.on('failed', async (job, error) => {
  const duration = Date.now() - job.processedOn!;
  
  logger.error('Job failed', {
    queueName: 'email',
    jobId: job.id,
    jobName: job.name,
    duration,
    error: error.message
  });

  // Сохранение метрик ошибки
  await saveJobMetrics({
    queueName: 'email',
    jobName: job.name,
    duration,
    status: 'failed',
    error: error.message,
    timestamp: new Date()
  });
});
```

### Алертинг
```typescript
// Система алертинга для критических ситуаций
async function checkQueueHealth() {
  const emailStats = await emailQueue.getJobCounts();
  const notificationStats = await notificationQueue.getJobCounts();
  
  // Алерт при большом количестве неудачных задач
  if (emailStats.failed > 100) {
    await sendAlert({
      type: 'queue_health',
      message: `High failure rate in email queue: ${emailStats.failed} failed jobs`,
      severity: 'high',
      queueName: 'email'
    });
  }
  
  // Алерт при застое в очереди
  if (notificationStats.waiting > 1000) {
    await sendAlert({
      type: 'queue_stall',
      message: `Queue stall detected in notification queue: ${notificationStats.waiting} waiting jobs`,
      severity: 'critical',
      queueName: 'notification'
    });
  }
}

// Проверка каждые 5 минут
setInterval(checkQueueHealth, 5 * 60 * 1000);
```

## 🔧 Управление задачами

### Повторное выполнение задач
```typescript
// API для повторного выполнения неудачных задач
app.post('/api/queues/:queueName/retry-failed', async (req, res) => {
  const { queueName } = req.params;
  const queue = getQueueByName(queueName);
  
  try {
    const failedJobs = await queue.getFailed();
    let retriedCount = 0;
    
    for (const job of failedJobs) {
      try {
        await job.retry();
        retriedCount++;
      } catch (error) {
        logger.error('Failed to retry job', { jobId: job.id, error });
      }
    }
    
    res.json({ 
      success: true, 
      retriedCount,
      totalFailed: failedJobs.length 
    });
  } catch (error) {
    logger.error('Failed to retry failed jobs', { queueName, error });
    res.status(500).json({ error: 'Failed to retry jobs' });
  }
});
```

### Очистка очередей
```typescript
// API для очистки завершенных задач
app.delete('/api/queues/:queueName/clean', async (req, res) => {
  const { queueName } = req.params;
  const { olderThan } = req.body; // в часах
  const queue = getQueueByName(queueName);
  
  try {
    const completedJobs = await queue.getCompleted();
    const failedJobs = await queue.getFailed();
    
    const cutoffTime = Date.now() - (olderThan * 60 * 60 * 1000);
    
    let cleanedCount = 0;
    
    // Очистка завершенных задач
    for (const job of completedJobs) {
      if (job.finishedOn && job.finishedOn < cutoffTime) {
        await job.remove();
        cleanedCount++;
      }
    }
    
    // Очистка неудачных задач
    for (const job of failedJobs) {
      if (job.finishedOn && job.finishedOn < cutoffTime) {
        await job.remove();
        cleanedCount++;
      }
    }
    
    res.json({ 
      success: true, 
      cleanedCount,
      olderThan 
    });
  } catch (error) {
    logger.error('Failed to clean queue', { queueName, error });
    res.status(500).json({ error: 'Failed to clean queue' });
  }
});
```

### Пауза/возобновление очередей
```typescript
// API для управления состоянием очередей
app.post('/api/queues/:queueName/pause', async (req, res) => {
  const { queueName } = req.params;
  const queue = getQueueByName(queueName);
  
  try {
    await queue.pause();
    logger.info('Queue paused', { queueName });
    res.json({ success: true, status: 'paused' });
  } catch (error) {
    logger.error('Failed to pause queue', { queueName, error });
    res.status(500).json({ error: 'Failed to pause queue' });
  }
});

app.post('/api/queues/:queueName/resume', async (req, res) => {
  const { queueName } = req.params;
  const queue = getQueueByName(queueName);
  
  try {
    await queue.resume();
    logger.info('Queue resumed', { queueName });
    res.json({ success: true, status: 'resumed' });
  } catch (error) {
    logger.error('Failed to resume queue', { queueName, error });
    res.status(500).json({ error: 'Failed to resume queue' });
  }
});
```

## 🔍 Отладка и диагностика

### Просмотр деталей задач
```typescript
// API для получения детальной информации о задаче
app.get('/api/queues/:queueName/jobs/:jobId', async (req, res) => {
  const { queueName, jobId } = req.params;
  const queue = getQueueByName(queueName);
  
  try {
    const job = await queue.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const jobData = {
      id: job.id,
      name: job.name,
      data: job.data,
      opts: job.opts,
      progress: job.progress(),
      returnValue: job.returnvalue,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      attemptsMade: job.attemptsMade,
      delay: job.delay,
      timestamp: job.timestamp
    };
    
    res.json(jobData);
  } catch (error) {
    logger.error('Failed to get job details', { queueName, jobId, error });
    res.status(500).json({ error: 'Failed to get job details' });
  }
});
```

### Логирование выполнения
```typescript
// Расширенное логирование для отладки
emailQueue.on('active', (job) => {
  logger.info('Job started', {
    queueName: 'email',
    jobId: job.id,
    jobName: job.name,
    data: job.data,
    timestamp: new Date().toISOString()
  });
});

emailQueue.on('progress', (job, progress) => {
  logger.debug('Job progress', {
    queueName: 'email',
    jobId: job.id,
    progress,
    timestamp: new Date().toISOString()
  });
});
```

## 🚀 Развертывание

### Переменные окружения
```env
# Bull Board
BULL_BOARD_PORT=3003
BULL_BOARD_USERNAME=admin
BULL_BOARD_PASSWORD=secure-password

# Redis
REDIS_URL=redis://localhost:6379

# Monitoring
ENABLE_QUEUE_MONITORING=true
ALERT_EMAIL=admin@gafus.ru
```

### Docker
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3003
CMD ["node", "dist/bull-board.js"]
```

### Nginx конфигурация
```nginx
server {
    listen 80;
    server_name queues.gafus.ru;

    location / {
        proxy_pass http://localhost:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🔧 Разработка

### Команды разработки
```bash
# Разработка
pnpm dev                    # Запуск в режиме разработки
pnpm build                  # Сборка TypeScript
pnpm start                  # Запуск продакшен версии

# Тестирование
pnpm test                   # Запуск тестов
```

### Структура проекта
```typescript
// Основные модули
bull-board.ts              # Главный файл конфигурации
├── queues/                # Конфигурация очередей
├── middleware/            # Middleware для аутентификации
├── api/                   # API endpoints
└── monitoring/            # Мониторинг и алертинг
```

---

*Bull Board обеспечивает полный контроль над очередями задач и их мониторинг в экосистеме GAFUS.*
