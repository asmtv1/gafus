# @gafus/core

Переиспользуемая бизнес-логика для Web и React Native приложений.

## Установка

Пакет автоматически доступен в workspace:

```json
{
  "dependencies": {
    "@gafus/core": "workspace:*"
  }
}
```

## Структура

```
packages/core/
├── src/
│   ├── services/          # Бизнес-логика
│   │   ├── course/        # Курсы, избранное, отзывы
│   │   ├── user/          # Профиль, настройки
│   │   ├── auth/          # Аутентификация
│   │   ├── notifications/ # Уведомления о шагах
│   │   ├── subscriptions/ # Push-подписки
│   │   ├── tracking/      # Аналитика
│   │   └── achievements/  # Достижения, даты
│   ├── errors/            # ServiceError, prismaErrorHandler
│   ├── utils/             # Универсальные утилиты
│   │   ├── age/           # getAge, getAgeWithMonths
│   │   ├── pluralize.ts   # declOfNum (склонение)
│   │   ├── date.ts        # formatDate
│   │   ├── pet.ts         # getPetTypeLabel
│   │   └── video.ts       # getEmbeddedVideoInfo
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Использование

### Импорт сервисов

```typescript
// Курсы
import { getCourseMetadata, getCoursesWithProgress } from "@gafus/core/services/course";

// Пользователь
import { getUserProfile, updateUserProfile } from "@gafus/core/services/user";

// Аутентификация
import { checkUserState, registerUser } from "@gafus/core/services/auth";

// Уведомления
import { createStepNotification } from "@gafus/core/services/notifications";

// Подписки
import { savePushSubscription } from "@gafus/core/services/subscriptions";

// Трекинг
import { trackPresentationView } from "@gafus/core/services/tracking";

// Достижения
import { getUserTrainingDates } from "@gafus/core/services/achievements";

// Утилиты (общие)
import { 
  getAge, 
  getAgeWithMonths, 
  declOfNum, 
  formatDate, 
  getPetTypeLabel, 
  getEmbeddedVideoInfo,
  normalizeTelegramInput,
  getTelegramUrl,
  calculateDayStatus,
  retryWithBackoff
} from "@gafus/core/utils";

// Или отдельные модули утилит:
import { formatDate } from "@gafus/core/utils/date";
import { getAge, getAgeWithMonths } from "@gafus/core/utils/age";
import { declOfNum } from "@gafus/core/utils/pluralize";
import { getPetTypeLabel } from "@gafus/core/utils/pet";
import { getEmbeddedVideoInfo } from "@gafus/core/utils/video";
import { normalizeTelegramInput, normalizeInstagramInput, getTelegramUrl } from "@gafus/core/utils/social";
import { calculateDayStatus, calculateCourseStatus } from "@gafus/core/utils/training";
import { retryWithBackoff, retryServerAction } from "@gafus/core/utils/retry";
```

### Обработка ошибок

```typescript
import { ServiceError, prismaErrorHandler } from "@gafus/core/errors";

try {
  const result = await someService();
} catch (error) {
  const handledError = prismaErrorHandler(error as Error, {
    operation: "create",
    entity: "User"
  });
  
  if (handledError instanceof ServiceError) {
    // Обработка известной ошибки
    console.log(handledError.code, handledError.message);
  }
}
```

## Конфигурация TypeScript

В `tsconfig.json` приложения добавьте paths:

```json
{
  "compilerOptions": {
    "paths": {
      "@gafus/core": ["../../packages/core/src/index.ts"],
      "@gafus/core/services/course": ["../../packages/core/src/services/course/index.ts"],
      "@gafus/core/services/user": ["../../packages/core/src/services/user/index.ts"],
      "@gafus/core/services/auth": ["../../packages/core/src/services/auth/index.ts"],
      "@gafus/core/services/notifications": ["../../packages/core/src/services/notifications/index.ts"],
      "@gafus/core/services/subscriptions": ["../../packages/core/src/services/subscriptions/index.ts"],
      "@gafus/core/services/tracking": ["../../packages/core/src/services/tracking/index.ts"],
      "@gafus/core/services/achievements": ["../../packages/core/src/services/achievements/index.ts"],
      "@gafus/core/errors": ["../../packages/core/src/errors/index.ts"],
      "@gafus/core/utils": ["../../packages/core/src/utils/index.ts"]
    }
  }
}
```

## Конфигурация Next.js

В `next.config.ts`:

```typescript
const nextConfig = {
  transpilePackages: ['@gafus/core'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@gafus/core": path.resolve(__dirname, "../../packages/core/src"),
      "@gafus/core/services/course": path.resolve(__dirname, "../../packages/core/src/services/course"),
      "@gafus/core/utils": path.resolve(__dirname, "../../packages/core/src/utils"),
      // ... остальные пути
    };
    return config;
  },
};
```

## Зависимости

- `@gafus/prisma` - ORM
- `@gafus/logger` - логирование
- `@gafus/types` - типы
- `@gafus/queues` - очереди
- `@gafus/cdn-upload` - загрузка файлов
- `@gafus/auth` - аутентификация
- `zod` - валидация
- `libphonenumber-js` - валидация телефонов

## Разработка

```bash
# Сборка
pnpm turbo run build --filter=@gafus/core

# Watch режим
cd packages/core && pnpm dev

# Проверка типов
cd packages/core && pnpm typecheck
```

## Миграция из apps/web

Бизнес-логика и утилиты перенесены из `apps/web/src/shared/services/`, `apps/web/src/shared/errors/`, и `apps/web/src/shared/utils/`.

Импорты в server actions и компонентах изменены:
- `@shared/services/course/*` → `@gafus/core/services/course`
- `@shared/services/user/*` → `@gafus/core/services/user`
- `@shared/utils/socialLinks` → `@gafus/core/utils/social`
- `@shared/utils/trainingCalculations` → `@gafus/core/utils/training`
- `@shared/utils/retryUtils` → `@gafus/core/utils/retry`
- `@/utils/getAge` → `@gafus/core/utils/age`
- `@/utils/date` → `@gafus/core/utils/date`
- `@/utils/pluralize` → `@gafus/core/utils/pluralize`
- `@/utils/petType` → `@gafus/core/utils/pet`
- `@/utils/getEmbeddedVideoUrl` → `@gafus/core/utils/video`
- и т.д.
