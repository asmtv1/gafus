# Cursor Rules для проекта GAFUS

Этот набор правил помогает Cursor AI генерировать код, соответствующий архитектуре и стилю проекта GAFUS.

## 📋 Список правил

### Основные
- **`fsd.mdc`** - Главный файл с обзором проекта и быстрым справочником
- **`architecture.mdc`** - Структура монорепозитория и организация кода
- **`code-style.mdc`** - Стиль кода и соглашения об именовании

### Технологии
- **`typescript.mdc`** - TypeScript лучшие практики и Discriminated Unions
- **`nextjs.mdc`** - Next.js 15 App Router, Server Components, Server Actions
- **`react.mdc`** - React компоненты, хуки, Material-UI
- **`database.mdc`** - Prisma ORM, миграции, оптимизация запросов

### Качество кода
- **`error-handling.mdc`** - Обработка ошибок, логирование
- **`security.mdc`** - Аутентификация, авторизация, валидация
- **`performance.mdc`** - Кеширование, оптимизация, bundle size
- **`testing.mdc`** - Тестирование и стратегии

### Специализированные
- **`background-jobs.mdc`** - BullMQ, воркеры, очереди, cron jobs
- **`documentation.mdc`** - JSDoc, документация проекта

## 🎯 Применение

Все файлы с `alwaysApply: true` автоматически применяются при каждом запросе к Cursor AI.

## 🔧 Ключевые концепции

### Discriminated Union
```typescript
// Типобезопасное различение вариантов
type NotificationData = 
  | { type: 'step'; stepTitle: string; stepIndex: number }
  | { type: 'immediate'; title: string; body: string };
```

### Server Actions
```typescript
"use server";
// Серверные действия с валидацией и обработкой ошибок
```

### Feature-Sliced Design (адаптированный)
```
src/
├── app/              # Next.js routes
├── features/         # Изолированные модули функций
└── shared/           # Общий код
```

## 📚 Дополнительная информация

Полная документация проекта находится в `/docs/`.

## 🔄 Обновление правил

При добавлении новых паттернов или изменении архитектуры:
1. Обновите соответствующий `.mdc` файл
2. Добавьте примеры кода
3. Обновите этот README

---

*Последнее обновление: 10 января 2025 (v2.5.4 - Discriminated Union для пуш-уведомлений)*

