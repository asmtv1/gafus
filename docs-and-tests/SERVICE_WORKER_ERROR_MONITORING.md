# 🔍 Мониторинг ошибок Service Worker

## Проблема

Ошибки Service Worker не попадали в систему мониторинга ошибок `@http://errors.gafus.localhost/` по следующим причинам:

### 1. **Изолированный контекст**

- Service Worker работает в отдельном потоке
- Не связан с основным приложением
- Имеет свой собственный контекст выполнения

### 2. **Типы ошибок**

- `A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received`
- Это не JavaScript ошибка, а ошибка жизненного цикла SW
- Не перехватывается стандартными обработчиками

### 3. **Фоновое выполнение**

- Ошибки происходят в фоновом режиме
- Не видны в консоли браузера
- Не попадают в глобальный обработчик ошибок

## Решение

### ✅ Добавлена система мониторинга для Service Worker

#### 1. **ErrorReporter для SW**

```javascript
const errorReporter = {
  async reportError(error, context = {}) {
    // Отправляет ошибки в дашборд
    await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        context: { ...context, serviceWorker: true },
      }),
    });
  },
};
```

#### 2. **Глобальные обработчики ошибок**

```javascript
// Обработчик ошибок
self.addEventListener("error", (event) => {
  errorReporter.reportError(event.error, {
    event: "error",
    filename: event.filename,
    lineno: event.lineno,
  });
});

// Обработчик необработанных отклонений промисов
self.addEventListener("unhandledrejection", (event) => {
  errorReporter.reportError(new Error(event.reason), {
    event: "unhandledrejection",
  });
});
```

#### 3. **Специальный обработчик для ошибок канала связи**

```javascript
// Перехватываем ошибки с закрытым каналом
const originalPostMessage = MessagePort.prototype.postMessage;
MessagePort.prototype.postMessage = function (message, transfer) {
  try {
    return originalPostMessage.call(this, message, transfer);
  } catch (error) {
    if (error.message.includes("message channel closed")) {
      errorReporter.reportError(error, {
        type: "message_channel_error",
      });
    }
    throw error;
  }
};
```

#### 4. **Обработка асинхронных функций**

```javascript
// Оборачиваем функции для автоматического отлова ошибок
wrapAsync(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      await this.reportError(error, {
        function: fn.name || 'anonymous'
      });
      throw error;
    }
  };
}
```

## 🎯 Результат

Теперь все ошибки Service Worker будут:

1. **Отправляться в дашборд** `@http://errors.gafus.localhost/`
2. **Логироваться в консоль** для отладки
3. **Содержать контекст** о том, что ошибка произошла в SW
4. **Включать метаданные** о событии и параметрах

## 📊 Типы отслеживаемых ошибок

- ❌ Ошибки загрузки Workbox
- ❌ Ошибки обработки push-уведомлений
- ❌ Ошибки парсинга данных
- ❌ Ошибки показа уведомлений
- ❌ Ошибки клика по уведомлениям
- ❌ Ошибки реподписки на push
- ❌ Ошибки сообщений между потоками
- ❌ Ошибки с закрытым каналом связи
- ❌ Необработанные отклонения промисов

## 🔧 Использование

После обновления Service Worker все ошибки автоматически будут отправляться в систему мониторинга. Проверьте дашборд по адресу:

**http://errors.gafus.localhost/**

## 📝 Логи

Ошибки Service Worker будут отображаться с тегом `serviceWorker: true` и дополнительным контекстом о типе события.
