# VK ID: "Error loading" в эмуляторе Android

## Главная причина (документация VK ID)

**Redirect URI для мобильных** должен быть `vk{client_id}://vk.ru/blank.html`, а не `gafus://auth/vk`. «Доверенный Redirect URL» в консоли VK — только для HTTPS (web). Для mobile проверка идёт по package name + SHA-1 в настройках платформы. См. [id.vk.com/docs](https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/start-integration/auth-without-sdk/auth-without-sdk-android).

**Intent filter обязателен.** Без него на Android после нажатия «Разрешить» redirect не перехватывается. По документации VK ID redirect может приходить в двух форматах:
1. `vk{clientId}://vk.ru?payload={"code":"...","device_id":"...","state":"..."}` — без пути
2. `vk{clientId}://vk.ru/blank.html?code=...&state=...&device_id=...` — с путём

В `app.config.js` в intent filter добавлены оба варианта: `{ scheme, host }` для формата без path и `{ scheme, host, pathPrefix: "/blank.html" }` для формата с путём. **Важно:** в `openAuthSessionAsync` второй параметр (returnUrl) должен быть `vk{clientId}://vk.ru` (без `/blank.html`), т.к. expo-web-browser использует `event.url.startsWith(returnUrl)`, а Android возвращает `vk{id}://vk.ru?payload=...`. Требуется пересборка native (prebuild / EAS build). Переменная `VK_CLIENT_ID_ANDROID` должна быть задана при сборке.

## Гипотеза (подтверждена)

**Симптом:** При входе через VK ID в мобильном приложении на Android-эмуляторе страница `id.vk.ru` показывает "Error loading" / "Попробовать снова".

**Подтверждение:**
- Chrome в эмуляторе **открывает** `id.vk.ru` без ошибок
- Сеть работает: `ping id.vk.ru` успешен
- Ошибка возникает только при вызове `WebBrowser.openAuthSessionAsync` (Chrome Custom Tabs)

**Вывод:** Chrome Custom Tabs в контексте приложения ведёт себя иначе, чем отдельное приложение Chrome. Известные причины:
- Custom Tabs использует другой процесс/контекст, иные настройки сети, cookies
- OAuth в эмуляторе часто ненадёжен (react-native-app-auth #297, auth0/react-native-auth0 #449)
- Task stack и `singleTask` MainActivity могут влиять на lifecycle Custom Tabs (expo/expo #8072, #34160)

## Решения (best practices)

### 1. `createTask: false` — рекомендовано

Открывает браузер в той же task, что и приложение. Решает проблемы с task stack и redirect на Android 14+.

```typescript
const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri, {
  createTask: false, // Android: в той же task, лучше redirect и совместимость с эмулятором
});
```

**Источники:** expo/expo #12462, #34160, arieloO workaround (Feb 2025).

### 2. `mayInitWithUrlAsync` — предзагрузка

Предзагрузить URL до открытия auth session. Текущий код использует только `warmUpAsync`.

```typescript
if (Platform.OS === "android") {
  await WebBrowser.warmUpAsync();
  await WebBrowser.mayInitWithUrlAsync(authUrl); // предзагрузка auth URL
}
```

### 3. Plugin `expo-web-browser` (experimentalLauncherActivity)

Обязательно для корректной обработки redirect на Android. В `app.config.js`:

```javascript
plugins: [
  ...(config.plugins ?? []),
  ["expo-web-browser", { experimentalLauncherActivity: true }],
]
```

Предотвращает закрытие браузера при сворачивании и улучшает перехват redirect при нажатии «Разрешить». Требует **prebuild** / пересборку нативного кода.

**Примечание:** В Expo 55+ заменено на runtime-опцию `useProxyActivity` (по умолчанию `true`).

### 4. Wipe Data эмулятора

При повреждённой конфигурации эмулятора:

1. AVD Manager → эмулятор → Wipe Data
2. Переустановить приложение

**Источник:** FormidableLabs/react-native-app-auth #297.

### 5. Тестирование на физическом устройстве

OAuth и Custom Tabs в эмуляторе работают нестабильно. Основную проверку VK ID проводить на реальном Android через USB-отладку.

## Рекомендуемый порядок действий

1. Добавить `createTask: false` в `useVkLogin` и `useVkLink` (см. реализацию ниже)
2. Добавить `mayInitWithUrlAsync` перед `openAuthSessionAsync`
3. Если не помогло — Wipe Data эмулятора + переустановка
4. Для продакшена — валидация на физическом устройстве
