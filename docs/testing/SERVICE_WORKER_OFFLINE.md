# Инструкция для проверки Service Worker в браузере

## Способ 1: Проверка через DevTools Console

1. Откройте `http://localhost:3002` в браузере
2. Откройте DevTools (F12)
3. Перейдите на вкладку **Console**
4. Выполните следующие команды:

```javascript
// Проверка регистрации Service Worker
navigator.serviceWorker.getRegistrations().then((regs) => {
  console.log("Зарегистрированные SW:", regs);
  if (regs.length > 0) {
    console.log("Активный SW:", regs[0].active);
    console.log("Ожидающий SW:", regs[0].waiting);
    console.log("Устанавливающийся SW:", regs[0].installing);
  }
});

// Проверка контроллера
console.log("SW Controller:", navigator.serviceWorker.controller);

// Симуляция офлайн-запроса через fetch
fetch("/", { cache: "no-cache" })
  .then((r) => r.text())
  .then((html) => {
    console.log("Ответ сервера (первые 500 символов):", html.substring(0, 500));
  })
  .catch((err) => {
    console.log("Ошибка fetch:", err.message);
  });
```

## Способ 2: Проверка через Network Tab

1. Откройте `http://localhost:3002` в браузере
2. Откройте DevTools → **Network**
3. Включите **Offline** (чекбокс или выпадающий список)
4. Обновите страницу (F5 или Cmd+R)
5. Проверьте запросы в Network tab:
   - Найдите запрос к `/` (главная страница)
   - Кликните на него
   - Посмотрите вкладку **Response** или **Preview**
   - Должен быть HTML с редиректом на `/~offline`

## Способ 3: Проверка через Application Tab

1. Откройте `http://localhost:3002` в браузере
2. Откройте DevTools → **Application**
3. В левом меню выберите **Service Workers**
4. Проверьте статус Service Worker:
   - Должен быть зарегистрирован
   - Статус должен быть "activated and is running"
5. Включите **Offline** в Network tab
6. Обновите страницу
7. Вернитесь в **Service Workers** и проверьте логи

## Способ 4: Проверка через перехват fetch в консоли

```javascript
// Перехватываем все fetch запросы
const originalFetch = window.fetch;
window.fetch = function (...args) {
  console.log("🔍 Fetch запрос:", args[0]);
  return originalFetch
    .apply(this, args)
    .then((response) => {
      console.log("✅ Fetch успешен:", args[0], response.status);
      return response;
    })
    .catch((error) => {
      console.log("❌ Fetch ошибка:", args[0], error.message);
      throw error;
    });
};

// Теперь включите Offline в Network tab и обновите страницу
// В консоли увидите все fetch запросы и их результаты
```

## Способ 5: Проверка ответа Service Worker напрямую

```javascript
// Проверяем, что Service Worker перехватывает запросы
navigator.serviceWorker.ready.then((registration) => {
  console.log("SW готов:", registration);

  // Пытаемся сделать запрос в офлайне
  // (сначала включите Offline в Network tab)
  fetch("/", { cache: "no-cache" })
    .then((response) => {
      console.log("Статус ответа:", response.status);
      console.log("Заголовки:", [...response.headers.entries()]);
      return response.text();
    })
    .then((html) => {
      console.log("HTML ответа (первые 1000 символов):");
      console.log(html.substring(0, 1000));

      // Проверяем содержимое
      if (html.includes("window.location.replace")) {
        console.log("✅ Содержит JavaScript редирект");
      }
      if (html.includes("/~offline")) {
        console.log("✅ Содержит ссылку на страницу офлайна");
      }
    })
    .catch((error) => {
      console.log("Ошибка:", error.message);
    });
});
```

## Ожидаемый результат

При включении офлайн-режима и обновлении страницы:

1. **В Network tab** должен быть запрос к `/` со статусом 200
2. **Response/Preview** должен содержать HTML с:
   - JavaScript кодом `window.location.replace('/~offline')`
   - Мета-тегом `<meta http-equiv="refresh" content="0;url=/~offline">`
   - Текстом "Нет соединения с сервером"
3. **Браузер должен автоматически перенаправить** на `/~offline`
4. **В консоли** должны быть логи от Service Worker (если включен SW_DEBUG)

## Отладка Service Worker

Если Service Worker не работает:

1. Проверьте регистрацию:

   ```javascript
   navigator.serviceWorker.getRegistrations().then(console.log);
   ```

2. Проверьте файл sw.js:
   - Откройте `http://localhost:3002/sw.js` в браузере
   - Убедитесь, что файл загружается

3. Обновите Service Worker:
   - DevTools → Application → Service Workers
   - Нажмите "Unregister"
   - Обновите страницу

4. Проверьте логи Service Worker:
   - DevTools → Application → Service Workers
   - Включите "Update on reload"
   - Обновите страницу
   - Посмотрите логи в консоли
