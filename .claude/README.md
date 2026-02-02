# .claude — конфигурация для ассистента

Правила перенесены в **`.cursor/rules/`** (Cursor подхватывает их оттуда). Здесь остаются только скиллы и локальные настройки.

## Структура

- **Правила (Cursor):** `.cursor/rules/` — архитектура, стиль, стек, качество кода. См. `.cursor/rules/README.md`.
- **Скиллы:** `.claude/skills/` — differential-review, insecure-defaults, semgrep, sharp-edges, vercel-react-best-practices. Используются по описанию в SKILL.md при релевантных задачах.
- **Настройки:** `settings.local.json` — разрешения для запуска команд (pnpm, prisma, build и т.д.), если используется в среде Claude.

## Обновление

При изменении архитектуры или конвенций обновляй соответствующий `.mdc` в `.cursor/rules/` и при необходимости `docs/`.
