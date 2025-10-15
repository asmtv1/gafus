# Web приложение (@gafus/web)

## 📋 Обзор

Веб-приложение GAFUS - это основное пользовательское приложение для владельцев домашних животных, предоставляющее доступ к курсам обучения, отслеживанию прогресса и управлению профилями питомцев.

## 🎯 Основные функции

### Для пользователей
- **📚 Курсы обучения** - Структурированные программы тренировок
- **🐕 Профили питомцев** - Управление информацией о животных
- **📊 Статистика прогресса** - Отслеживание достижений
- **🏆 Система достижений** - Награды и сертификаты
- **📱 PWA поддержка** - Работа в офлайн режиме

### Технические особенности
- **Next.js 15** с App Router
- **TypeScript** для типобезопасности
- **Material-UI** для компонентов интерфейса
- **PWA** с Service Worker
- **Офлайн поддержка** с кэшированием

## 🏗️ Архитектура

### Структура приложения
```
apps/web/
├── src/
│   ├── app/                    # App Router страницы
│   │   ├── (auth)/            # Аутентификация
│   │   ├── (main)/            # Основное приложение
│   │   ├── api/               # API routes
│   │   └── layout.tsx         # Корневой layout
│   ├── features/              # Функциональные модули
│   │   ├── achievements/      # Достижения
│   │   ├── courses/           # Курсы
│   │   ├── profile/           # Профиль пользователя
│   │   ├── statistics/        # Статистика
│   │   └── training/          # Тренировки
│   ├── shared/                # Общие компоненты
│   │   ├── components/        # UI компоненты
│   │   ├── hooks/             # React хуки
│   │   ├── lib/               # Утилиты и библиотеки
│   │   └── stores/            # Zustand stores
│   └── utils/                 # Утилиты
├── public/                    # Статические файлы
└── scripts/                   # Скрипты сборки
```

### Роутинг
```typescript
// App Router структура
app/
├── (auth)/
│   ├── login/
│   ├── register/
│   └── reset-password/
├── (main)/
│   ├── dashboard/
│   ├── courses/
│   ├── profile/
│   ├── statistics/
│   └── training/
└── ~offline/
    └── page.tsx              # Офлайн страница
```

## 🎨 UI и UX

### Дизайн система
- **Material Design** принципы
- **Адаптивный дизайн** для всех устройств
- **Темная/светлая тема** поддержка
- **Accessibility** (a11y) соответствие

### 🆕 UX-улучшения (Mobile-First PWA)

#### 📱 Haptic Feedback
Тактильная обратная связь для нативного ощущения:
- **Старт таймера** - средняя вибрация (20ms)
- **Завершение шага** - паттерн успеха (10ms-50ms-10ms)
- **Получение достижения** - паттерн успеха
- **Ошибки** - специальный паттерн (50ms-100ms-50ms)

```typescript
// Утилита: apps/web/src/utils/hapticFeedback.ts
import { hapticStart, hapticComplete, hapticAchievement } from "@/utils/hapticFeedback";

// Использование
hapticStart();     // При начале действия
hapticComplete();  // При завершении
```

#### 📍 Индикатор "Вы здесь"
Навигационный индикатор на списке дней тренировок:
- Показывает текущее положение пользователя
- Анимированное свечение для привлечения внимания
- Автоматическое определение текущего дня:
  - Первый IN_PROGRESS день
  - Или следующий после последнего COMPLETED
  - Или первый день по умолчанию

#### 🎉 Конфетти при достижениях
Празднование успехов с визуальными эффектами:
- **Завершение курса** - эпическое конфетти (3 секунды)
- **Получение достижения** - быстрое конфетти
- **Завершение дня** - конфетти с двух сторон

```typescript
// Утилита: apps/web/src/utils/confetti.ts
import { celebrateCourseCompletion, celebrateAchievement } from "@/utils/confetti";

// Автоматически при завершении через хук
useCourseCompletionCelebration({
  courseId,
  courseType,
  trainingDays
});
```

#### 🎊 Система празднования
Комплексная система для мотивации пользователей:
- Haptic feedback + конфетти + уведомление
- Работает оффлайн
- Не повторяется при перезагрузке
- Адаптирована под мобильные устройства

### Основные страницы

#### Главная страница
- Обзор доступных курсов
- Статистика прогресса
- Быстрый доступ к тренировкам

#### Профиль питомца
- Информация о животном
- Фотографии и заметки
- Достижения и награды

#### Тренировки
- Пошаговые инструкции
- Видео и изображения
- Прогресс выполнения
- Таймер тренировок

#### Статистика
- Графики прогресса
- Достижения
- Время тренировок

## 🔧 Технические особенности

### PWA функциональность
```typescript
// next.config.ts
const withPWA = require('@ducanh2912/next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development'
});

module.exports = withPWA({
  // PWA настройки
  pwa: {
    register: true,
    skipWaiting: true,
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-cache',
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 365 // 365 дней
          }
        }
      }
    ]
  }
});
```

### Управление состоянием
```typescript
// Zustand stores
import { create } from 'zustand';

interface UserStore {
  user: User | null;
  setUser: (user: User) => void;
  clearUser: () => void;
}

export const useUserStore = create<UserStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null })
}));
```

### Офлайн поддержка
```typescript
// Service Worker для кэширования
self.addEventListener('fetch', (event) => {
  if (event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});
```

## 📱 Мобильная оптимизация

### Адаптивный дизайн
- **Breakpoints** для разных размеров экранов
- **Touch-friendly** интерфейс
- **Swipe gestures** для навигации
- **Optimized images** для мобильных устройств

### Производительность
- **Lazy loading** компонентов
- **Image optimization** с Next.js
- **Code splitting** для уменьшения bundle size
- **Bundle analysis** для оптимизации

## 🔐 Безопасность

### Аутентификация
```typescript
// Middleware для защиты маршрутов
import { withAuth } from '@gafus/auth/server';

export default withAuth(async function handler(req, res) {
  // Защищенный API endpoint
  res.json({ data: 'protected data' });
});
```

### CSRF защита
```typescript
import { useCsrfToken } from '@gafus/csrf/react';

function ProtectedForm() {
  const csrfToken = useCsrfToken();
  
  return (
    <form>
      <input type="hidden" name="_csrf" value={csrfToken} />
      {/* поля формы */}
    </form>
  );
}
```

## 📊 Аналитика и мониторинг

### Отслеживание событий
```typescript
import { logger } from '@gafus/logger';

// Отслеживание пользовательских действий
logger.info('User action', {
  action: 'course_started',
  courseId: 'course_123',
  userId: 'user_456'
});
```

### Производительность
```typescript
// Bundle analyzer
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true'
});

module.exports = withBundleAnalyzer({
  // конфигурация
});
```

## 🧪 Тестирование

### Unit тесты
```typescript
import { render, screen } from '@testing-library/react';
import { UserProfile } from './UserProfile';

test('renders user profile', () => {
  render(<UserProfile user={mockUser} />);
  expect(screen.getByText(mockUser.name)).toBeInTheDocument();
});
```

### E2E тесты
```typescript
import { test, expect } from '@playwright/test';

test('user can complete training', async ({ page }) => {
  await page.goto('/training/course-123');
  await page.click('[data-testid="start-training"]');
  await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();
});
```

## 🚀 Развертывание

### Переменные окружения
```env
# Next.js
NEXT_PUBLIC_APP_URL=https://gafus.ru
NEXTAUTH_URL=https://gafus.ru
NEXTAUTH_SECRET=your-secret

# API
NEXT_PUBLIC_API_URL=https://api.gafus.ru

# PWA
NEXT_PUBLIC_PWA_NAME=GAFUS
NEXT_PUBLIC_PWA_SHORT_NAME=GAFUS
```

### Docker
```dockerfile
FROM node:18-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM base AS build
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runtime
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["npm", "start"]
```

## 📈 Оптимизация

### Производительность
- **Image optimization** с Next.js Image
- **Font optimization** с Google Fonts
- **CSS optimization** с Tailwind CSS
- **JavaScript optimization** с Webpack

### SEO
```typescript
// metadata.ts
export const metadata: Metadata = {
  title: 'GAFUS - Обучение домашних животных',
  description: 'Профессиональные курсы дрессировки собак и кошек',
  keywords: ['дрессировка', 'собаки', 'кошки', 'обучение'],
  openGraph: {
    title: 'GAFUS - Обучение домашних животных',
    description: 'Профессиональные курсы дрессировки',
    images: ['/og-image.jpg']
  }
};
```

## 🔧 Разработка

### Команды разработки
```bash
# Разработка
pnpm dev                    # Запуск в режиме разработки (порт 3002)

# Сборка
pnpm build                  # Сборка для продакшена
pnpm start                  # Запуск продакшен версии

# Анализ
pnpm analyze                # Анализ размера bundle
pnpm analyze:build          # Анализ после сборки

# Линтинг
pnpm lint                   # Проверка кода
pnpm lint:fix              # Исправление ошибок
```

### Структура компонентов
```typescript
// Feature-based структура
features/
├── courses/
│   ├── components/         # Компоненты курсов
│   ├── hooks/             # Хуки для курсов
│   ├── lib/               # Логика курсов
│   └── types.ts           # Типы курсов
├── profile/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   └── types.ts
```

---

*Веб-приложение GAFUS предоставляет современный, быстрый и удобный интерфейс для обучения домашних животных.*
