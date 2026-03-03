# Отчёт: Post-Task Audit — Core Migration Step 10

**Дата:** 3 марта 2026  
**Объём:** мигрированный код (core, web shared/lib, api routes).  
**Режим:** with security (рекомендован из-за миграции auth).

---

## 1. React best practices (performance)

### 1.1 Что сделано хорошо

- **Тонкие обёртки:** `getUserProgress`, `getUserWithTrainings`, `getVideoMetadata`, `getVideoUrlForPlayback` — только Zod-валидация → вызов core → возврат. Минимум кода на стороне web.
- **Кэш курсов:** `cachedCourses.ts` — `unstable_cache` с тегами (`courses`, `user-progress`, `user-${userId}`), revalidate 5/20 мин.
- **Серверные actions:** `"use server"`, `getCurrentUserId()` перед вызовом core — без лишних данных и ре-рендеров.

### 1.2 Рекомендации

| Область | Файл | Рекомендация | Приоритет |
|---------|------|--------------|-----------|
| Параллельный fetch | `cachedCourses.ts` → `getCoursesWithUserProgressCached` | `getAllCoursesCached` и `getUserCoursesProgressCached` не зависят друг от друга. Вызвать `Promise.all([getAllCoursesCached(), getUserCoursesProgressCached(safeUserId)])` вместо последовательных `await`. | Низкий |
| Логирование в кэше | `cachedCourses.ts` | `logger.warn` при каждом попадании в кэш — шумно. Рассмотреть `logger.debug` или убрать в production. | Низкий |

---

## 2. Security review (OWASP/XSS, auth)

### 2.1 Auth (мигрированная логика)

| Проверка | Статус |
|----------|--------|
| **bcrypt.compare** | ✅ Используется в `validateCredentials`; bcrypt — constant-time, защита от timing attack. |
| **Refresh token rotation** | ✅ `rotateRefreshToken` — атомарная транзакция (`prisma.$transaction`), revoke старого + create нового. |
| **Token reuse detection** | ✅ `validateRefreshToken` при `revokedAt` возвращает `reason: "token_reuse"`; API вызывает `revokeAllUserTokens(userId)` и возвращает 401 + `TOKEN_REUSE_DETECTED`. |
| **Пароль в логах** | ✅ Логируется только `username` при failed login, пароль не передаётся. |
| **Хеширование токена** | ✅ Refresh token хешируется SHA-256 перед сохранением; в БД хранится только hash. |

### 2.2 Payments webhook

| Проверка | Статус |
|----------|--------|
| **IP whitelist** | ✅ Проверка `isYooKassaIP(ip)` до обработки. |
| **HMAC подпись** | ✅ `verifyWebhookSignature(body, signature, secretKey)` при наличии заголовка. |
| **Тяжёлая работа** | ✅ `setImmediate` — ответ 200 сразу, обработка асинхронно. |

### 2.3 XSS и инъекции

| Область | Статус |
|---------|--------|
| **User-controlled данные** | React по умолчанию экранирует. `avatarUrl`, `username`, `fullName` из core → React; нет `dangerouslySetInnerHTML` с пользовательскими данными в мигрированном коде. |
| **API ответы** | JSON без HTML-инъекций; мобильное API — контракт без изменений. |
| **Zod-валидация** | Входные данные в server actions и API routes валидируются Zod. |

### 2.4 Рекомендации

| Область | Рекомендация | Приоритет |
|---------|--------------|-----------|
| **Secret key** | `YOOKASSA_SECRET_KEY` в webhook — при отсутствии подписи webhook принимается только по IP. Документировать: в production обязательно настраивать X-Yookassa-Signature и `YOOKASSA_SECRET_KEY`. | Низкий |
| **Rate limiting** | ✅ Реализован: `authRateLimiter` (10 req/15 min по IP) для `/api/v1/auth/*`, Redis store. Web: checkLoginRateLimit, rateLimit в register/reset-password. | — |
| **Semgrep** | Добавить в CI job с правилами `p/owasp-top-ten`, `p/javascript`, `p/security-audit` для автоматической проверки. | Низкий |

---

## 3. Code simplifier

### 3.1 Мутация массивов: .sort() → .toSorted()

**Правило:** Использовать `.toSorted()` вместо `.sort()` для иммутабельности.

| Файл | Строка | Статус |
|------|--------|--------|
| `packages/core/.../achievements/datesService.ts` | 72 | `.sort()` → заменить на `.toSorted()` |
| `packages/core/.../diary/diaryService.ts` | 163 | `rawEntries.sort` → мутирует; использовать `.toSorted()` на копии. |
| `packages/core/.../adminPresentation/adminPresentationService.ts` | 129, 139 | `.sort()` → `.toSorted()` |
| `packages/core/.../user/profileService.ts` | 358 | ✅ Уже `.toSorted()` |

### 3.2 Хелпер getErrorMessage

**Текущее состояние:** Паттерн `error instanceof Error ? error.message : "Unknown error"` повторяется в ~50 файлах (cachedCourses, auth, training, actions и т.д.).

**Рекомендация:** Создать `@shared/lib/errorMessage.ts`:

```ts
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "Неизвестная ошибка");
}
```

Импортировать в server actions вместо дублирования. (Уже рекомендовано в предыдущем аудите — статус «не сделано».)

### 3.3 Прочее

- **Ранний выход:** API routes (auth, payments) уже используют ранние return при ошибках — ок.
- **Константы:** `REFRESH_EXPIRES_MS`, `YOOKASSA_IP_PREFIXES` вынесены — ок.

---

## 4. Сводка действий

| Приоритет | Действие | Статус |
|-----------|----------|--------|
| **Высокий** | — | Нет критичных находок. |
| **Средний** | — | Rate limiting уже реализован. |
| **Средний** | Заменить `.sort()` на `.toSorted()` в datesService, diaryService, adminPresentationService. | TODO |
| **Низкий** | Параллелить `getAllCoursesCached` и `getUserCoursesProgressCached` в `getCoursesWithUserProgressCached`. | TODO |
| **Низкий** | Ввести `getErrorMessage(error: unknown)` и использовать в server actions. | TODO |
| **Низкий** | Рассмотреть `logger.debug` вместо `logger.warn` в cachedCourses. | TODO |
| **Низкий** | Документировать обязательность X-Yookassa-Signature в production. | TODO |
| **Низкий** | Добавить в CI Semgrep (p/owasp-top-ten, p/security-audit). | TODO |

---

*Отчёт сформирован по правилам post-task-audit.mdc: react-best-practices, security-review (OWASP/XSS, auth), code-simplifier.*
