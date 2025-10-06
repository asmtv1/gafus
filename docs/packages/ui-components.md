# @gafus/ui-components - UI компоненты

## 📋 Обзор

Пакет `@gafus/ui-components` содержит переиспользуемые UI компоненты для всех приложений в экосистеме GAFUS.

## 🎯 Основные функции

- **Переиспользуемые компоненты** для всех приложений
- **Единообразный дизайн** во всей экосистеме
- **Типобезопасность** с TypeScript
- **Доступность** (a11y) компонентов

## 📦 Использование

### Базовые компоненты
```typescript
import { Button, Input, Card } from '@gafus/ui-components';

function MyComponent() {
  return (
    <Card>
      <Input placeholder="Введите текст" />
      <Button variant="primary">Сохранить</Button>
    </Card>
  );
}
```

### Специализированные компоненты
```typescript
import { UserAvatar, CourseCard, TrainingProgress } from '@gafus/ui-components';

function UserProfile() {
  return (
    <div>
      <UserAvatar user={user} size="large" />
      <CourseCard course={course} />
      <TrainingProgress progress={75} />
    </div>
  );
}
```

## 🔧 API

- `Button` - Кнопка с различными вариантами
- `Input` - Поле ввода
- `Card` - Карточка контента
- `UserAvatar` - Аватар пользователя
- `CourseCard` - Карточка курса
- `TrainingProgress` - Прогресс тренировки
