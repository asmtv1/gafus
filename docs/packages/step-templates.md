# Система шаблонов шагов (@gafus/step-templates)

## 📋 Обзор

Система шаблонов позволяет тренерам использовать готовые проверенные методики тренировок для быстрого создания шагов. Шаблоны организованы по категориям и доступны всем тренерам в системе.

## 🎯 Основные возможности

### Для тренеров
- **Библиотека шаблонов** - Просмотр и поиск готовых шаблонов
- **Быстрое создание** - Создание шага одним кликом из шаблона
- **Категории** - Организация шаблонов по темам
- **Поиск** - Поиск по названию, описанию и тегам
- **Статистика** - Просмотр популярности шаблонов

### Для администраторов
- **Создание шаблонов** - Добавление новых шаблонов
- **Управление категориями** - Организация структуры
- **Редактирование** - Изменение существующих шаблонов
- **Удаление** - Удаление устаревших шаблонов

## 🗄️ Структура базы данных

### StepCategory
Категории для организации шаблонов:

```prisma
model StepCategory {
  id          String         @id @default(cuid())
  name        String         @unique
  description String?
  icon        String?        // Emoji или путь к иконке
  order       Int            @default(0)
  templates   StepTemplate[]
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}
```

**Примеры категорий:**
- 🎯 Базовые команды
- 🤝 Социализация
- 🏆 Продвинутая дрессировка
- 🐶 Для щенков

### StepTemplate
Шаблоны шагов тренировок:

```prisma
model StepTemplate {
  id                      String         @id @default(cuid())
  title                   String
  description             String
  durationSec             Int?
  type                    StepType       // TRAINING или EXAMINATION
  imageUrls               String[]
  pdfUrls                 String[]
  videoUrl                String?
  checklist               Json?
  
  // Поля для экзаменов
  requiresVideoReport     Boolean        @default(false)
  requiresWrittenFeedback Boolean        @default(false)
  hasTestQuestions        Boolean        @default(false)
  
  // Организация
  categoryId      String?
  category        StepCategory?
  tags            String[]       @default([])
  
  // Контроль доступа
  isPublic        Boolean        @default(true)
  
  // Статистика
  usageCount      Int            @default(0)
  
  authorId        String
  author          User
  
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
}
```

## 🔄 Процесс использования

### 1. Просмотр библиотеки
```
Тренер → /main-panel/templates
```

Тренер видит:
- Все публичные шаблоны
- Фильтрацию по категориям
- Поиск по ключевым словам
- Счетчик использований

### 2. Выбор шаблона
```typescript
// При клике на "Использовать шаблон"
const result = await createStepFromTemplate(templateId);

if (result.success) {
  // Перенаправление на редактирование нового шага
  router.push(`/main-panel/steps/${result.stepId}/edit`);
}
```

### 3. Создание шага
```typescript
// Server action: createStepFromTemplate
1. Получить шаблон из БД
2. Создать новый Step с данными шаблона
3. Увеличить usageCount шаблона
4. Вернуть ID нового шага
```

## 📊 API и Server Actions

### Получение шаблонов
```typescript
import { getStepTemplates } from "@features/steps/lib/getStepTemplates";

// Все шаблоны
const templates = await getStepTemplates();

// По категории
const templates = await getStepTemplates(categoryId);

// Поиск
import { searchStepTemplates } from "@features/steps/lib/getStepTemplates";
const results = await searchStepTemplates("базовые команды");
```

### Получение категорий
```typescript
import { getStepCategories } from "@features/steps/lib/getStepCategories";

const categories = await getStepCategories();
// Возвращает категории с количеством шаблонов
```

### Создание шага из шаблона
```typescript
import { createStepFromTemplate } from "@features/steps/lib/createStepFromTemplate";

const result = await createStepFromTemplate(templateId);
// { success: true, message: "...", stepId: "..." }
```

### Управление шаблонами (Админ)
```typescript
import {
  createStepTemplate,
  deleteStepTemplate,
  createStepCategory
} from "@features/steps/lib/manageTemplates";

// Создание шаблона
const result = await createStepTemplate(prevState, formData);

// Удаление шаблона
const result = await deleteStepTemplate(templateId);

// Создание категории
const result = await createStepCategory(prevState, formData);
```

## 🎨 UI Компоненты

### TemplateLibrary
Основной компонент библиотеки:

```tsx
import TemplateLibrary from "@features/steps/components/TemplateLibrary";

<TemplateLibrary
  initialTemplates={templates}
  categories={categories}
  onUseTemplate={createStepFromTemplate}
/>
```

**Возможности:**
- Карточки шаблонов с превью
- Фильтрация по категориям
- Поиск по тексту
- Отображение тегов
- Счетчик использований

### AdminTemplateManager
Управление для админов:

```tsx
import AdminTemplateManager from "@features/steps/components/AdminTemplateManager";

<AdminTemplateManager
  templates={templates}
  categories={categories}
  onDeleteTemplate={deleteStepTemplate}
/>
```

## 🚀 Страницы

### `/main-panel/templates`
Библиотека шаблонов для всех тренеров
- Просмотр всех публичных шаблонов
- Фильтрация и поиск
- Создание шага из шаблона

### `/main-panel/steps/new`
Страница создания нового шага
- Форма создания шага
- Ссылка на библиотеку шаблонов
- Подсказка об использовании шаблонов

### `/main-panel/admin/templates`
Управление шаблонами (только ADMIN)
- Список всех шаблонов
- Создание новых шаблонов
- Редактирование и удаление
- Управление категориями

### `/main-panel/admin/templates/new`
Создание нового шаблона (только ADMIN)
- Форма создания шаблона
- Все поля Step + метаданные
- Привязка к категории
- Добавление тегов

## 📝 Примеры использования

### Создание шаблона через seed
```typescript
await prisma.stepTemplate.create({
  data: {
    title: "Команда 'Сидеть'",
    description: "## Обучение команде...",
    durationSec: 300,
    type: "TRAINING",
    categoryId: basicCommandsCategory.id,
    tags: ["базовые команды", "послушание"],
    authorId: admin.id,
    isPublic: true,
  },
});
```

### Использование в коде
```typescript
// В компоненте тренера
const handleUseTemplate = async (templateId: string) => {
  const result = await createStepFromTemplate(templateId);
  
  if (result.success && result.stepId) {
    // Перенаправляем на редактирование
    router.push(`/main-panel/steps/${result.stepId}/edit`);
  }
};
```

## 🔐 Права доступа

### Тренеры (TRAINER, MODERATOR)
- ✅ Просмотр публичных шаблонов
- ✅ Создание шагов из шаблонов
- ✅ Поиск и фильтрация
- ❌ Создание/редактирование шаблонов

### Администраторы (ADMIN)
- ✅ Все права тренеров
- ✅ Создание шаблонов
- ✅ Редактирование шаблонов
- ✅ Удаление шаблонов
- ✅ Управление категориями

## 📈 Статистика

Система автоматически отслеживает:
- **usageCount** - Количество использований шаблона
- Популярность шаблонов (сортировка по usageCount)
- Количество шаблонов в категории

## 🎯 Best Practices

### Для администраторов
1. **Создавайте качественные описания**
   - Используйте Markdown для форматирования
   - Включайте пошаговые инструкции
   - Добавляйте предупреждения и советы

2. **Организуйте категории**
   - Используйте понятные названия
   - Добавляйте emoji-иконки
   - Поддерживайте логичную структуру

3. **Добавляйте теги**
   - Используйте распространенные термины
   - Добавляйте уровень сложности
   - Указывайте возраст питомца

### Для тренеров
1. **Используйте шаблоны как основу**
   - Адаптируйте под конкретную собаку
   - Добавляйте свои примечания
   - Изменяйте длительность при необходимости

2. **Проверяйте статистику**
   - Популярные шаблоны = проверенные методики
   - Обращайте внимание на отзывы

## 🔄 Миграции

### Добавление системы шаблонов
```bash
# Миграция уже применена
prisma migrate dev --name add_step_templates
```

### Seed данных
```bash
# Заполнение базы примерами
cd packages/prisma
DATABASE_URL="..." npx tsx seed.ts
```

Seed создаст:
- 4 категории (Базовые команды, Социализация, Продвинутая дрессировка, Для щенков)
- 10 шаблонов шагов (включая экзаменационный)

## 🐛 Troubleshooting

### Шаблоны не отображаются
Проверьте:
1. `isPublic = true` в базе данных
2. Права доступа пользователя
3. Существование категорий

### Ошибка при создании шага
Проверьте:
1. Авторизацию пользователя
2. Роль пользователя (TRAINER, ADMIN, MODERATOR)
3. Существование шаблона
4. Доступность шаблона (isPublic)

### Проблемы с категориями
```sql
-- Проверка категорий
SELECT * FROM "StepCategory" ORDER BY "order";

-- Проверка шаблонов
SELECT id, title, "categoryId", "isPublic", "usageCount" 
FROM "StepTemplate" 
ORDER BY "usageCount" DESC;
```

---

*Система шаблонов разработана для ускорения работы тренеров и обеспечения качества контента в системе GAFUS.*

