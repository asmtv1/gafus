# План миграции: один CUID для видео (устранение UUID в путях CDN)

## Цель

Убрать антипаттерн «два идентификатора»: в путях CDN и в БД везде использовать только `TrainerVideo.id` (CUID). После миграции в `checkVideoAccess` остаётся только проверка по `videoId` (CUID).

## Текущее состояние

| Место | Сейчас | После миграции |
|-------|--------|-----------------|
| Загрузка (uploadTrainerVideoAction) | Путь: `videocourses/{randomUUID()}/` | Путь: `videocourses/{CUID}/` |
| TrainerVideo.relativePath | `uploads/.../videocourses/{UUID}/original.*` | `uploads/.../videocourses/{CUID}/...` |
| TrainerVideo.hlsManifestPath | Уже `.../videocourses/{CUID}/hls/playlist.m3u8` (воркер использует video.id) | Без изменений |
| Step.videoUrl / StepTemplate.videoUrl / Course.videoUrl | Полный CDN URL с UUID в пути | Полный CDN URL с CUID в пути |
| checkVideoAccess | Поиск по videoId + relativePath + hlsManifestPath | Только по videoId |

Важно: воркер транскодирования уже пишет HLS в путь с CUID (`videoId` из job = `video.id`). Оригинал после транскодирования удаляется. Значит у уже транскодированных видео на CDN остаётся только папка с CUID (HLS); в БД при этом `relativePath` всё ещё указывает на старый UUID-путь (к удалённому оригиналу).

---

## Этап 0: Подготовка

1. **Бэкап БД** перед миграцией (снапшот или дамп).
2. **Добавить в пакет `@gafus/cdn-upload`** функцию копирования в том же бакете:
   - Вариант A: `copyObjectInCDN(sourceRelativePath, destRelativePath)` — один объект (S3 `CopyObjectCommand`).
   - Вариант B: для папки — список объектов по префиксу + копирование каждого в новый префикс.
   - Нужно для переноса оригиналов видео (PENDING/PROCESSING/FAILED) из пути с UUID в путь с CUID.
3. **Скрипт миграции** вынести в отдельный файл (например `scripts/migrate-video-paths-to-cuid.ts`), запуск вручную с env и доступом к БД и CDN.

---

## Этап 1: Миграция данных (скрипт)

### 1.1. Выбор записей для миграции

Для каждой записи `TrainerVideo`:

- Взять из `relativePath` сегмент между `videocourses/` и следующий `/` (текущий идентификатор папки).
- Если этот сегмент **равен** `video.id` (CUID) — запись уже в новом формате, пропуск.
- Если **не равен** — считаем запись «legacy» (в пути был UUID), мигрируем.

### 1.2. Транскодированные видео (transcodingStatus === COMPLETED)

- На CDN: HLS уже лежит в `trainers/{trainerId}/videocourses/{video.id}/hls/` (воркер так и пишет). Оригинал удалён.
- В БД:
  - Обновить `relativePath` на путь, ведущий к тому же контенту (CUID). Логично положить:  
    `relativePath = "uploads/" + hlsManifestPath`  
    (т.к. `hlsManifestPath` без префикса `uploads/`). Так и шаги, и доступ будут опираться на один и тот же CUID-путь.
- Файлы на CDN не копировать.

### 1.3. Нетранскодированные видео (PENDING / PROCESSING / FAILED)

- На CDN: оригинал лежит по старому пути (UUID) в `relativePath`.
- Действия:
  1. Скопировать объект(ы) из текущего `relativePath` в новый путь:  
     `uploads/trainers/{trainerId}/videocourses/{video.id}/original.{ext}`  
     (расширение взять из текущего `relativePath`).
  2. В БД обновить `relativePath` на новый путь с CUID.

### 1.4. Обновление ссылок в шагах и курсах

- Единый базовый URL CDN зафиксировать в конфиге/скрипте (тот же, что в приложении, например `https://gafus-media.storage.yandexcloud.net`).
- Для каждой мигрированной записи `TrainerVideo`:
  - Новый канонический URL = `baseUrl + "/" + relativePath` (учесть, что в `relativePath` уже есть `uploads/`).
- Обновить все вхождения старых URL в:
  - **Step.videoUrl** — где `videoUrl` содержит старый путь (UUID или старый relativePath этого видео).
  - **StepTemplate.videoUrl** — аналогично.
  - **Course.videoUrl** — если там хранится CDN-ссылка на это видео.
- Заменить старый URL на новый канонический (построенный из нового `relativePath` с CUID). Сопоставление «старый URL → видео» делать по текущим полям видео до обновления (по старому `relativePath` и при необходимости по `hlsManifestPath`), затем подставлять новый URL.

### 1.5. Порядок и идемпотентность

- Сначала миграция CDN и полей `TrainerVideo` (relativePath), затем массовое обновление Step / StepTemplate / Course.
- Скрипт по возможности сделать идемпотентным: повторный прогон не должен ломать данные (проверка «уже CUID» по п. 1.1).

---

## Этап 2: Рефакторинг загрузки новых видео

**Файл:** `apps/trainer-panel/src/features/trainer-videos/lib/uploadTrainerVideoAction.ts`

1. Подключить генератор CUID (например `cuid2` или тот же, что использует Prisma для `@default(cuid())`).
2. Перед загрузкой файла и созданием записи:
   - сгенерировать `id = createId()` (CUID);
   - вычислить путь: `trainers/{trainerId}/videocourses/{id}/original.{extension}`;
   - загрузить файл в CDN по этому пути;
   - создать запись `TrainerVideo` с `id` и `relativePath`, указывающим на этот путь (с префиксом `uploads/`).
3. Убрать использование `randomUUID()` для пути.
4. Очередь транскодирования по-прежнему получает `video.id` (теперь он же используется в пути) — менять воркер не требуется.

---

## Этап 3: Упрощение checkVideoAccess

**Файл:** `packages/core/src/services/video/videoAccessService.ts`

- Оставить только проверку по `videoId` (CUID): шаги и курсы уже ссылаются на URL с CUID в пути.
- Удалить поиск по `relativePath` и `hlsManifestPath` (массив `videoUrlConditions` и `OR` по ним), оставить один предикат `videoUrl: { contains: videoId }`.

---

## Этап 4: Проверка и документация

1. Прогнать миграцию на копии БД и тестовом бакете (или тестовом префиксе).
2. Проверить: воспроизведение старых и новых видео в шагах курсов, доступ по токену (manifest/segment), офлайн/кэш курсов при необходимости.
3. Обновить `docs/architecture/hls-video-protection.md`: описать, что пути видео всегда содержат `TrainerVideo.id` (CUID), и что проверка доступа к видео идёт только по `videoId`.
4. Удалить или пометить устаревшим любой код/комментарии про «поиск по relativePath / hlsManifestPath» в контексте доступа.

---

## Риски и откат

- **Риск:** ошибка в скрипте обновления URL (Step/StepTemplate/Course) — битые ссылки в UI.
- **Митигация:** бэкап БД, тест на копии, обновлять батчами с логированием и при возможности dry-run режимом.
- **Откат:** восстановление БД из бэкапа; файлы на CDN в новом пути (CUID) можно не удалять до следующей миграции или удалить отдельной задачей.

---

## Чеклист

- [ ] Пакет cdn-upload: функция копирования объекта/папки в том же бакете.
- [ ] Скрипт миграции: выбор legacy TrainerVideo, обновление relativePath, копирование файлов для нетранскодированных.
- [ ] Скрипт миграции: обновление Step.videoUrl, StepTemplate.videoUrl, Course.videoUrl.
- [ ] Рефакторинг uploadTrainerVideoAction: CUID в пути с момента загрузки.
- [ ] Упрощение checkVideoAccess: только videoId.
- [ ] Тесты и прогон на стенде.
- [ ] Обновление документации (hls-video-protection.md и при необходимости README по миграциям).
