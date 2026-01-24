# @gafus/metadata

Централизованное управление метаданными по best practices Next.js 15.

## Проблемы которые решает

До введения пакета:

- ❌ Хаотичный подход - разные паттерны в разных местах
- ❌ Дублирование кода (Open Graph, Twitter cards)
- ❌ Неполные метаданные где-то есть OG, где-то нет
- ❌ Нет JSON-LD для SEO
- ❌ Side-effects в `generateMetadata` (создание данных в БД)

После введения пакета:

- ✅ Единый типобезопасный API
- ✅ Переиспользуемые генераторы
- ✅ Полные метаданные везде
- ✅ JSON-LD для SEO
- ✅ Read-only `generateMetadata`

## Установка

Пакет уже установлен в web приложении:

```json
{
  "dependencies": {
    "@gafus/metadata": "workspace:*"
  }
}
```

## API

### Константы

```typescript
import { SITE_CONFIG, DEFAULT_OG_IMAGE, DESCRIPTIONS } from "@gafus/metadata";

// Основная конфигурация сайта
SITE_CONFIG.name; // "Гафус"
SITE_CONFIG.url; // "https://gafus.ru"
SITE_CONFIG.title; // "Гафус — Тренировки для собак"
SITE_CONFIG.description; // "Умные пошаговые тренировки для собак онлайн с опытными кинологами"
SITE_CONFIG.locale; // "ru_RU"
SITE_CONFIG.themeColor; // "#DAD3C1"

// Описания для разных аудиторий
DESCRIPTIONS.trainers; // Описание для кинологов
DESCRIPTIONS.students; // Описание для учеников/владельцев собак

// Изображение по умолчанию
DEFAULT_OG_IMAGE.url; // "https://gafus.ru/uploads/logo.png"
DEFAULT_OG_IMAGE.width; // 1200
DEFAULT_OG_IMAGE.height; // 630
DEFAULT_OG_IMAGE.alt; // "Гафус"
```

**Использование в root layout:**

```typescript
import { SITE_CONFIG, DEFAULT_OG_IMAGE, SOCIAL } from "@gafus/metadata";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_CONFIG.url),
  title: { default: SITE_CONFIG.title, template: `%s — ${SITE_CONFIG.name}` },
  description: SITE_CONFIG.description,
  applicationName: SITE_CONFIG.name,
  // ... остальные метаданные
};
```

### Генераторы метаданных

#### `generateStaticPageMetadata`

Для статических страниц (профиль, курсы, достижения):

```typescript
import { generateStaticPageMetadata } from "@gafus/metadata";

export const metadata = generateStaticPageMetadata(
  "Список курсов",
  "Выбирайте курсы для послушания, фокуса и социализации вашей собаки.",
  "/courses",
);
```

Генерирует:

- `title`, `description`
- `canonical` URL
- `openGraph` (title, description, url, siteName, locale, images)
- `twitter` (card, title, description, images)
- `robots` (index, follow)

#### `generateCourseMetadata`

Для страниц курсов (с кастомным изображением):

```typescript
import { generateCourseMetadata } from "@gafus/metadata";
import type { Metadata } from "next";

export async function generateMetadata({ params }): Promise<Metadata> {
  const course = await getCourseData(params.type);

  if (!course) {
    return {
      title: "Курс",
      description: "Пошаговая тренировка для вашего питомца",
    };
  }

  return generateCourseMetadata({
    name: course.name,
    description: course.description,
    type: course.type, // для URL /trainings/[type]
    logoUrl: course.logoImg,
  });
}
```

#### `generatePageMetadata`

Универсальный генератор с полным контролем:

```typescript
import { generatePageMetadata } from "@gafus/metadata";

export const metadata = generatePageMetadata({
  title: "Кастомный заголовок",
  description: "Описание страницы",
  path: "/custom-page",
  image: "https://example.com/custom-image.jpg",
  imageWidth: 1200,
  imageHeight: 630,
  imageAlt: "Alt текст",
  ogType: "article", // "website" | "article" | "profile"
  noIndex: false, // true для закрытых страниц
});
```

### JSON-LD для SEO

Structured data для поисковых систем (улучшает индексацию и отображение в поиске):

```typescript
import { generateOrganizationSchema, generateCourseSchema } from "@gafus/metadata";

export default function HomePage() {
  const schema = generateOrganizationSchema();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <main>...</main>
    </>
  );
}
```

Для курсов:

```typescript
const courseSchema = generateCourseSchema("Курс послушания", "Обучение базовым командам");
```

## Примеры миграции

### Статическая страница

**До:**

```typescript
export const metadata = {
  title: "Список курсов",
  description: "Выбирайте курсы...",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Список курсов",
    description: "Выбирайте курсы...",
    type: "website",
  },
};
```

**После:**

```typescript
import { generateStaticPageMetadata } from "@gafus/metadata";

export const metadata = generateStaticPageMetadata(
  "Список курсов",
  "Выбирайте курсы...",
  "/courses",
);
```

### Динамическая страница

**До:**

```typescript
import { generateCourseOGMetadata } from "@/utils/metadata";

export async function generateMetadata({ params }): Promise<Metadata> {
  const course = await getCourseMetadata(params.type);

  return generateCourseOGMetadata(course.name, course.description, params.type, course.logoImg);
}
```

**После:**

```typescript
import { generateCourseMetadata } from "@gafus/metadata";

export async function generateMetadata({ params }): Promise<Metadata> {
  const course = await getCourseMetadata(params.type);

  return generateCourseMetadata({
    name: course.name,
    description: course.description,
    type: params.type,
    logoUrl: course.logoImg,
  });
}
```

## Best Practices

### 1. Read-only в generateMetadata

`generateMetadata` должна **только читать** данные, не создавать:

```typescript
// ❌ Плохо - создает данные в БД
export async function generateMetadata({ params }): Promise<Metadata> {
  const data = await getOrCreateData(params.id); // Side-effect!
  return generatePageMetadata({ title: data.title });
}

// ✅ Хорошо - только читает
export async function generateMetadata({ params }): Promise<Metadata> {
  const data = await getData(params.id); // Read-only

  if (!data) {
    return { title: "Не найдено" };
  }

  return generatePageMetadata({ title: data.title });
}
```

### 2. Всегда указывайте path

Canonical URL важен для SEO:

```typescript
// ❌ Плохо
export const metadata = generateStaticPageMetadata("Заголовок", "Описание");

// ✅ Хорошо
export const metadata = generateStaticPageMetadata("Заголовок", "Описание", "/page-path");
```

### 3. Используйте JSON-LD на важных страницах

Главная страница, страницы курсов, профили - везде где нужна хорошая индексация:

```typescript
export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateOrganizationSchema())
        }}
      />
      <main>...</main>
    </>
  );
}
```

### 4. Fallback для динамических страниц

Всегда обрабатывайте случай когда данные не найдены:

```typescript
export async function generateMetadata({ params }): Promise<Metadata> {
  const data = await getData(params.id);

  // Fallback
  if (!data) {
    return {
      title: "Не найдено",
      description: "Страница не найдена",
      robots: { index: false, follow: false },
    };
  }

  return generatePageMetadata({ ... });
}
```

## Миграция существующих страниц

✅ **Все страницы мигрированы!**

Мигрированные страницы:

- ✅ `app/layout.tsx` (root layout) - **использует константы из пакета**
- ✅ `app/(auth)/layout.tsx` (auth layout) - **использует константы из пакета**
- ✅ `app/(main)/courses/page.tsx`
- ✅ `app/(main)/trainings/[courseType]/page.tsx`
- ✅ `app/(main)/trainings/[courseType]/[day]/page.tsx`
- ✅ `app/(main)/profile/page.tsx`
- ✅ `app/(main)/profile/editBio/page.tsx`
- ✅ `app/(main)/profile/addPet/page.tsx`
- ✅ `app/(main)/achievements/page.tsx`
- ✅ `app/(main)/favorites/page.tsx`
- ✅ `app/(auth)/login/page.tsx`
- ✅ `app/(auth)/register/page.tsx`
- ✅ `app/(auth)/confirm/page.tsx`
- ✅ `app/(auth)/passwordReset/page.tsx`
- ✅ `app/reset-password/page.tsx`
- ✅ `app/page.tsx` (главная)

**Статистика:**

- Всего страниц/layouts: 16
- Строк кода до: ~350
- Строк кода после: ~80
- Экономия: **77% меньше кода** 🎉
- Единый источник правды: **SITE_CONFIG** в пакете

## Структура пакета

```
packages/metadata/
├── src/
│   ├── constants.ts      # Константы (SITE_CONFIG, etc)
│   ├── types.ts          # TypeScript типы
│   ├── generators.ts     # Генераторы метаданных
│   ├── jsonld.ts         # JSON-LD схемы
│   └── index.ts          # Public API
├── dist/                 # Скомпилированный код
├── package.json
├── tsconfig.json
└── README.md
```

## Расширение

Если нужно добавить новый тип метаданных:

1. Добавьте тип в `types.ts`:

```typescript
export interface ArticleMetadataParams {
  title: string;
  author: string;
  publishedAt: Date;
}
```

2. Создайте генератор в `generators.ts`:

```typescript
export function generateArticleMetadata(params: ArticleMetadataParams): Metadata {
  return generatePageMetadata({
    title: params.title,
    description: `By ${params.author}`,
    ogType: "article",
  });
}
```

3. Экспортируйте в `index.ts`:

```typescript
export { generateArticleMetadata } from "./generators";
```

## См. также

- [Next.js Metadata Documentation](https://nextjs.org/docs/app/building-your-application/optimizing/metadata)
- [Open Graph Protocol](https://ogp.me/)
- [Schema.org](https://schema.org/)
