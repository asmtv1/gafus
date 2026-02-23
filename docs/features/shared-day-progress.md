# Shared Day Progress — Прогресс дня в нескольких курсах

## Обзор

Для дней тренировок с флагом `shareProgressAcrossCourses: true` прогресс, полученный в любом курсе, засчитывается во всех курсах, где этот день используется. День считается завершённым, если пользователь завершил его в любом из курсов.

## Настройка

Флаг задаётся в панели тренера при создании/редактировании дня (`TrainingDayForm`, `CreateDayClient`). В Prisma: `TrainingDay.shareProgressAcrossCourses` (boolean).

## Реализация

### 1. getUserProgress (apps/web)

**Файл:** `apps/web/src/shared/lib/user/getUserProgress.ts`

- **sharedUserTrainings** — запрос `UserTraining` (COMPLETED) по `dayId` для shared дней текущего курса
- **sharedTrainingByDayId** — Map dayId → UserTraining для быстрого доступа

**readOnly-ветка** (опция `{ readOnly: true }`):
- Виртуальные счётчики `effectiveTrainingCountRO`, `effectiveCompletedDaysRO` — учитывают shared дни
- Курс считается завершённым, если все дни (включая shared) выполнены

**userTrainingMap**:
- Виртуальные записи для shared дней без локального UserTraining — статус и steps берутся из sharedTrainingByDayId

**dayLink**:
- Тип: `dayId`, `day.shareProgressAcrossCourses` — для корректной работы циклов

### 2. getTrainingDays (packages/core)

**Файл:** `packages/core/src/services/training/trainingService.ts`

- **dayLinks select:** `dayId`, `day.shareProgressAcrossCourses`
- **sharedUserTrainings** — запрос COMPLETED из **других** курсов (`courseId: { not: firstCourse.id }`)
- **mapCourseToTrainingDays** — для каждого дня: при отсутствии локального `userTraining` и `shareProgressAcrossCourses` используется `sharedTrainingByDayId.get(dayId)`

Страница `/trainings/[courseType]` отображает shared дни как COMPLETED, если пользователь завершил их в другом курсе.

## Индекс БД

`DayOnCourse_dayId_idx` — для эффективного запроса sharedUserTrainings по dayId. Миграция: `20250223120000_add_share_progress_across_courses`.

## Связанные пакеты

- `packages/statistics` — своя реализация `getUserProgress` (для trainer-panel), без shared-day логики
- `packages/core/trainingDayService` — CRUD дней, schema с `shareProgressAcrossCourses`
