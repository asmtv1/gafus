# Исправления видео в мобильном приложении

## Проблема
Видео не воспроизводилось в мобильном приложении из-за того, что `source` не передавался в компонент `Video` из expo-av.

## Исправления

### 1. VideoPlayer.tsx
- **Основная проблема**: `source={undefined}` → исправлено на `source={source}`
- Улучшена функция `getVideoSource`:
  - Добавлена поддержка API endpoints с токеном (`/video/:id/manifest?token=...`)
  - Правильная установка `overrideFileExtensionAndroid: "m3u8"` для HLS
- Добавлено отображение ошибок в UI
- Улучшено логирование для отладки
- Убрана конфликтующая логика `loadAsync` (т.к. source теперь передаётся напрямую)

### 2. useVideoUrl.ts
- Добавлено подробное логирование всех этапов загрузки
- Улучшена обработка ошибок с понятными сообщениями

### 3. API (уже работает)
- Endpoint `/api/v1/training/video/url` корректно возвращает signed URLs
- Endpoint `/api/v1/training/video/:videoId/manifest` проксирует HLS манифест с токенами
- Endpoint `/api/v1/training/video/:videoId/segment` проксирует сегменты видео

## Архитектура работы видео

```
1. AccordionStep получает videoUrl из API (CDN URL)
   ↓
2. useVideoUrl определяет, что это CDN → вызывает trainingApi.getVideoUrl()
   ↓
3. trainingApi.getVideoUrl() отправляет POST /api/v1/training/video/url
   ↓
4. API возвращает signed URL: https://api.gafus.ru/api/v1/training/video/:id/manifest?token=...
   ↓
5. VideoPlayer получает signed URL и передаёт в Video component
   ↓
6. expo-av загружает манифест с токеном
   ↓
7. API проксирует манифест и сегменты с проверкой токена
```

## Логирование для отладки

При `__DEV__ = true` в консоли будут логи:

```
[useVideoUrl] Проверка URL: { videoUrl, isCDNVideo }
[useVideoUrl] Запрос signed URL для CDN видео: ...
[useVideoUrl] Ответ от API: { success, hasUrl, url }
[VideoPlayer] Source: { uri, sourceUri, overrideExtension }
[VideoPlayer] Ошибка воспроизведения: ... (если есть КРИТИЧНАЯ ошибка)
```

**Примечание**: Ошибка "Operation Stopped" автоматически игнорируется в логах - это нормальное поведение при закрытии/переключении шагов, не требует действий.

## Тестирование

### Проверка на iOS
```bash
cd apps/mobile
npm run ios
```

### Проверка на Android
```bash
cd apps/mobile
npm run android
```

### Чеклист:
- [ ] CDN видео загружается и получает signed URL
- [ ] Видео начинает воспроизведение
- [ ] Контролы работают (play/pause, seek, fullscreen)
- [ ] Progress bar отображается правильно
- [ ] Ошибки отображаются в UI при проблемах с загрузкой
- [ ] Внешние видео (YouTube, VK) работают (если поддерживаются)

## Известные проблемы

1. **TypeScript ошибки** в `AccordionStep.tsx` и `[dayId].tsx`:
   - Связаны с типами `UserStep` (вложенная структура `step`)
   - Не блокируют работу, нужно исправить для чистоты кода
   - План: добавить типы-помощники для работы с обеими структурами

## Дальнейшие улучшения

1. Добавить кэширование видео для offline режима
2. Добавить индикатор загрузки с процентами
3. Добавить настройки качества видео (если API поддерживает adaptive streaming)
4. Добавить Picture-in-Picture для iOS/Android
