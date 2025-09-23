# 🔇 Управление логированием в production

## Переменные окружения для контроля логирования

### 1. **Полное отключение логирования**
```bash
DISABLE_LOGGING=true
```
- Отключает **все** логи (кроме критических ошибок)
- Устанавливает уровень `fatal` (только критические ошибки)
- Отключает консольный вывод
- Отключает отправку в error-dashboard

### 2. **Отключение только консольного вывода**
```bash
DISABLE_CONSOLE_LOGGING=true
```
- Отключает вывод в консоль
- Сохраняет отправку в error-dashboard
- Полезно для production, где нужен мониторинг ошибок

### 3. **Отключение отправки в error-dashboard**
```bash
DISABLE_ERROR_DASHBOARD_LOGGING=true
```
- Отключает отправку логов в error-dashboard
- Сохраняет консольный вывод
- Полезно для отладки или когда error-dashboard недоступен

## Примеры использования

### Полное отключение логов в production
```bash
# В .env.production или переменных окружения сервера
NODE_ENV=production
DISABLE_LOGGING=true
```

### Отключение только консоли, но сохранение мониторинга
```bash
# В .env.production
NODE_ENV=production
DISABLE_CONSOLE_LOGGING=true
ERROR_DASHBOARD_URL=https://errors.yourdomain.com/api
```

### Отключение error-dashboard, но сохранение консоли
```bash
# Для отладки или когда error-dashboard недоступен
NODE_ENV=production
DISABLE_ERROR_DASHBOARD_LOGGING=true
```

## Программное управление

### Создание "тихого" логгера
```typescript
import { createSilentLogger } from '@gafus/logger';

// Создает логгер, который ничего не выводит
const silentLogger = createSilentLogger('my-module');
```

### Обновление конфигурации существующего логгера
```typescript
import { createWebLogger } from '@gafus/logger';

const logger = createWebLogger('my-app');

// Отключить консольный вывод
logger.updateConfig({
  enableConsole: false
});

// Отключить отправку в error-dashboard
logger.updateConfig({
  enableErrorDashboard: false
});

// Изменить уровень логирования
logger.updateConfig({
  level: 'fatal' // Только критические ошибки
});
```

## Уровни логирования

| Уровень | Описание | Когда использовать |
|---------|----------|-------------------|
| `debug` | Отладочная информация | Development |
| `info` | Общая информация | Development, тестирование |
| `warn` | Предупреждения | Production (по умолчанию) |
| `error` | Ошибки | Production |
| `fatal` | Критические ошибки | Всегда |

## Рекомендации для production

### Минимальное логирование
```bash
NODE_ENV=production
DISABLE_CONSOLE_LOGGING=true
ERROR_DASHBOARD_URL=https://errors.yourdomain.com/api
```
- Только ошибки отправляются в error-dashboard
- Нет консольного вывода
- Минимальная нагрузка на систему

### Полное отключение
```bash
NODE_ENV=production
DISABLE_LOGGING=true
```
- Только критические ошибки (fatal)
- Никакого вывода
- Максимальная производительность

### Отладка в production
```bash
NODE_ENV=production
DISABLE_ERROR_DASHBOARD_LOGGING=true
```
- Логи выводятся в консоль
- Нет отправки в error-dashboard
- Полезно для отладки

## Проверка текущей конфигурации

```typescript
import { LoggerFactory } from '@gafus/logger';

// Получить все созданные логгеры
const loggers = LoggerFactory.getAllLoggers();

loggers.forEach((logger, key) => {
  console.log(`Logger: ${key}`);
  // logger.getPinoLogger().level - текущий уровень
});
```

## Docker примеры

### Dockerfile с отключенным логированием
```dockerfile
ENV NODE_ENV=production
ENV DISABLE_LOGGING=true
```

### docker-compose.yml
```yaml
services:
  web:
    environment:
      - NODE_ENV=production
      - DISABLE_CONSOLE_LOGGING=true
      - ERROR_DASHBOARD_URL=https://errors.yourdomain.com/api
```

## Kubernetes примеры

### ConfigMap
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: logging-config
data:
  DISABLE_CONSOLE_LOGGING: "true"
  ERROR_DASHBOARD_URL: "https://errors.yourdomain.com/api"
```

### Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: web
        envFrom:
        - configMapRef:
            name: logging-config
```
