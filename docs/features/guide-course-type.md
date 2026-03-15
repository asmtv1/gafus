# Мини-гайд как тип курса

## Обзор

**Мини-гайд** — тип курса, в котором вместо структуры «дни → шаги» отображается полный HTML-контент. Курс-гайд использует те же механизмы доступа (публичный/приватный/платный), оплаты, отзывов и каталога, что и полноценный курс.

**Дискриминатор:** `guideContent != null` → курс считается гайдом.

## Где реализовано

| Слой | Компонент | Поведение |
|------|-----------|-----------|
| **Prisma** | `Course.guideContent` | `String? @db.Text`, до 2 МБ HTML |
| **Core** | `trainerCourseService` | createCourse/updateCourse: для гайда — пустой dayLinks, guideContent; CourseAccess для обоих типов |
| **Core** | `trainingService.getTrainingDays` | Early return для гайда с `isGuide`, `guideContent`, `trainingDays: []` |
| **Core** | `offlineService.downloadFullCourse` | Early return: пустые trainingDays и mediaFiles |
| **Trainer-panel** | CourseForm | Переключатель «Полноценный курс» / «Мини-гайд»; для гайда — TextArea с HTML вместо DualListSelector |
| **Web** | TrainingPageClient | Гайд: CourseDescriptionWithVideo + iframe (`sandbox="allow-scripts"`) с srcdoc |
| **Mobile** | training/[courseType]/index | Гайд: WebView с `wrapInFullHtml(guideContent)` |

## Создание гайда в панели тренера

1. В форме курса выбрать «Мини-гайд».
2. В поле «Контент» вставить полный HTML (можно с `<style>`, `<script>`, ссылками на CDN).
3. Сохранить. При переключении на «Полноценный курс» — подтверждение; тренировочные дни очистятся, guideContent — обнулится.

**Валидация:** `guideContent` до 2 000 000 символов; при `isGuide` — обязательно и не пустое.

## Безопасность

- **Web:** iframe с `sandbox="allow-scripts"` без `allow-same-origin` — изоляция от родительской страницы.
- **Mobile:** WebView в изолированном контексте.
- **Контент:** только от авторизованных тренеров (trainer-panel). `checkCourseAccessById` выполняется до отдачи guideContent в `getTrainingDays`.

## Офлайн

Гайды поддерживают офлайн: при скачивании курса `downloadFullCourse` возвращает `isGuide`, `guideContent`, пустые `trainingDays` и `mediaFiles`. Mobile сохраняет контент в offlineStorage и отображает в WebView.

## Референс HTML

Пример: `apps/web/public/checklist-eta-baza.html` — чек-лист с интерактивом (клики, состояние).
