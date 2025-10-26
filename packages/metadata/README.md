# @gafus/metadata

Централизованное управление метаданными для проекта GAFUS.

## Возможности

- ✅ Типобезопасная генерация метаданных
- ✅ Единый паттерн для всех страниц
- ✅ Open Graph и Twitter Cards
- ✅ JSON-LD для SEO
- ✅ Поддержка Next.js 15
- ✅ Автоматические canonical URLs

## Установка

Пакет уже установлен в монорепозитории. В `package.json` вашего приложения:

```json
{
  "dependencies": {
    "@gafus/metadata": "workspace:*"
  }
}
```

## Использование

### Статические метаданные

```typescript
import { generateStaticPageMetadata } from "@gafus/metadata";

export const metadata = generateStaticPageMetadata(
  "Список курсов",
  "Выбирайте курсы для послушания, фокуса и социализации вашей собаки.",
  "/courses"
);
```

### Динамические метаданные (generateMetadata)

```typescript
import { generateCourseMetadata } from "@gafus/metadata";
import type { Metadata } from "next";

export async function generateMetadata({ params }): Promise<Metadata> {
  const course = await getCourseData(params.id);
  
  return generateCourseMetadata({
    name: course.name,
    description: course.description,
    type: course.type,
    logoUrl: course.logoImg,
  });
}
```

### JSON-LD для SEO

```typescript
import { JsonLd, generateOrganizationSchema } from "@gafus/metadata";

export default function HomePage() {
  return (
    <>
      <JsonLd data={generateOrganizationSchema()} />
      <main>...</main>
    </>
  );
}
```

### Кастомные метаданные

```typescript
import { generatePageMetadata } from "@gafus/metadata";

export const metadata = generatePageMetadata({
  title: "Кастомный заголовок",
  description: "Описание страницы",
  path: "/custom-page",
  image: "https://example.com/image.jpg",
  imageWidth: 1200,
  imageHeight: 630,
  ogType: "article",
});
```

## API

### Константы

- `SITE_CONFIG` - базовая конфигурация сайта
- `DEFAULT_OG_IMAGE` - дефолтное OG изображение
- `SOCIAL` - настройки социальных сетей

### Генераторы

- `generatePageMetadata(params)` - универсальный генератор
- `generateCourseMetadata(params)` - для страниц курсов
- `generateStaticPageMetadata(title, description, path)` - для статических страниц

### JSON-LD

- `generateOrganizationSchema()` - схема организации
- `generateCourseSchema(name, description)` - схема курса
- `<JsonLd data={schema} />` - компонент для вставки в head

## Best Practices

1. **Всегда указывайте canonical URL** - пакет делает это автоматически
2. **Используйте JSON-LD на важных страницах** - улучшает SEO
3. **Не дублируйте код** - используйте готовые генераторы
4. **Read-only в generateMetadata** - не создавайте данные в БД
5. **Валидация изображений** - пакет автоматически нормализует URLs

## Миграция со старого подхода

### До:
```typescript
export const metadata = {
  title: "Курс",
  description: "...",
  openGraph: {
    title: "Курс",
    description: "...",
    siteName: "Гафус",
    locale: "ru_RU",
    // ... много повторяющегося кода
  },
};
```

### После:
```typescript
import { generateStaticPageMetadata } from "@gafus/metadata";

export const metadata = generateStaticPageMetadata(
  "Курс",
  "...",
  "/courses"
);
```

Все остальные поля добавляются автоматически!

