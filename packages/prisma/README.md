# @gafus/prisma

Пакет для работы с базой данных в проекте Gafus. Экспортирует типы Prisma и предоставляет интерфейсы для работы с базой данных.

## Использование

### Импорт типов

```typescript
import type { User, Course, TrainingDay } from "@gafus/prisma";
```

### Импорт клиента

```typescript
import { prisma } from "@gafus/prisma";
// или
import prismaClient from "@gafus/prisma";
```

### Создание нового клиента

```typescript
import { createPrismaClient } from "@gafus/prisma";

const client = createPrismaClient();
```

## Принципы

- Пакет НЕ экспортирует `@prisma/client` напрямую
- Экспортируются только типы и интерфейсы
- Клиент создается через функцию `createPrismaClient()` или импортируется готовый экземпляр
- Все типы базы данных доступны через этот пакет

## Структура

- `index.ts` - основные экспорты типов и интерфейсов
- `client.ts` - готовый экземпляр PrismaClient для приложений
