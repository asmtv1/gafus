# Daily Course Import Format

This document is the source of truth for preparing trainer notes for the daily course importer.

## File Rules

- Use `.md` or `.txt`.
- Each day starts with `## YYYY-MM-DD`.
- A day with no bundle fields and no steps is treated as empty and is not imported.
- A non-empty day must have 2-5 steps.
- Import creates new steps and a new bundle for each imported day, then publishes that bundle in the daily course schedule.

## Bundle Block

```md
## 2026-05-18, понедельник

**Bundle title:** Пульт становится точнее
**type:** daily_course
**equipment:** лакомства, спокойное место
**description:** Продолжаем тему сигналов тела.
```

Required fields: `Bundle title`, `description`.

Optional fields: `type` defaults to `daily_course`, `equipment` defaults to an empty string.

## Step Types

Supported values:

| Human value               | Enum          |
| ------------------------- | ------------- |
| тренировочный             | `TRAINING`    |
| экзаменационный           | `EXAMINATION` |
| теоретический             | `THEORY`      |
| тренировочный без таймера | `PRACTICE`    |

The enum values can be used directly. Other types, including `DIARY` and `BREAK`, are rejected.

## Duration Rules

`TRAINING` requires `durationSec`.

`THEORY`, `PRACTICE`, and `EXAMINATION` require `estimatedDurationSec`.

## Regular Step Example

````md
**Шаг 1**
title: Один жест - одно действие
type: тренировочный без таймера
estimatedDurationSec: 360
description:

```md
# Один жест - одно действие

Выберите простое действие и повторяйте сигнал одинаково.
```
````

## Examination Rules

For `EXAMINATION`, these three flags are required:

```text
requiresWrittenFeedback: true/false
hasTestQuestions: true/false
requiresVideoReport: true/false
```

At least one must be `true`.

- `requiresVideoReport: true` does not require questions.
- `requiresWrittenFeedback: true` does not require questions.
- `hasTestQuestions: true` requires `questions`.
- `hasTestQuestions: false` with a `questions` block is rejected.
- These three flags are forbidden for non-examination steps.

## Questions Example

```md
questions:

- question: Что лучше сделать перед поворотом?
  options:
  - Молча резко повернуть
  - Предупредить словом и потом повернуть
  - Натянуть поводок
    correctAnswer: 1
    comment: Собаке легче, когда маневр предсказуем.
```

Rules:

- At least 1 question.
- At least 2 answer options.
- `correctAnswer` is required.
- `correctAnswer` is zero-based and must point to an existing option.
- `comment` is optional.

## Checklist Before Import

- Every non-empty day has `Bundle title` and bundle `description`.
- Every non-empty day has 2-5 steps.
- Every step has `title`, `type`, `description`, and the correct duration field.
- Only supported step types are used.
- Examination steps have the three required flags and at least one `true`.
- Test examinations include valid `questions`.
