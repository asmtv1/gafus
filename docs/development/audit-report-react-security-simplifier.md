# Отчёт: react-best-practices, security-review, code-simplifier

**Дата:** 2 февраля 2026  
**Объём:** весь проект (apps/web, apps/trainer-panel, packages, API).

---

## 1. React best practices (Vercel)

### 1.1 Уже хорошо

- **optimizePackageImports:** в `apps/web/next.config.ts` включены `@mui/material`, `@mui/icons-material` — barrel-импорты MUI не тянут лишние модули.
- **Server Actions:** во всех 67 файлах с `"use server"` используется авторизация через `getCurrentUserId()` или проверка сессии; мутации защищены.
- **Параллельный fetch:** `apps/web/src/app/(main)/trainings/[courseType]/page.tsx` — `Promise.all([getCourseMetadata, getCurrentUserId])` для независимых запросов.
- **Условный рендер:** в `ProfileClient` и `Bio` используется `&&` с булевыми/объектами (isOwner, userData), не с числами — риск отрисовать `0` отсутствует.

### 1.2 Рекомендации

| Правило | Где | Рекомендация |
|--------|-----|--------------|
| **async-parallel / defer await** | `apps/web/src/app/(main)/courses/page.tsx` | Сейчас: `session = await getServerSession`, затем `result = await getCoursesWithProgressCached`. Можно запустить оба запроса параллельно: сначала `getServerSession` и кэшированные курсы не зависят друг от друга только если не нужен userId для кэша — в текущей логике userId передаётся в `getCoursesWithProgressCached`, поэтому последовательность обоснована. Оставить как есть. |
| **async-parallel** | `apps/web/src/app/(main)/trainings/[courseType]/page.tsx` (58–86) | Внутри ветки `if (userId)` есть цепочка: `checkCourseAccessById` → `getTrainingDays` → `checkAndCompleteCourse`. Второй и третий шаги можно объединить в `Promise.all` с другими независимыми запросами на странице, если появятся — текущая последовательность логична (доступ → данные → пост-обработка). |
| **server-dedup** | Server actions | Рассмотреть обёртку `getCurrentUserId` в `React.cache()` (или кэш на один запрос) в местах, где один RSC-запрос несколько раз вызывает getCurrentUserId. Сейчас дублирование не критично. |
| **.sort() → .toSorted()** | См. п. 3.1 | Использовать `.toSorted()` вместо `.sort()` на копии массива, чтобы не мутировать исходный массив (иммутабельность в React). |
| **localStorage** | См. п. 1.3 | Версионировать ключи и оборачивать в try/catch. |

### 1.3 localStorage (Vercel 4.4)

**Найдено:** 18 обращений к `localStorage` в apps/web.

- **Версионирование ключей:** не используется. Рекомендация: ввести префикс версии, например `v1:notificationModalShown`, для будущих миграций схемы.
- **try/catch:** в `notificationUIStore.ts`, `timerStore.ts`, `stepStore.ts`, `useOfflineData.ts` вызовы `getItem`/`setItem` не обёрнуты в try/catch. В приватном режиме или при переполнении квоты возможны исключения — обернуть чтение/запись в try/catch и обрабатывать ошибку (например, считать данные недоступными).

---

## 2. Security review

### 2.1 Insecure defaults (fail-open)

Проверка паттернов вида `process.env.X || "default"` и аналогичных.

| Файл | Переменная | Риск | Рекомендация |
|------|------------|------|--------------|
| **apps/trainer-panel/src/features/ai-chat/lib/encryption.ts** | `AI_API_KEY_ENCRYPTION_SALT \|\| "gafus-ai-enc-salt"` | **Высокий** | Соль для PBKDF2 не должна иметь статичный дефолт в коде. Либо требовать задание в env (падать при отсутствии), либо генерировать один раз и хранить вне кода. |
| **apps/trainer-panel/src/app/api/chat/route.ts** | `OPENROUTER_API_KEY \|\| ""` | Средний | При пустом ключе запросы к API будут падать с 401 — fail-safe. Желательно явно проверять наличие ключа в начале и возвращать 503/500 с сообщением «API не настроен». |
| **scripts/upload-public-to-cdn.js** | `YC_ACCESS_KEY_ID \|\| ""`, `YC_SECRET_ACCESS_KEY \|\| ""` | Низкий | Скрипт ниже проверяет наличие и выходит при отсутствии — ок. Оставить. |
| **packages/auth (NEXTAUTH_URL и др.)** | `NEXTAUTH_URL \|\| "http://localhost:3000"` | Низкий | Типичный dev-дефолт; в проде должен быть задан. Документировать в ENV_MANAGEMENT.md. |
| **packages/logger, queues, prisma** | `NODE_ENV \|\| "development"` | Низкий | Для логирования/меток окружения приемлемо. |

**Итог:** единственная критичная находка — дефолтная соль в `encryption.ts`; остальное — улучшения (явные проверки, документация).

### 2.2 Sharp edges

- **encryption.ts:** параметр соли полностью контролируется env; при отсутствии подставляется строка — это и есть «dangerous default». Убрать дефолт и падать при отсутствии `AI_API_KEY_ENCRYPTION_SALT` в production (или генерировать/хранить соль отдельно).
- Остальные проверенные API (auth, server actions) используют Zod и getCurrentUserId; явных footgun’ов (алгоритм из пользовательского ввода, сравнение секретов не в constant-time и т.п.) не найдено.

### 2.3 Semgrep

Semgrep в окружении не установлен. Рекомендация для CI и локальных проверок:

```bash
pip install semgrep
# или: brew install semgrep
semgrep --config p/owasp-top-ten --config p/javascript --config p/security-audit --metrics=off .
```

В `.github/workflows/ci-cd.yml` можно добавить отдельный job с Semgrep (см. скилл `.claude/skills/semgrep/SKILL.md`).

---

## 3. Code-simplifier

### 3.1 Мутация массивов: .sort() → .toSorted()

**Правило (Vercel 7.12):** использовать `.toSorted()` вместо `.sort()`, чтобы не мутировать исходный массив.

| Файл | Строка | Текущий код | Рекомендация |
|------|--------|-------------|--------------|
| `apps/web/src/shared/utils/courseFilters.ts` | 89–121 | `const sorted = [...courses]; return sorted.sort(...)` | Заменить на `return [...courses].toSorted(...)` или `return courses.toSorted(...)` (без промежуточной переменной, если не нужна). |
| `apps/web/src/shared/stores/courseStore.ts` | 285 | `.sort((a, b) => b.popularity - a.popularity)` | Вызвать на копии и использовать `.toSorted()`. |
| `apps/web/src/shared/lib/user/getUserWithTrainings.ts` | 94 | `.sort((a, b) => a - b)` | Заменить на `.toSorted((a, b) => a - b)`. |
| `apps/web/src/shared/lib/achievements/getUserTrainingDates.ts` | 58 | `.sort((a, b) => b.getTime() - a.getTime())` | Заменить на `.toSorted(...)`. |
| `packages/core` (calculateStreaks) | 50, 138 | `.sort(...)` | Аналогично — `.toSorted()`. |
| `apps/web/src/shared/hooks/usePreloadComponents.ts` | 41 | `[...configs].sort(...)` | Уже копия; заменить на `configs.toSorted(...)` для единообразия. |

Итого: 11 мест с `.sort()` — во всех предпочтительно использовать `.toSorted()` (или копию + toSorted), чтобы не полагаться на мутацию.

### 3.2 Прочие упрощения

- **Дублирование обработки ошибок:** во многих server actions повторяется паттерн `error instanceof Error ? error.message : "Unknown error"`. Вынести в `shared/lib/errorMessage.ts` хелпер `getErrorMessage(error: unknown): string` и использовать его.
- **Ранний выход:** в части API route (например, payments) цепочка проверок (session → rateLimit → body → env) уже с ранними return — хорошо; в других маршрутах при росте ветвлений продолжать выносить проверки в начало с return.
- **Константы:** магические числа (например, лимиты кэша, таймауты) по возможности вынести в именованные константы в начале файла или в shared/constants.

---

## 4. Сводка действий

| Приоритет | Действие | Статус |
|-----------|----------|--------|
| **Высокий** | Убрать дефолт соли в `encryption.ts`: требовать `AI_API_KEY_ENCRYPTION_SALT` в production. | ✅ Сделано |
| **Средний** | Заменить `.sort()` на `.toSorted()` (courseFilters, courseStore, getUserWithTrainings, getUserTrainingDates, calculateStreaks, usePreloadComponents). | ✅ Сделано |
| **Средний** | Обернуть localStorage в try/catch + версионирование ключей (notificationUIStore, timerStore, stepStore, useOfflineData, CoursesClient). | ✅ Сделано |
| **Низкий** | Добавить в CI job с Semgrep (p/owasp-top-ten, p/javascript, p/security-audit). | — |
| **Низкий** | Ввести общий хелпер `getErrorMessage(error)` и использовать в server actions. | — |
| **Низкий** | В API chat (trainer-panel) при отсутствии OPENROUTER_API_KEY возвращать явную ошибку конфигурации. | — |

---

*Отчёт сформирован по скиллам: vercel-react-best-practices, differential-review, insecure-defaults, sharp-edges, semgrep; code-simplifier применён по общим правилам упрощения кода.*
