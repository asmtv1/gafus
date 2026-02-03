# Cursor Rules — GAFUS

Правила для Cursor AI: архитектура, стиль, технологии. Файлы с `alwaysApply: true` подхватываются при каждом запросе.

## Правила

**Основные:** `fsd.mdc` (обзор), `architecture.mdc`, `code-style.mdc`  
**Стек:** `typescript.mdc`, `nextjs.mdc`, `react.mdc`, `database.mdc`  
**Качество:** `error-handling.mdc`, `security.mdc`, `performance.mdc`, `testing.mdc`, `post-task-audit.mdc`  
**Скиллы:** `skills-auto-apply.mdc` — при работе с кодом автоматически подключать релевантные скиллы из `.agents/skills/` (читать SKILL.md и следовать им).  
**Спец:** `background-jobs.mdc`, `documentation.mdc`, `personalization.mdc`

**Авторизация в apps/web:** для получения userId в server actions — `getCurrentUserId()` из `@shared/utils/getCurrentUserId`; для проверки роли — `getServerSession(authOptions)` из `@gafus/auth`.

Документация проекта: `/docs/`. После правок — обновлять docs.
