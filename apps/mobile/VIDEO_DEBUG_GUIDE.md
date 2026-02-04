# Гайд по отладке видео в мобильном приложении

## Детальное логирование

При работе в dev-режиме (`__DEV__ = true`) теперь выводятся подробные логи на каждом этапе загрузки и воспроизведения видео.

### Этап 1: Проверка URL

```
[useVideoUrl] Проверка URL: {
  videoUrl: "https://storage.yandexcloud.net/...",
  isCDNVideo: true
}
```

**Что проверять:**
- `isCDNVideo: true` - CDN видео требует signed URL
- `isCDNVideo: false` - внешнее видео (YouTube, VK), используется напрямую

### Этап 2: Запрос signed URL

```
[useVideoUrl] Запрос signed URL для CDN видео: https://storage...
[apiClient] Запрос: { endpoint: "/api/v1/training/video/url", ... }
```

**Что проверять:**
- `hasAuth: true` - токен авторизации передан
- `method: "POST"` - правильный HTTP метод

### Этап 3: Ответ от API

```
[apiClient] Ответ сервера: {
  success: true,
  hasData: true,
  status: 200,
  ...
}

[useVideoUrl] Ответ от API: {
  success: true,
  hasUrl: true,
  url: "https://api.gafus.ru/api/v1/training/video/:id/manifest?token=..."
}
```

**Что проверять:**
- `success: true` - API вернул успешный ответ
- `hasUrl: true` - signed URL получен
- `status: 200` - HTTP статус OK

### Этап 4: Создание source для Video

```
[VideoPlayer] Source: {
  uri: "https://api.gafus.ru/api/v1/training/video/.../manifest?token=...",
  sourceUri: "https://api.gafus.ru/...",
  overrideExtension: "m3u8",
  hasPoster: false,
  autoPlay: false
}
```

**Что проверять:**
- `uri` должен содержать `/manifest?token=`
- `overrideExtension: "m3u8"` - Android поймёт что это HLS
- URI не обрезан и полный

### Этап 5: Состояние воспроизведения

```
[VideoPlayer] Состояние: {
  uri: "https://api.gafus.ru/...",
  isLoaded: true/false,
  isPlaying: true/false,
  isBuffering: true/false,
  hasError: true/false,
  statusType: "loaded" | "not_loaded",
  error: null | "сообщение об ошибке"
}
```

**Состояния:**
- `isLoaded: false, isBuffering: true` - видео загружается (нормально)
- `isLoaded: true, isPlaying: false` - видео загружено, готово к воспроизведению
- `isLoaded: true, isPlaying: true` - видео воспроизводится
- `hasError: true` - ошибка воспроизведения

## Типичные проблемы и решения

### Проблема 1: "Ошибка загрузки видео" сразу при открытии

**Логи:**
```
[VideoPlayer] Состояние: {
  isLoaded: false,
  hasError: true,
  error: "..."
}
```

**Возможные причины:**
1. **Неправильный формат URL** - проверьте, что URL содержит `/manifest?token=`
2. **Токен истёк** - проверьте время жизни токена (по умолчанию 120 минут)
3. **Сервер недоступен** - проверьте доступность `https://api.gafus.ru`
4. **CORS проблемы** - проверьте настройки CORS на сервере

**Решение:**
- Проверьте логи API на сервере (см. logs API)
- Попробуйте открыть signed URL в браузере
- Проверьте срок действия токена

### Проблема 2: Видео бесконечно буферится

**Логи:**
```
[VideoPlayer] Состояние: {
  isLoaded: false,
  isBuffering: true,
  hasError: false
}
```

**Возможные причины:**
1. **Медленное соединение** - видео HLS требует стабильного интернета
2. **Проблема с сегментами** - API не отдаёт сегменты видео
3. **Проблема с манифестом** - формат манифеста некорректный

**Решение:**
- Проверьте скорость интернета
- Проверьте логи API для `/segment` endpoint
- Попробуйте другое видео

### Проблема 3: Ошибки "Operation Stopped"

**Логи:**
```
[VideoPlayer] Ошибка воспроизведения: Operation Stopped
```

**Это НЕ проблема!**
- Это нормальное поведение при закрытии/переключении шагов
- Автоматически игнорируется в новой версии
- Не требует действий

### Проблема 4: "КРИТИЧЕСКАЯ ошибка воспроизведения"

**Логи:**
```
[VideoPlayer] КРИТИЧЕСКАЯ ошибка воспроизведения: {
  error: "...",
  uri: "...",
  status: {...}
}
```

или

```
[VideoPlayer] ОШИБКА onError: {
  error: "...",
  errorMsg: "...",
  uri: "...",
  source: {...}
}
```

**Это реальная проблема, требует расследования!**

**Типичные ошибки и решения:**

#### "The server cannot service the request because the media type is not supported"
- **Причина:** Формат видео не поддерживается
- **Решение:** Проверьте транскодирование видео в HLS на сервере

#### "Network connection lost"
- **Причина:** Потеряно соединение при загрузке
- **Решение:** Проверьте стабильность интернета, попробуйте снова

#### "Manifest format not recognized"
- **Причина:** Манифест HLS некорректный
- **Решение:** Проверьте логи API, формат манифеста должен быть `.m3u8`

## Тестирование signed URL вручную

### В браузере
Откройте signed URL в браузере:
```
https://api.gafus.ru/api/v1/training/video/:id/manifest?token=...
```

Вы должны увидеть `.m3u8` манифест:
```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
https://api.gafus.ru/api/v1/training/video/:id/segment?path=segment_000.ts&token=...
#EXTINF:10.0,
https://api.gafus.ru/api/v1/training/video/:id/segment?path=segment_001.ts&token=...
...
```

### Через curl

```bash
# Получить токен
TOKEN=$(curl -s -X POST https://api.gafus.ru/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79999999999","password":"password"}' | jq -r '.data.accessToken')

# Получить signed URL
curl -s -X POST https://api.gafus.ru/api/v1/training/video/url \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"videoUrl":"https://storage.yandexcloud.net/gafus-media/uploads/videocourses/xxx/original.mp4"}' | jq

# Проверить манифест
SIGNED_URL=$(curl -s -X POST https://api.gafus.ru/api/v1/training/video/url \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"videoUrl":"..."}' | jq -r '.data.url')

curl -s "$SIGNED_URL" | head -20
```

## Checklist для отладки

Если видео не работает, проверьте по порядку:

1. ✅ Signed URL получен
   - Лог `[useVideoUrl] Ответ от API: { success: true, hasUrl: true }`

2. ✅ Source создан правильно
   - Лог `[VideoPlayer] Source: { uri: "...", overrideExtension: "m3u8" }`

3. ✅ Видео начало загружаться
   - Лог `[VideoPlayer] Состояние: { isBuffering: true }`

4. ✅ Видео загрузилось
   - Лог `[VideoPlayer] Состояние: { isLoaded: true }`

5. ✅ Нет критичных ошибок
   - Нет логов `[VideoPlayer] КРИТИЧЕСКАЯ ошибка` или `ОШИБКА onError`

6. ✅ Видео воспроизводится
   - Лог `[VideoPlayer] Состояние: { isPlaying: true }`

## Полезные команды

### Очистка кэша Metro
```bash
cd apps/mobile
npm start -- --reset-cache
```

### Пересборка приложения
```bash
# iOS
cd ios && pod install && cd ..
npm run ios

# Android
cd android && ./gradlew clean && cd ..
npm run android
```

### Просмотр логов в реальном времени

**iOS:**
```bash
npx react-native log-ios | grep VideoPlayer
```

**Android:**
```bash
adb logcat | grep -E "VideoPlayer|useVideoUrl|apiClient"
```
