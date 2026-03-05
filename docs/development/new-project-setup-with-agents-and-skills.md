# Запуск нового проекта с агентами и скиллами из GAFUS

Инструкция для старта полностью нового проекта с копированием всех скиллов и адаптацией агентов под новую архитектуру.

---

## Шаг 1: Создать новый проект

```bash
# Пример: новый каталог рядом с gafus1
cd ~/Desktop
mkdir my-new-project
cd my-new-project
git init

# Или через create-next-app / create-t3-app / и т.д.
# pnpm create next-app@latest .
```

---

## Шаг 2: Скопировать скиллы

```bash
# Скопировать ВСЕ скиллы из GAFUS (160+ скиллов)
cp -R /Users/asmtv1/Desktop/gafus1/.cursor/skills .cursor/skills
```

---

## Шаг 3: Скопировать агенты и структуру .cursor

```bash
# Создать структуру .cursor
mkdir -p .cursor/agents .cursor/plans .cursor/agentplan .cursor/rules

# Скопировать агентов
cp /Users/asmtv1/Desktop/gafus1/.cursor/agents/workflow.md .cursor/agents/
cp /Users/asmtv1/Desktop/gafus1/.cursor/agents/steps.md .cursor/agents/
cp /Users/asmtv1/Desktop/gafus1/.cursor/agents/plan-review.md .cursor/agents/
cp /Users/asmtv1/Desktop/gafus1/.cursor/agents/builder.md .cursor/agents/
cp /Users/asmtv1/Desktop/gafus1/.cursor/agents/debugger.md .cursor/agents/
cp /Users/asmtv1/Desktop/gafus1/.cursor/agents/finalizator.md .cursor/agents/
cp /Users/asmtv1/Desktop/gafus1/.cursor/agents/push.md .cursor/agents/  # опционально

# Скопировать rules (базовые, не GAFUS-специфичные)
cp /Users/asmtv1/Desktop/gafus1/.cursor/rules/code-style.mdc .cursor/rules/
cp /Users/asmtv1/Desktop/gafus1/.cursor/rules/react.mdc .cursor/rules/
cp /Users/asmtv1/Desktop/gafus1/.cursor/rules/typescript.mdc .cursor/rules/
cp /Users/asmtv1/Desktop/gafus1/.cursor/rules/post-task-audit.mdc .cursor/rules/
cp /Users/asmtv1/Desktop/gafus1/.cursor/rules/skills-auto-apply.mdc .cursor/rules/
cp /Users/asmtv1/Desktop/gafus1/.cursor/rules/context7-mcp.mdc .cursor/rules/
```

---

## Шаг 4: Создать architecture.mdc и fsd.mdc для НОВОГО проекта

В `.cursor/rules/` создай файл `architecture.mdc` с описанием **твоей** архитектуры:

```markdown
---
alwaysApply: true
---

# Project Architecture Rules

## Structure (ОПИШИ СВОЮ СТРУКТУРУ)
- Монорепо / single app / и т.д.
- apps/, packages/ (если есть)
- Feature structure: как организованы фичи

## Key Rules
- Где хранится бизнес-логика
- Паттерны Server Actions / API
- Ошибки: { success, data? } | { success: false, error: string }
- Логирование: какой логгер
```

И `fsd.mdc` с описанием проекта (название, стек, язык комментариев).

---

## Шаг 5: Промт для адаптации агентов

Скопируй этот промт в новый чат в **новом проекте** (после копирования файлов):

---

**Промт для адаптации агентов:**

```
Адаптируй агентов в .cursor/agents/ под архитектуру этого проекта.

1. Прочитай .cursor/rules/architecture.mdc и fsd.mdc — это описание архитектуры.

2. В каждом файле .cursor/agents/*.md:
   - Замени "GAFUS" на "[ИМЯ_ПРОЕКТА]" или убрать упоминания конкретного проекта
   - Замени секцию "GAFUS Architecture (must comply)" на "Project Architecture" и впиши туда правила из architecture.mdc
   - Убери ссылки на @gafus/* пакеты — замени на актуальные для этого проекта
   - В workflow.md: обнови таблицу skills (task → skills) под стек проекта
   - В push.md: замени owner/repo на репозиторий этого проекта

3. В .cursor/skills/gafus-agent-chain/:
   - Переименуй папку в [project-name]-agent-chain
   - Обнови SKILL.md: замени "GAFUS" на имя проекта, обнови цепочку агентов если изменились имена

4. В .cursor/rules/skills-auto-apply.mdc:
   - Обнови таблицу task/stack → skills под стек нового проекта (оставь общие скиллы)
```

---

## Шаг 6: Проверка и тест цепочки

1. Открой чат в новом проекте.
2. Выбери агента **workflow**.
3. Отправь тестовый запрос: `Task: Создай минимальную страницу /about с заголовком и текстом.`
4. Цепочка: workflow → steps → plan-review → builder → debugger (на каждом шаге) → finalizator.

---

## Быстрые команды одной строкой

```bash
# Создать .cursor со всеми каталогами
mkdir -p my-new-project/.cursor/{agents,plans,agentplan,rules} && cd my-new-project

# Скопировать скиллы
cp -R ../gafus1/.cursor/skills .cursor/

# Скопировать агентов
cp ../gafus1/.cursor/agents/*.md .cursor/agents/

# Скопировать базовые rules
cp ../gafus1/.cursor/rules/{code-style,react,typescript,post-task-audit,skills-auto-apply,context7-mcp}.mdc .cursor/rules/
```

---

## Что меняется при адаптации агентов

| Агент     | Что заменить / обновить |
|-----------|--------------------------|
| workflow  | GAFUS Project Context → новый контекст; Monorepo layout; Skills table |
| steps     | GAFUS → имя проекта; ссылки на architecture |
| plan-review | GAFUS Architecture (must comply) → Project Architecture из rules |
| builder   | GAFUS Architecture → Project Architecture; пути packages/core и т.д. |
| debugger  | GAFUS → имя проекта; pnpm run build / lint (если другой менеджер — поправить) |
| finalizator | GAFUS → имя проекта; docs/ structure |
| push      | owner/repo, branch |
| gafus-agent-chain | Переименовать skill, обновить SKILL.md |

---

## Важно

- **gafus-agent-chain** — завязан на GAFUS; либо переименовать и обновить, либо удалить.
- **push** — привязывает к конкретному repo; обнови или не копируй.
- Rules `architecture.mdc`, `fsd.mdc`, `nextjs.mdc`, `database.mdc` и т.д. — скопируй только те, что подходят под стек. Создай свои для новой архитектуры.
