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
| **Web** | TrainingPageClient | Гайд: CourseDescriptionWithVideo + iframe (`sandbox="allow-scripts"`) с srcdoc, высота по postMessage |
| **Mobile** | training/[courseType]/index | Гайд: CourseDescription (с videoUrl) + WebView, `gafus:guide-height` для высоты, fallback 3 с, `scrollEnabled={false}` |

## Создание гайда в панели тренера

1. В форме курса выбрать «Мини-гайд».
2. В поле «Контент» вставить полный HTML (можно с `<style>`, `<script>`, ссылками на CDN).
3. Сохранить. При переключении на «Полноценный курс» — подтверждение; тренировочные дни очистятся, guideContent — обнулится.

**Валидация:** `guideContent` до 2 000 000 символов; при `isGuide` — обязательно и не пустое.

## Безопасность

- **Web:** iframe с `sandbox="allow-scripts"` без `allow-same-origin` — изоляция от родительской страницы.
- **Mobile:** WebView в изолированном контексте.
- **Контент:** только от авторизованных тренеров (trainer-panel). `checkCourseAccessById` выполняется до отдачи guideContent в `getTrainingDays`.

## Паритет Web / Mobile

| Функция | Web | Mobile |
|---------|-----|--------|
| Описание, equipment, trainingLevel | CourseDescriptionWithVideo | CourseDescription |
| Видео презентации курса | VideoPlayerSection / iframe embed | VideoPlayer (CDN/HLS) или Linking (YouTube, VK и др.) |
| HTML-контент гайда | iframe srcdoc | WebView |
| Динамическая высота без двойного скролла | postMessage `gafus:guide-height` | postMessage `gafus:guide-height`, `scrollEnabled={false}` |
| Спиннер до загрузки | load + fonts.ready | load + fonts.ready |
| Fallback при отсутствии сигнала | 3 с таймаут | 3 с таймаут |
| Офлайн | — | guideContent в offlineStorage |

## Паритет Web / Mobile

- **Описание курса** (description, equipment, trainingLevel) — есть на обоих
- **Видео презентации** (courseVideoUrl) — CourseDescriptionWithVideo (web) и CourseDescription с videoUrl (mobile)
- **HTML-контент** — iframe (web), WebView (mobile)
- **Высота контейнера** — postMessage с scrollHeight, динамическая высота, без двойного скролла
- **Спиннер до загрузки** — load + fonts.ready, fallback 3 с при отсутствии postMessage

## Паритет Web/Mobile

| Функция | Web | Mobile |
|---------|-----|--------|
| Описание курса (description, equipment, trainingLevel) | ✓ | ✓ |
| Видео презентация (CDN/HLS, YouTube, VK и др.) | ✓ | ✓ |
| Кнопка «Поделиться» | ✓ | ✓ |
| HTML-контент гайда | iframe srcdoc | WebView |
| Высота контента | postMessage с scrollHeight | postMessage gafus:guide-height |
| Спиннер до загрузки | ✓ | ✓ |
| Fallback таймаут (если postMessage не пришёл) | 3 с | 3 с |
| Одинарный скролл (без двойного) | ✓ | ✓ scrollEnabled={false} |

## Паритет Web / Mobile

| Функция | Web | Mobile |
|---------|-----|--------|
| Описание курса | CourseDescriptionWithVideo | CourseDescription |
| Видео презентации | VideoPlayerSection / iframe embed | VideoPlayer (CDN/HLS) или Linking (YouTube, VK) |
| Высота контента | postMessage `gafus:guide-height`, iframe подстраивается | postMessage `gafus:guide-height`, WebView без двойного скролла |
| Fallback спиннера | onLoad iframe + таймаут 3 с | таймаут 3 с |

## Офлайн

Гайды поддерживают офлайн: при скачивании курса `downloadFullCourse` возвращает `isGuide`, `guideContent`, пустые `trainingDays` и `mediaFiles`. Mobile сохраняет контент в offlineStorage и отображает в WebView.

## Паритет Web/Mobile

| Функция | Web | Mobile |
|---------|-----|--------|
| Описание, equipment, trainingLevel | CourseDescriptionWithVideo | CourseDescription |
| Видео презентации (CDN/HLS, YouTube, VK) | VideoPlayerSection / iframe embed | VideoPlayer / Linking.openURL |
| Высота контейнера контента | iframe по postMessage (gafus:guide-height) | WebView по postMessage, scrollEnabled=false |
| Fallback при отсутствии postMessage | таймаут 3 с, чтение contentDocument | таймаут 3 с |
| Кнопка «Поделиться» | ShareButton | onShare |
| Офлайн | guideContent в IndexedDB | guideContent в offlineStorage |

## Паритет Web/Mobile

| Функция | Web | Mobile |
|---------|-----|--------|
| Описание курса | CourseDescriptionWithVideo | CourseDescription |
| Видео презентации | HLS/CDN + embed (YouTube, VK) | HLS/CDN через VideoPlayer, внешние — Linking.openURL |
| HTML гайда | iframe srcdoc | WebView с wrapInFullHtml |
| Высота контейнера | postMessage `gafus:guide-height` | postMessage `gafus:guide-height` |
| Спиннер до загрузки | load + fonts.ready | load + fonts.ready |
| Fallback при отсутствии сигнала | 3 с таймаут | 3 с таймаут |
| Двойной скролл | нет (iframe подстраивается) | нет (`scrollEnabled={false}`) |

## Паритет Web / Mobile

Мини-гайды на web и mobile приведены к единому поведению:

- Описание курса (description, equipment, trainingLevel)
- Видео презентации (courseVideoUrl) — CDN/HLS через плеер, внешние (YouTube, VK) через Linking
- Кнопка «Поделиться»
- HTML-контент в iframe (web) / WebView (mobile)
- Динамическая высота контента — postMessage (`gafus:guide-height`) без двойного скролла
- Спиннер до готовности (load + fonts.ready)
- Fallback 3 с — скрытие спиннера, если postMessage не пришёл

## Паритет Web / Mobile

- **Описание, оборудование, уровень** — одинаково на обоих
- **Видео презентации курса** — CDN/HLS через VideoPlayer, внешние (YouTube, VK) — Linking
- **HTML-контент** — iframe (web) / WebView (mobile) с postMessage для высоты
- **Спиннер** — до load + fonts.ready; fallback 3 с

## Референс HTML

Пример: `apps/web/public/checklist-eta-baza.html` — чек-лист с интерактивом (клики, состояние).
