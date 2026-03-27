# Процесс: клиентские ошибки и Tracer

## Цель

Во всех **клиентских** ветках, где ошибка перехвачена и обрабатывается (не пробрасывается дальше), отправлять событие в Tracer через `reportClientError`, чтобы не терять сбои в проде.

## Где что вызывать

| Контекст | Импорт | Примечание |
|----------|--------|------------|
| Web, trainer-panel, admin-panel | `reportClientError` из `@gafus/error-handling` | После `TracerProvider` в layout |
| Mobile | `reportClientError` из `@/shared/lib/tracer` | `installGlobalJsErrorHandler` один раз в root `_layout` (без дубля `ErrorUtils`); при ошибке шрифтов — `reportClientError` с `issueKey: "FontLoad"` |
| Пакеты `ui-components`, `csrf` (клиент: `src/react/*`, `store.ts`) | `reportClientError` из `@gafus/error-handling` | Серверные `utils.ts` / `middleware` — только `logger.error` |
| Сервер (RSC, actions, API) | **не** `reportClientError` | `logger.error("…", error as Error, meta)` — см. `error-handling.mdc` |

## ESLint (мягко, `warn`)

Правило **`@gafus/require-client-catch-tracer`** срабатывает, если:

- файл в области действия (**mobile**; **ui-components** / **csrf**; или Next-приложение с директивой **`"use client"`** в начале модуля после импортов), и
- модули **без** `"use client"` (например общие `hooks/*.ts` в web) в зону правила **не входят** — там `reportClientError` при осмысленном `catch` всё равно нужен по политике выше, но линтер не подскажет.
- у блока **`catch` есть тело с кодом**, и
- в этом блоке **нет** вызова **`reportClientError`**.

**Не срабатывает** для «пустых» catch, только `throw`, только `unstable_rethrow(…)` (Next).

Имя правила для точечного отключения: `@gafus/require-client-catch-tracer`.

## Когда отключать правило осознанно

- Ошибка уже отправлена выше по стеку (и в этом `catch` только UI/state).
- Ожидаемое, штатное исключение (лучше заменить на проверку без throw и не использовать `catch`).
- Временный технический долг — `eslint-disable-next-line` с коротким комментарием «почему».

## Связанные документы

- `.cursor/rules/error-handling.mdc` — логгер, Tracer, `unstable_rethrow`
- `docs/audit/tracer-apptracer-gaps.md` — исторический аудит пробелов
