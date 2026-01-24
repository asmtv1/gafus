# Настройка дашбордов в Seq

## Обзор

В Seq можно создавать дашборды для визуализации логов по контейнерам и мониторинга ошибок. Vector использует `docker_logs` source type и автоматически отправляет логи в Seq с полем `ContainerName`, что позволяет фильтровать логи по контейнерам.

## Структура логов в Seq

Vector использует `docker_logs` source type, который автоматически предоставляет метаданные контейнеров. Логи отправляются в Seq в формате CLEF со следующими полями:

- `ContainerName` - имя контейнера из Docker API (например, `gafus-web`) - **автоматически из docker_logs source**
- `ContainerId` - ID контейнера Docker
- `Stream` - `stdout` или `stderr`
- `App` - название приложения из Pino (если есть: `web`, `trainer-panel`, `worker`, `error-dashboard`, `admin-panel`, `telegram-bot`)
- `Context` - контекст из Pino (если есть)
- `Level` - уровень лога: `Information`, `Warning`, `Error`, `Fatal`, `Debug`, `Verbose`
- `Message` - текст сообщения (`@m` в CLEF)
- `Exception` - stack trace (если есть)
- `Environment` - окружение (`production`)

### Как Vector определяет ContainerName

1. **Приоритет 1**: Поле `App` из Pino логов (для наших приложений)
   - `web` → `gafus-web`
   - `trainer-panel` → `gafus-trainer-panel`
   - `error-dashboard` → `gafus-error-dashboard`
   - `admin-panel` → `gafus-admin-panel`
   - `worker` → `gafus-worker`
   - `telegram-bot` → `gafus-telegram-bot`

2. **Приоритет 2**: Метаданные из `docker_logs` source (автоматически предоставляются Docker API)

3. **Fallback**: `container-{container_id}` если имя не удалось определить

## Автоматическая настройка

### Импорт готовых дашбордов через JSON

В проекте подготовлены готовые JSON файлы для всех дашбордов в `ci-cd/docker/seq/dashboards/`:

- `web-dashboard.json` - Web приложение
- `trainer-panel-dashboard.json` - Trainer Panel
- `error-dashboard-dashboard.json` - Error Dashboard
- `admin-panel-dashboard.json` - Admin Panel
- `worker-dashboard.json` - Worker
- `telegram-bot-dashboard.json` - Telegram Bot
- `errors-dashboard.json` - Общий дашборд всех ошибок

#### Импорт через скрипт

```bash
# Установите переменные окружения
export SEQ_URL=http://your-seq-server:5341
export SEQ_API_KEY=your-api-key

# Запустите скрипт импорта
./scripts/import-seq-dashboards.sh
```

#### Импорт вручную через API

```bash
# Для каждого JSON файла
curl -X POST "http://your-seq-server:5341/api/dashboards" \
  -H "Content-Type: application/json" \
  -H "X-Seq-ApiKey: your-api-key" \
  -d @ci-cd/docker/seq/dashboards/web-dashboard.json
```

#### Импорт через веб-интерфейс

1. Откройте Seq → **Dashboards** → **New Dashboard**
2. Откройте консоль браузера (F12)
3. Выполните:

```javascript
// Замените JSON содержимым из файла
const dashboard = {
  /* JSON из файла */
};

fetch("/api/dashboards", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Seq-ApiKey": "your-api-key",
  },
  body: JSON.stringify(dashboard),
})
  .then((r) => r.json())
  .then((data) => {
    console.log("Dashboard created:", data);
    window.location.reload(); // Обновить страницу для просмотра
  })
  .catch(console.error);
```

### Использование скрипта настройки

Альтернативный способ через Node.js скрипт (может не работать в Personal edition):

```bash
# Установите URL Seq (если отличается от дефолтного)
export SEQ_URL=http://localhost:5341

# Если Seq защищен API ключом
export SEQ_API_KEY=your-api-key

# Запустите скрипт
node scripts/setup-seq-dashboards.js
```

**Примечание**: Если Seq API недоступен (возвращает 404), скрипт автоматически выведет инструкции для ручной настройки.

### Что создает скрипт

1. **Сигналы** (фильтры) для каждого контейнера:
   - `Logs: Web Application` - фильтр: `ContainerName = 'gafus-web'`
   - `Logs: Trainer Panel` - фильтр: `ContainerName = 'gafus-trainer-panel'`
   - `Logs: Error Dashboard` - фильтр: `ContainerName = 'gafus-error-dashboard'`
   - `Logs: Admin Panel` - фильтр: `ContainerName = 'gafus-admin-panel'`
   - `Logs: Worker` - фильтр: `ContainerName = 'gafus-worker'`
   - `Logs: Telegram Bot` - фильтр: `ContainerName = 'gafus-telegram-bot'`

2. **Сигнал для ошибок**:
   - `Errors - All Containers` - фильтр: `Level in ('Error', 'Fatal', 'Warning')`

3. **Дашборды** для каждого контейнера с логами

4. **Общий дашборд** с ошибками и предупреждениями

## Ручная настройка

Если автоматическая настройка не работает или нужна кастомизация, можно создать дашборды вручную через веб-интерфейс Seq.

### Шаг 1: Создание сигналов для контейнеров

Для каждого контейнера приложения создайте сигнал:

1. Откройте Seq: `http://localhost:5341` (или ваш URL)
2. В поиске введите фильтр: `ContainerName = 'gafus-web'`
3. Убедитесь, что логи отображаются
4. Нажмите **"Save as signal"** (или "Save query as signal")
5. Укажите название: `Logs: Web Application`
6. Сохраните

Повторите для всех контейнеров:

- `ContainerName = 'gafus-trainer-panel'` → Сигнал: `Logs: Trainer Panel`
- `ContainerName = 'gafus-error-dashboard'` → Сигнал: `Logs: Error Dashboard`
- `ContainerName = 'gafus-admin-panel'` → Сигнал: `Logs: Admin Panel`
- `ContainerName = 'gafus-worker'` → Сигнал: `Logs: Worker`
- `ContainerName = 'gafus-telegram-bot'` → Сигнал: `Logs: Telegram Bot`

### Шаг 2: Создание сигнала для ошибок

1. В поиске введите фильтр: `Level in ('Error', 'Fatal', 'Warning')`
2. Нажмите **"Save as signal"**
3. Название: `Errors - All Containers`
4. Сохраните

### Шаг 3: Создание дашбордов для контейнеров

Для каждого контейнера создайте отдельный дашборд:

1. Перейдите в раздел **"Dashboards"**
2. Нажмите **"New Dashboard"** (или "+ New Dashboard")
3. Укажите название: `Web Application` (или название контейнера)
4. Добавьте виджеты:

#### Виджет 1: Timeline график логов

- **Тип**: Timeline (или Line Chart)
- **Сигнал**: `Logs: Web Application`
- **Настройки**:
  - Group by: `Level` (для группировки по уровням)
  - Time range: `Last 1 hour` (или нужный диапазон)
  - Y-axis: Count of events

#### Виджет 2: Таблица последних логов

- **Тип**: Table
- **Сигнал**: `Logs: Web Application`
- **Колонки**: `Timestamp`, `Level`, `Message`, `Context` (если есть)
- **Настройки**:
  - Rows: 50 (или нужное количество)
  - Sort by: `Timestamp` (descending)

#### Виджет 3: Статистика по уровням логов

- **Тип**: Bar Chart (или Pie Chart)
- **Сигнал**: `Logs: Web Application`
- **Настройки**:
  - Group by: `Level`
  - Metric: Count of events
  - Time range: `Last 24 hours`

5. Сохраните дашборд

Повторите для всех контейнеров приложений.

### Шаг 4: Создание дашборда с ошибками

Создайте общий дашборд для мониторинга всех ошибок:

1. Создайте новый дашборд: **"Errors - All Containers"**

2. Добавьте виджеты:

#### Виджет 1: Timeline график ошибок

- **Тип**: Timeline
- **Сигнал**: `Errors - All Containers`
- **Настройки**:
  - Group by: `Level`
  - Time range: `Last 24 hours`

#### Виджет 2: Распределение ошибок по контейнерам

- **Тип**: Bar Chart
- **Сигнал**: `Errors - All Containers`
- **Настройки**:
  - Group by: `ContainerName`
  - Metric: Count of events
  - Time range: `Last 24 hours`

#### Виджет 3: Распределение по уровням

- **Тип**: Pie Chart (или Bar Chart)
- **Сигнал**: `Errors - All Containers`
- **Настройки**:
  - Group by: `Level`
  - Metric: Count of events
  - Time range: `Last 24 hours`

#### Виджет 4: Таблица последних ошибок

- **Тип**: Table
- **Сигнал**: `Errors - All Containers`
- **Колонки**: `Timestamp`, `ContainerName`, `Level`, `Message`, `Exception` (если есть)
- **Настройки**:
  - Rows: 100
  - Sort by: `Timestamp` (descending)
  - Filter: `Level = 'Error' or Level = 'Fatal'` (только критические ошибки)

3. Сохраните дашборд

## Фильтры для дашбордов

### По контейнеру

```
ContainerName = 'gafus-web'
```

### По уровню лога

```
Level = 'Error'
Level = 'Warning'
Level = 'Fatal'
Level in ('Error', 'Fatal', 'Warning')
```

### Комбинированные фильтры

Ошибки конкретного контейнера:

```
ContainerName = 'gafus-web' and Level in ('Error', 'Fatal')
```

Ошибки с контекстом:

```
Level = 'Error' and Context != null
```

Ошибки с stack trace:

```
Level in ('Error', 'Fatal') and Exception != null
```

### По приложению (из Pino)

Если нужно фильтровать по полю `App` из Pino:

```
App = 'web'
App = 'worker'
```

### По времени

```
Timestamp > @2024-01-01T00:00:00Z
```

## Рекомендуемые виджеты

### Для дашбордов контейнеров

1. **Timeline график** - визуализация потока логов во времени
2. **Таблица логов** - детальный просмотр последних событий
3. **Статистика по уровням** - распределение Information/Warning/Error/Fatal
4. **Rate of events** - количество событий в секунду/минуту

### Для дашборда ошибок

1. **Timeline ошибок** - график ошибок по времени
2. **Распределение по контейнерам** - какой контейнер генерирует больше ошибок
3. **Распределение по уровням** - Error vs Warning vs Fatal
4. **Таблица ошибок** - детальный список с stack traces
5. **Top ошибок** - наиболее частые сообщения об ошибках

## Troubleshooting

### Поле ContainerName отсутствует в логах

1. Проверьте, что Vector использует `docker_logs` source type:

   ```bash
   docker exec gafus-vector cat /etc/vector/vector.toml | grep "type = \"docker_logs\""
   ```

2. Убедитесь, что Vector перезапущен после изменения конфигурации:

   ```bash
   docker restart gafus-vector
   ```

3. Проверьте логи Vector на наличие ошибок:

   ```bash
   docker logs gafus-vector | tail -50
   ```

4. Проверьте, что логи поступают в Seq:
   - Откройте Seq и выполните поиск без фильтров
   - Убедитесь, что видны логи с полем `ContainerName`

### Дашборды не отображают данные

1. **Проверьте сигналы**:
   - Убедитесь, что сигнал существует и фильтр корректен
   - Проверьте, что имя контейнера точно совпадает (с учетом регистра)
   - Выполните поиск с фильтром сигнала вручную - логи должны отображаться

2. **Проверьте временной диапазон**:
   - Убедитесь, что выбранный временной диапазон содержит логи
   - Попробуйте увеличить диапазон (например, "Last 24 hours")

3. **Проверьте фильтры виджетов**:
   - Убедитесь, что виджет использует правильный сигнал
   - Проверьте дополнительные фильтры в настройках виджета

### ContainerName показывает "unknown" или "container-{id}"

Это означает, что Vector не смог определить имя контейнера. Проверьте:

1. **Для приложений с Pino логами**:
   - Убедитесь, что приложение логирует с полем `app` в Pino
   - Проверьте маппинг в `vector.toml` в transform `add_container_name`

2. **Для всех контейнеров**:
   - Убедитесь, что `docker_logs` source правильно настроен
   - Проверьте доступность Docker socket: `/var/run/docker.sock`

3. **Проверьте логи Vector**:
   ```bash
   docker logs gafus-vector | grep -i "container_name\|error"
   ```

### Логи не поступают в Seq

1. Проверьте, что Vector запущен:

   ```bash
   docker ps | grep vector
   ```

2. Проверьте доступность Seq:

   ```bash
   curl http://localhost:5341/api
   ```

3. Проверьте логи Vector:

   ```bash
   docker logs gafus-vector | tail -100
   ```

4. Проверьте сеть Docker:
   - Vector должен иметь доступ к контейнеру `seq` по имени
   - Проверьте, что `seq` запущен: `docker ps | grep seq`

### Фильтры не работают

1. **Проверьте синтаксис фильтра**:
   - Используйте одинарные кавычки для строк: `ContainerName = 'gafus-web'`
   - Для множественных значений: `Level in ('Error', 'Fatal')`
   - Для логических операций: `ContainerName = 'gafus-web' and Level = 'Error'`

2. **Проверьте имена полей**:
   - Используйте точное имя поля (с учетом регистра)
   - В Seq поля отображаются в панели свойств события

3. **Используйте автодополнение**:
   - При вводе фильтра в Seq используется автодополнение
   - Выберите поле из списка для правильного синтаксиса

## Обновление дашбордов

При добавлении новых контейнеров:

1. Добавьте контейнер в список `CONTAINERS` в `scripts/setup-seq-dashboards.js`
2. Запустите скрипт повторно
3. Или создайте дашборд вручную через веб-интерфейс Seq

## Дополнительные ресурсы

- [Seq Documentation](https://docs.datalust.co/docs)
- [Seq Query Syntax](https://docs.datalust.co/docs/query-syntax)
- [Seq Dashboards Guide](https://docs.datalust.co/docs/dashboards)
- [Vector Documentation](https://vector.dev/docs/)
- [Vector docker_logs Source](https://vector.dev/docs/reference/configuration/sources/docker_logs/)
