# Резюме: Исправление видео в мобильном приложении

## Статус: ✅ Готово к тестированию

Все критичные проблемы с воспроизведением видео в мобильном приложении исправлены.

## Основная проблема

Видео не воспроизводилось из-за того, что в компонент `Video` из expo-av передавался `source={undefined}` вместо реального source объекта.

## Исправленные файлы

### 1. `apps/mobile/src/shared/components/VideoPlayer.tsx`

**Критичные исправления:**
- ✅ Исправлена передача source: `source={undefined}` → `source={source}`
- ✅ Улучшена функция `getVideoSource` для правильного определения HLS
- ✅ Добавлена поддержка API endpoints с токеном (`/video/:id/manifest?token=...`)
- ✅ Исправлены TypeScript типы для `AVPlaybackStatus` и `VideoFullscreenUpdate`
- ✅ Добавлено отображение ошибок в UI
- ✅ Улучшено логирование для отладки

**Технические детали:**
```typescript
// До: source не передавался
<Video ref={videoRef} source={undefined} ... />

// После: source передаётся правильно
<Video ref={videoRef} source={source} ... />

// где source = { uri: signedUrl, overrideFileExtensionAndroid: "m3u8" }
```

### 2. `apps/mobile/src/shared/hooks/useVideoUrl.ts`

**Улучшения:**
- ✅ Добавлено подробное логирование всех этапов
- ✅ Улучшена обработка ошибок
- ✅ Логируются все запросы/ответы API в dev режиме

### 3. Архитектура (уже работала корректно)

API endpoints уже были реализованы правильно:
- ✅ `POST /api/v1/training/video/url` - получение signed URL
- ✅ `GET /api/v1/training/video/:id/manifest` - проксирование HLS манифеста
- ✅ `GET /api/v1/training/video/:id/segment` - проксирование сегментов

## Поток работы видео

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. AccordionStep получает videoUrl из API (CDN URL)             │
│    Example: https://storage.yandexcloud.net/.../video.mp4       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. useVideoUrl определяет что это CDN видео                     │
│    → вызывает trainingApi.getVideoUrl(videoUrl)                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. trainingApi.getVideoUrl() отправляет POST запрос              │
│    POST /api/v1/training/video/url                              │
│    Body: { videoUrl: "..." }                                    │
│    Headers: { Authorization: "Bearer <token>" }                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. API возвращает signed URL с токеном                          │
│    Response: {                                                  │
│      success: true,                                             │
│      data: {                                                    │
│        url: "https://api.gafus.ru/api/v1/training/video/       │
│              :videoId/manifest?token=<jwt>"                     │
│      }                                                          │
│    }                                                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. VideoPlayer получает signed URL                              │
│    → getVideoSource() добавляет overrideFileExtensionAndroid    │
│    → source = {                                                 │
│        uri: signed_url,                                         │
│        overrideFileExtensionAndroid: "m3u8"                     │
│      }                                                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. expo-av Video component загружает видео                      │
│    → Запрашивает манифест с сервера                             │
│    → API проверяет токен и проксирует манифест                  │
│    → Для каждого сегмента проксирует через /segment             │
└─────────────────────────────────────────────────────────────────┘
```

## Тестирование

### Запуск приложения

```bash
cd apps/mobile

# iOS (требуется Mac)
npm run ios

# Android
npm run android
```

### Что проверить

**Базовая работоспособность:**
- [ ] Видео отображается (не чёрный экран)
- [ ] Кнопка Play работает
- [ ] Видео воспроизводится со звуком
- [ ] Progress bar обновляется

**Контролы:**
- [ ] Play/Pause
- [ ] Seek (-10/+10 секунд)
- [ ] Progress bar (клик/тап)
- [ ] Fullscreen
- [ ] Таймер времени

**Обработка ошибок:**
- [ ] Индикатор загрузки показывается
- [ ] Ошибки отображаются в UI

### Логи для проверки

Откройте Metro/Expo консоль:

```
✅ Правильная работа:
[useVideoUrl] Проверка URL: { videoUrl: "...", isCDNVideo: true }
[useVideoUrl] Запрос signed URL для CDN видео: ...
[useVideoUrl] Ответ от API: { success: true, hasUrl: true, url: "https://api.gafus.ru/..." }
[VideoPlayer] Source: { uri: "https://...", overrideExtension: "m3u8" }

❌ Признаки проблем:
[useVideoUrl] Ошибка запроса: ...
[VideoPlayer] Ошибка воспроизведения: ...
```

## Известные ограничения

1. **Остальные TypeScript ошибки** (не критичны для видео):
   - Ошибки в `AccordionStep.tsx` связаны с типом `UserStep`
   - Ошибки в UI компонентах (Card, Input)
   - Ошибки в stores (stepStore, courseStore)
   - Эти ошибки не блокируют работу приложения

2. **Требования к среде:**
   - Должен быть доступен API сервер (https://api.gafus.ru)
   - Должен быть установлен VIDEO_ACCESS_SECRET на сервере
   - Пользователь должен быть авторизован

## Что дальше

### Приоритет 1: Тестирование
1. Запустить на iOS/Android эмуляторе
2. Проверить работу видео по чеклисту
3. Проверить на реальном устройстве

### Приоритет 2: Исправление типов (опционально)
1. Исправить типы `UserStep` в `AccordionStep.tsx`
2. Исправить типы в UI компонентах (Card, Input)
3. Исправить типы в stores

### Приоритет 3: Улучшения (будущее)
1. Offline кэширование видео
2. Индикатор прогресса загрузки с процентами
3. Настройки качества видео
4. Picture-in-Picture режим

## Файлы для проверки

Основные файлы, которые были изменены:

```
apps/mobile/src/shared/components/VideoPlayer.tsx      (✅ Исправлено)
apps/mobile/src/shared/hooks/useVideoUrl.ts            (✅ Улучшено)
apps/mobile/VIDEO_FIXES.md                             (📝 Документация)
MOBILE_VIDEO_TEST.md                                   (📝 Гайд по тестированию)
```

## Контакты для вопросов

Если возникнут проблемы при тестировании:
1. Проверьте логи в консоли (см. выше)
2. Проверьте API endpoint через curl (см. MOBILE_VIDEO_TEST.md)
3. Откройте Issue в репозитории с логами
