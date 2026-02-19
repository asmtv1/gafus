# Миграция бизнес-логики trainer-panel в @gafus/core

## Обзор

Вся серверная бизнес-логика панели тренера перенесена из `apps/trainer-panel` в пакет **@gafus/core**. В приложении остаются: проверка сессии/роли, парсинг FormData, вызов сервисов core, инвалидация кэша и операции с CDN.

## Новые сервисы в core

| Сервис | Путь | Назначение |
|--------|------|------------|
| **notes** | `services/notes` | Заметки тренера: create, update, delete, getTrainerNotes (с пагинацией и фильтрами) |
| **trainerCourse** | `services/trainerCourse` | CRUD курсов тренера: createCourse, updateCourse, deleteCourse, canCreatePaidCourse, getCourseDraftWithRelations |
| **trainerStep** | `services/trainerStep` | Шаги и шаблоны: createStep, updateStep, deleteSteps, getVisibleSteps, getStepTemplates, getStepCategories, createStepFromTemplate, manageTemplates, removeStepImageUrl, **validateStepFormData** |
| **trainingDay** | `services/trainingDay` | Дни тренировок: createTrainingDay, updateTrainingDay, deleteDays, getVisibleDays, **getCoursesUsingDay** |
| **trainerVideo** | `services/trainerVideo` | Видео тренера: registerTrainerVideo, deleteTrainerVideo, updateTrainerVideoName, getTrainerVideos, getSignedVideoUrl, getMultipleVideoStatuses, **getVideoInfoForStreaming** |
| **exam** (расширен) | `services/exam` | reviewExamResult, getPendingExamResults, getPendingExamCount, getExamResults |
| **user** (расширен) | `services/user` | searchUsersByUsername, searchStudentsByUsername, getStudentsByIds |
| **course** (расширен) | `services/course` | updateCourseLogoUrl, deleteCourseLogoFromRecord |
| **cache** | `services/cache` | Константы CACHE_TAGS для revalidateTag в app |
| **common** | `services/common` | validateImageUpload, validateVideoUpload — валидация загружаемых файлов |

Статистика и прогресс по-прежнему в **@gafus/statistics**; миграция не затрагивала их.

### Phase 4–5: Дополнительный cleanup (завершён)

**5 новых функций в core:**

| Функция | Модуль | Назначение |
|---------|--------|------------|
| `getCoursesUsingDay` | trainingDay/helpers | Получает ID курсов, использующих день (для инвалидации кэша) |
| `getVideoInfoForStreaming` | trainerVideo/helpers | Информация о видео для HLS manifest/segment (путь, статус транскодирования) |
| `validateStepFormData` | trainerStep/validation | Единая валидация данных шага (title, description, type, duration, videoUrl, checklist) |
| `validateImageUpload` | common/file-validation | Валидация изображений (MIME, размер до 10MB) |
| `validateVideoUpload` | common/file-validation | Валидация видео (MIME, размер до 100MB) |

**6 обновлённых файлов trainer-panel:**

1. `invalidateTrainingDaysCache.ts` — использует `getCoursesUsingDay`, убран прямой вызов Prisma
2. `manifest/route.ts` — использует `getVideoInfoForStreaming`, убран Prisma
3. `segment/route.ts` — использует `getVideoInfoForStreaming`, убран Prisma
4. `uploadCourseImageServerAction.ts` — использует `validateImageUpload` из core
5. `createStep.ts` — использует `validateStepFormData` вместо дублированной логики
6. `updateStep.ts` — использует `validateStepFormData` вместо дублированной логики

**Улучшения:**
- **Единая валидация** — общие правила для createStep/updateStep, загрузки изображений
- **Устранение дублирования** — один источник истины в core
- **Prisma удалён из app** — все обращения к БД через core (3 Prisma-вызова убраны)
- **Обработка ошибок** — централизованные сообщения валидации

## Границы миграции

- **CDN**: загрузка и удаление файлов выполняется в app. Core принимает готовые URL (курс, шаг, видео) и может возвращать списки URL для удаления в CDN при откате или delete.
- **ID для CDN**: для создания курса и шага app генерирует UUID до операций, передаёт его в core как `id`, загружает файлы на CDN с путём, содержащим этот ID, затем вызывает core с готовым URL.
- **Инвалидация кэша**: только в app после `result.success` (revalidatePath, revalidateTag, invalidateCoursesCache, invalidateTrainingDaysCache). Теги берутся из `CACHE_TAGS` в core.
- **Вне scope**: функциональность `features/ai-chat/` (шифрование API-ключей, OpenRouter) не переносилась в core и остаётся в приложении.

## Критические исправления при миграции

1. **DayOnCourse при обновлении курса**  
   При `updateCourse` существующие связи DayOnCourse сохраняются (двухпроходный upsert). Прогресс пользователей (UserTraining) не сбрасывается.

2. **Откат CDN при ошибке core**  
   Если после загрузки файла на CDN вызов core возвращает ошибку, app удаляет загруженный файл с CDN (rollback).

3. **Транзакция reviewExamResult**  
   Обновления `UserStep` и `ExamResult` выполняются в одной `prisma.$transaction` — либо применяются вместе, либо откатываются.

4. **Контракт ActionResult**  
   Все сервисы core возвращают `{ success, error? }` или `ActionResult<T>`. В том числе `reviewExamResult` возвращает `{ success: false, error }`, а не только `{ error }`.

5. **Платные курсы**  
   Создавать платный курс могут только ADMIN или пользователь с username `gafus`. При обновлении платного курса записи CourseAccess с оплатой (Payment.status === SUCCEEDED) не удаляются.

## Проверки после миграции

- Сборка: `pnpm --filter @gafus/core build`, `pnpm --filter trainer-panel build`, `pnpm --filter @gafus/web build`
- Линт: `pnpm run lint`
- Ручные проверки: авторизация (TRAINER/ADMIN/MODERATOR), CRUD заметок/курсов/шагов/дней/шаблонов, видео (загрузка, удаление, переименование), проверка экзаменов и push-уведомление, статистика через @gafus/statistics.

Подробный пошаговый план миграции: `.cursor/agentplan/trainer-panel-business-logic-to-core.md`. Дополнительный cleanup: `.cursor/agentplan/trainer-panel-additional-cleanup.md`.

---

## Финальная сводка (Phase 4–5)

| Метрика | Значение |
|---------|----------|
| Новые функции в core | 5 (getCoursesUsingDay, getVideoInfoForStreaming, validateStepFormData, validateImageUpload, validateVideoUpload) |
| Обновлено файлов trainer-panel | 6 |
| Prisma-вызовов удалено из app | 3 |

**Верификация:**
- `pnpm --filter @gafus/core build` ✅
- `pnpm --filter trainer-panel build` ✅
- `pnpm --filter @gafus/web build` ✅
- `pnpm run lint` ✅
