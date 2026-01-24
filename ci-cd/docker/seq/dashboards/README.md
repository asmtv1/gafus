# Seq Dashboards

JSON файлы для дашбордов в Seq для мониторинга логов контейнеров.

## Доступные дашборды

- **web-dashboard.json** - Логи Web приложения (gafus-web)
- **trainer-panel-dashboard.json** - Логи Trainer Panel (gafus-trainer-panel)
- **error-dashboard-dashboard.json** - Логи Error Dashboard (gafus-error-dashboard)
- **admin-panel-dashboard.json** - Логи Admin Panel (gafus-admin-panel)
- **worker-dashboard.json** - Логи Worker (gafus-worker)
- **telegram-bot-dashboard.json** - Логи Telegram Bot (gafus-telegram-bot)
- **errors-dashboard.json** - Общий дашборд всех ошибок (Error, Fatal, Warning)

## Структура каждого дашборда

Каждый дашборд содержит 3 графика:

1. **Events Over Time** - Линейный график количества событий по времени
2. **Log Levels Distribution** - Столбчатая диаграмма распределения по уровням логов
3. **Recent Events** - Таблица последних 50 событий с временными метками и уровнями

## Импорт через API

```bash
# Установите переменные окружения
export SEQ_URL="http://your-seq-server:5341"
export SEQ_API_KEY="your-api-key"

# Импорт всех дашбордов
cd ci-cd/docker/seq/dashboards

for file in *.json; do
  echo "Importing $file..."
  curl -X POST "$SEQ_URL/api/dashboards" \
    -H "Content-Type: application/json" \
    -H "X-Seq-ApiKey: $SEQ_API_KEY" \
    -d @"$file"
done
```

## Импорт вручную через веб-интерфейс

Если API не работает (например, в Personal edition Seq):

1. Откройте Seq: `http://your-seq-server:5341`
2. Перейдите в раздел **Dashboards**
3. Нажмите **New Dashboard**
4. Скопируйте содержимое нужного JSON файла
5. В консоли браузера (F12) выполните:

```javascript
// Получите токен авторизации из cookies или заголовков запросов
const dashboard = {
  /* вставьте JSON из файла */
};

fetch("/api/dashboards", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Seq-ApiKey": "your-api-key", // или используйте токен из сессии
  },
  body: JSON.stringify(dashboard),
})
  .then((r) => r.json())
  .then(console.log)
  .catch(console.error);
```

## Альтернативный способ через интерфейс

1. Откройте Seq → **Dashboards** → **New Dashboard**
2. Для каждого графика в JSON:
   - Добавьте **New Chart**
   - Скопируйте настройки из секции `Queries[0]` в редактор запроса
   - Установите тип визуализации из `DisplayStyle.Type`
   - Настройте размер из `DisplayStyle.WidthColumns` и `DisplayStyle.HeightRows`

## Примечания

- Поля `Id` и `Links` можно оставить `null` - они будут заполнены Seq автоматически
- `OwnerId` обычно `"user-admin"` для Personal edition
- Фильтры в `Where` используют поле `ContainerName`, которое должно быть заполнено Vector
