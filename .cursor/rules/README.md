# Cursor Rules — GAFUS

Правила для Cursor AI: архитектура, стиль, технологии.

- **alwaysApply: true** — правило подхватывается при каждом запросе.
- **alwaysApply: false** — правило подключается по globs (при открытии/изменении подходящих файлов) или по контексту.

## Правила (alwaysApply: true)

**Основные:** `fsd.mdc` (обзор), `architecture.mdc`, `code-style.mdc`  
**Стек:** `typescript.mdc`, `nextjs.mdc`, `react.mdc`, `database.mdc`  
**Качество:** `error-handling.mdc`, `security.mdc`, `performance.mdc`, `post-task-audit.mdc`  
**Скиллы:** `skills-auto-apply.mdc` — при работе с кодом подключать релевантные скиллы из `.cursor/skills/` (читать SKILL.md и следовать им).  
**MCP:** `context7-mcp.mdc` — использовать Context7 MCP для документации библиотек/API, генерации кода по докам, setup и конфигурации (без явной просьбы).

## Правила по контексту (alwaysApply: false + globs)

- **testing.mdc** — тесты (`*.test.*`, `*.spec.*`, `__tests__/`, `e2e/`)
- **documentation.mdc** — документация (`docs/`, README)
- **background-jobs.mdc** — очереди и воркеры (`worker/`, `queues/`, packages)
- **personalization.mdc** — персонализация курсов (trainer-panel, core/personalization*, docs)

**Авторизация в apps/web:** см. `security.mdc`.

Документация проекта: `/docs/`. После правок — обновлять docs.
