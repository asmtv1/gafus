# Детальный промпт: курс type=guide (мини-гайд)

## Цель рефактора

Добавить новый тип курса — **мини-гайд** (guide). Курс-гайд:
- Отображается в том же каталоге курсов
- Использует те же механизмы доступа (публичный/приватный/платный), оплаты, отзывов
- **Вместо** списка тренировочных дней содержит **полный HTML** (как `apps/web/public/checklist-eta-baza.html`)
- Пользователь открывает гайд и сразу видит HTML-контент — без вложенности день→шаг
- Корректно отображается и в **web**, и в **mobile**
- В панели тренера — переключатель «Полноценный курс» / «Мини-гайд»; для гайда вместо «Тренировочные дни» — поле «Контент» (full HTML)

---

## Референс

- **Пример HTML-контента**: `apps/web/public/checklist-eta-baza.html` — чек-лист с интерактивом (клики, состояние). Контент содержит: `<style>`, `<link>`, разметку, скрипты.
- **Текущая форма курса**: `apps/trainer-panel/src/features/courses/components/CourseForm/CourseForm.tsx`
- **Core createCourse**: `packages/core/src/services/trainerCourse/trainerCourseService.ts`
- **Схемы валидации**: `packages/core/src/services/trainerCourse/schemas.ts`
- **Web страница курса**: `apps/web/src/app/(main)/trainings/[courseType]/page.tsx`, `TrainingPageClient`
- **Mobile страница курса**: `apps/mobile/app/(main)/training/[courseType]/index.tsx`
- **API training days**: `apps/api/src/routes/v1/training.ts`, `getTrainingDays` в `packages/core/src/services/training/trainingService.ts`

---

## 1. Схема БД (Prisma)

### 1.1 Поле в модели Course

Добавить в `packages/prisma/schema.prisma`:

```prisma
model Course {
  // ... существующие поля ...
  guideContent  String?  @db.Text  // Полный HTML. Если не null — курс считается гайдом
}
```

**Альтернатива** (если нужна явная метка): добавить `category String @default("training")` — значения `"training"` | `"guide"`. Тогда `guideContent` обязателен при `category === "guide"`.

**Рекомендация**: использовать только `guideContent`: если `guideContent` не null и не пустой — курс считается гайдом. Это минимизирует миграции.

### 1.2 Миграция

- Создать миграцию: `guideContent` nullable `@db.Text`
- Существующие курсы: `guideContent = null` → обычные курсы

---

## 2. Core (packages/core)

### 2.1 Схемы валидации

Файл: `packages/core/src/services/trainerCourse/schemas.ts`

- Добавить в `createTrainerCourseSchema` и `updateTrainerCourseSchema`:
  - `isGuide: z.boolean().default(false)`
  - `guideContent: z.string().max(2_000_000).optional().nullable()` — для больших HTML
- Условная валидация: если `isGuide === true`, то `guideContent` обязателен и не пустой, `trainingDays` должен быть пустым (или игнорироваться)
- Если `isGuide === false`, то `guideContent` не передаётся / игнорируется, `trainingDays` — как сейчас

### 2.2 createCourse

Файл: `packages/core/src/services/trainerCourse/trainerCourseService.ts`

- Принимать `isGuide` и `guideContent` из input
- Если `isGuide` и `guideContent` заданы:
  - `dayLinks.create` — пустой массив (не создавать DayOnCourse)
  - Записывать `guideContent` в Course
- Если не гайд — логика без изменений (trainingDays → dayLinks)

### 2.3 updateCourse

- Аналогично: при `isGuide` обновлять `guideContent`, при необходимости очищать `dayLinks` (если курс перевёл из training в guide)
- При переводе из guide в training — обратная логика

### 2.4 getTrainingDays / API тренировок

- При запросе days для курса с `guideContent`:
  - Возвращать структуру, совместимую с текущим контрактом, но с пустым `trainingDays` и флагом `isGuide: true`, плюс `guideContent`
- Либо: отдельный эндпоинт/метод `getGuideCourse(courseType)` — возвращает `{ guideContent, ...metadata }`
- **Рекомендация**: расширить ответ `getTrainingDays` — добавить `isGuide?: boolean` и `guideContent?: string | null`. Если курс — гайд, `trainingDays` будет пустым. Это минимальные изменения в API.

### 2.5 Валидация guideContent

- HTML от тренера — условно доверенный (авторизованный автор)
- Базовая санитизация: убрать/отключить очевидно опасные вещи (например, `javascript:` в href)
- Для интерактивных чек-листов скрипты нужны — рендерить через `iframe` с `srcdoc` или отдельную страницу
- Использовать санитизатор (например DOMPurify) с политикой, разрешающей стили, скрипты только при необходимости — **уточнить у заказчика**, допускаются ли inline-скрипты. Если да — санитизация минимальная (только явно опасные паттерны).

---

## 3. Trainer Panel (apps/trainer-panel)

### 3.1 Переключатель типа курса

В `CourseForm.tsx` в начале формы (например, после «Основная информация» или перед «Доступ»):

- **Radio/Switch**: «Полноценный курс» | «Мини-гайд»
- Состояние: `isGuide: boolean` в форме (defaultValues, reset при edit)

### 3.2 Условное отображение полей

- **Если «Полноценный курс»**:
  - Показать секцию «Тренировочные дни» (DualListSelector с allDays)
  - Скрыть поле «Контент»

- **Если «Мини-гайд»**:
  - Скрыть секцию «Тренировочные дни»
  - Показать секцию «Контент»:
    - Label: «HTML-контент гайда»
    - Textarea/редактор с поддержкой крупного текста (минимум 50k символов)
    - Placeholder: «Вставьте полный HTML (например, из checklist-eta-baza.html). Поддерживаются стили, скрипты, интерактив.»
    - Helper: «Можно вставить содержимое из готового HTML-файла. Убедитесь, что разметка и стили корректны.»

### 3.3 Отправка формы

- При создании: `formData.append("isGuide", isGuide ? "true" : "false")`
- При гайде: `formData.append("guideContent", guideContent)`, `trainingDays` не передавать или передавать пустой массив
- При edit: те же поля + `guideContent` при isGuide

### 3.4 Server actions и парсинг

Файлы: `apps/trainer-panel/src/shared/lib/actions/courses.ts`, `createCourseServerAction`, `updateCourseServerAction`

- Парсить `isGuide` (formData: "true"/"false")
- Парсить `guideContent` (formData строка)
- Передавать в `createCourse` / `updateCourse` из core

### 3.5 Редактирование курса

- При загрузке курса для edit определять `isGuide` по наличию `guideContent`
- В форме подставлять `guideContent` в поле контента
- При смене с гайда на полноценный курс — предупреждение: «Контент гайда будет удалён. Продолжить?»

---

## 4. Web (apps/web)

### 4.1 Страница курса /trainings/[courseType]

Файл: `apps/web/src/app/(main)/trainings/[courseType]/page.tsx`

- При загрузке данных проверять `isGuide`
- Если гайд: не вызывать `getTrainingDays` в том же объёме или использовать ответ с `guideContent`
- Передавать в `TrainingPageClient`: `isGuide`, `guideContent`

### 4.2 TrainingPageClient

- Если `isGuide` и есть `guideContent`:
  - Не показывать `TrainingDayList`
  - Не показывать «Содержание» (дни)
  - Показывать блок с HTML-контентом

### 4.3 Рендеринг HTML гайда

- **Вариант A**: `iframe` с `srcdoc={guideContent}` — изоляция стилей и скриптов, безопасно
- **Вариант B**: `dangerouslySetInnerHTML` — стили могут конфликтовать с layout. Нужна обёртка с изоляцией (например, тень или iframe)
- **Рекомендация**: `iframe` с `srcdoc`. Для внешних шрифтов/стилей (`<link href="fonts...">`) — base URL или инлайнить. Проверить, что интерактив (клики, локальное состояние) работает внутри iframe.

### 4.4 Оформление

- Обёртка (контейнер) для iframe: адаптивная ширина, min-height, скролл при необходимости
- Метаданные (title, description) — как у обычного курса

### 4.5 getTrainingDays / data fetching

- Расширить `getTrainingDays` в `packages/core` и/или в `apps/web/src/shared/lib/training/getTrainingDays.ts`: при курсе-гайде возвращать `isGuide`, `guideContent`
- Или отдельный вызов для гайдов — на усмотрение архитектуры

---

## 5. Mobile (apps/mobile)

### 5.1 Экран /training/[courseType]

Файл: `apps/mobile/app/(main)/training/[courseType]/index.tsx`

- При `isGuide`:
  - Не показывать список дней
  - Показать WebView с HTML-контентом
- Использовать `react-native-webview` (уже есть в проекте): `<WebView source={{ html: guideContent }} />` или `source={{ html: wrapInFullHtml(guideContent) }}`

### 5.2 Обёртка HTML для WebView

- WebView ожидает полный HTML (с `<!DOCTYPE>`, `<html>`, `<head>`, `<body>`)
- Если `guideContent` — только фрагмент (например, от `<div class="container">` до `</body>`), обернуть в шаблон:
  ```html
  <!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body>${guideContent}</body></html>
  ```
- Если `guideContent` уже полный документ — передавать как есть
- Проверить: если в нём есть `<link>` на внешние шрифты, WebView должен иметь доступ к сети (по умолчанию есть)

### 5.3 Адаптивность

- WebView на всю ширину экрана, высота — `flex: 1` или по содержимому (см. `injectedJavaScript` для авто-высоты, если нужно)
- Убедиться, что в HTML есть `viewport` meta — как в `checklist-eta-baza.html`

### 5.4 API

- Ответ `/api/v1/training/days` (или аналог) для курса-гайда должен содержать `isGuide`, `guideContent`
- На mobile парсить этот ответ и переключать UI

---

## 6. API (apps/api, apps/web Route Handlers)

### 6.1 Эндпоинт training/days

- При запросе по `courseType` проверять, гайд ли курс
- Возвращать в JSON: `isGuide`, `guideContent` (если гайд), `trainingDays: []` (если гайд)
- Структура ответа должна быть обратно совместимой: клиенты, которые не знают про гайды, получают пустой `trainingDays` и могут игнорировать новые поля

### 6.2 Доступ и оплата

- Логика доступа (публичный/приватный/платный) — без изменений
- Проверка оплаты — как для обычного курса
- Гайды не требуют отдельных эндпоинтов для access/paid

---

## 7. Offline (mobile)

- Курсы-гайды тоже могут быть в офлайне
- При скачивании курса: если `isGuide`, сохранять `guideContent` в мета/манифест
- При офлайн-просмотре: загружать HTML из локального хранилища и отображать в WebView
- Структура `OfflineCourseMeta` / `FullCourseData`: добавить `guideContent?: string` и `isGuide?: boolean`

---

## 8. Каталог курсов

- Гайды отображаются в общем списке курсов (web и mobile)
- Карточка курса: для гайда можно добавить бейдж «Гайд» или отличать иконкой
- При клике — переход на `/trainings/[courseType]`; далее по `isGuide` показывается контент или дни

---

## 9. Безопасность и санитизация

- HTML хранится в БД и рендерится в iframe/WebView
- Рекомендация: разрешить тренерам полный HTML (они авторизованы), но:
  - Ограничить размер (например, 2 MB)
  - При рендере: iframe с `sandbox` при необходимости (но `allow-scripts` нужен для чек-листов)
  - Не выполнять пользовательский HTML из ненадёжных источников — только из поля Course, созданного тренером

---

## 10. Чек-лист реализации (порядок работ)

1. [ ] Prisma: поле `guideContent`, миграция
2. [ ] Core: схемы `isGuide`, `guideContent`; `createCourse`, `updateCourse`
3. [ ] Core/API: `getTrainingDays` возвращает `isGuide`, `guideContent` для гайдов
4. [ ] Trainer panel: переключатель, условные поля, отправка в server actions
5. [ ] Server actions: парсинг и передача в core
6. [ ] Web: условный рендер в TrainingPageClient, iframe с `guideContent`
7. [ ] Mobile: условный рендер, WebView с HTML
8. [ ] Offline (mobile): сохранение и чтение `guideContent`
9. [ ] Тесты: createCourse/updateCourse с гайдом, API ответ для гайда
10. [ ] Сборка: `pnpm run build` в корне

---

## 11. Дополнительно

- **Тип (slug) курса**: сейчас `Course.type` генерируется как `${Date.now()}-${random}`. Для гайдов логика та же. Если потребуется человекочитаемый slug (например, `checklist-eta-baza`) — отдельная доработка (поле slug или выбор type при создании).
- **Документация**: обновить `docs/` при необходимости (например, описание типов курсов).
