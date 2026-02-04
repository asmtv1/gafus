# Тестирование видео в мобильном приложении

## Быстрый старт

### 1. Запуск мобильного приложения

```bash
# Перейти в папку mobile
cd apps/mobile

# iOS (требуется Mac)
npm run ios

# Android
npm run android

# Или через Expo Go
npm start
```

### 2. Где проверить видео

1. Открыть любой курс в приложении
2. Перейти на страницу дня тренировки
3. Найти шаг с видео (будет иконка видео или теоретический/практический шаг)
4. Открыть шаг (нажать на аккордеон)
5. Видео должно отобразиться под описанием

### 3. Что проверить

#### Базовая работоспособность
- [ ] Видео отображается (не чёрный экран)
- [ ] Кнопка Play работает
- [ ] Видео начинает воспроизведение
- [ ] Звук воспроизводится

#### Контролы
- [ ] Play/Pause работает
- [ ] Progress bar показывает прогресс воспроизведения
- [ ] Можно перематывать через progress bar (клик/тап)
- [ ] Кнопки -10/+10 секунд работают
- [ ] Fullscreen работает (кнопка и выход)
- [ ] Время отображается правильно (00:00 / 00:00)

#### Обработка ошибок
- [ ] При ошибке загрузки показывается сообщение "Ошибка загрузки видео"
- [ ] При загрузке показывается индикатор (spinner)

## Логи для отладки

Откройте консоль Metro/Expo и найдите логи:

```
[useVideoUrl] Проверка URL: ...
[useVideoUrl] Запрос signed URL для CDN видео: ...
[useVideoUrl] Ответ от API: { success: true, hasUrl: true, url: "https://api.gafus.ru/..." }
[VideoPlayer] Source: { uri: "https://api.gafus.ru/...", overrideExtension: "m3u8" }
```

### Признаки проблем:

**Проблема 1: Видео не загружается**
```
[useVideoUrl] Ошибка запроса: ...
[VideoPlayer] Ошибка воспроизведения: ...
```
→ Проверьте API_BASE_URL в `apps/mobile/src/constants.ts`
→ Проверьте авторизацию (токен)

**Проблема 2: Чёрный экран**
```
[VideoPlayer] Source: { uri: "https://...", overrideExtension: "m3u8" }
```
Но видео не грузится
→ Проверьте signed URL (откройте в браузере)
→ Проверьте VIDEO_ACCESS_SECRET на сервере

**"Ошибка" "Operation Stopped" (не проблема)**
```
[VideoPlayer] Ошибка видео: Operation Stopped
```
→ Это нормальное поведение при закрытии/переключении шагов
→ Автоматически игнорируется в логах, не требует действий
→ Не влияет на воспроизведение видео

## Отладка на реальном устройстве

### iOS (требуется Mac)
1. Подключите iPhone через USB
2. Откройте Xcode
3. Выберите устройство в списке
4. `npm run ios`

### Android
1. Подключите Android через USB
2. Включите режим разработчика
3. Разрешите USB отладку
4. `npm run android`

### Просмотр логов

#### iOS
```bash
npx react-native log-ios
```

#### Android
```bash
npx react-native log-android
# или
adb logcat *:S ReactNative:V ReactNativeJS:V
```

## Проверка API

Можно проверить API напрямую через curl:

```bash
# Получить токен (замените на свои credentials)
TOKEN=$(curl -s -X POST https://api.gafus.ru/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79999999999","password":"password"}' | jq -r '.data.accessToken')

# Проверить endpoint /video/url
curl -s -X POST https://api.gafus.ru/api/v1/training/video/url \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"videoUrl":"https://storage.yandexcloud.net/gafus-media/uploads/videocourses/xxx/original.mp4"}' | jq
```

Ожидаемый ответ:
```json
{
  "success": true,
  "data": {
    "url": "https://api.gafus.ru/api/v1/training/video/:id/manifest?token=..."
  }
}
```

## Известные ограничения

1. **Android HLS**: На Android может потребоваться дополнительное время для буферизации
2. **iOS автоплей**: На iOS автоплей может быть заблокирован системой, нужно нажать Play вручную
3. **Сетевые ограничения**: При медленном интернете видео может грузиться долго

## Что делать если не работает

1. Проверьте логи в консоли (см. выше)
2. Проверьте API endpoint (см. curl команды)
3. Проверьте авторизацию (токен должен быть валидным)
4. Проверьте VIDEO_ACCESS_SECRET на сервере
5. Откройте Issue в репозитории с логами и описанием проблемы
