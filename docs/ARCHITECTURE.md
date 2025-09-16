# Архитектура системы Gafus

## 🏗️ Обзор архитектуры

Gafus построен как монорепозиторий с микросервисной архитектурой, где каждое приложение и пакет имеют четко определенные роли и ответственность. Система использует современный технологический стек и следует принципам чистой архитектуры.

## 🎯 Принципы архитектуры

### 1. Разделение ответственности
- Каждое приложение решает конкретную бизнес-задачу
- Пакеты содержат переиспользуемую логику
- Четкие границы между компонентами

### 2. Масштабируемость
- Горизонтальное масштабирование приложений
- Независимое развертывание компонентов
- Микросервисная архитектура

### 3. Типобезопасность
- TypeScript во всех компонентах
- Общие типы в централизованном пакете
- Строгая типизация API

### 4. Переиспользование
- Общие пакеты для всех приложений
- Консистентный UI/UX
- Единая система аутентификации

## 🏢 Структура системы

```
gafus/
├── apps/                    # Приложения (микросервисы)
│   ├── web/                # Пользовательское приложение
│   ├── trainer-panel/      # Панель тренера
│   ├── telegram-bot/       # Telegram бот
│   ├── error-dashboard/    # Мониторинг ошибок
│   └── bull-board/         # Управление очередями
├── packages/               # Общие пакеты
│   ├── auth/              # Аутентификация
│   ├── prisma/            # База данных
│   ├── types/             # Типы
│   ├── ui-components/     # UI компоненты
│   ├── webpush/           # Push уведомления
│   ├── worker/            # Фоновые задачи
│   ├── queues/            # Очереди
│   ├── react-query/       # Состояние
│   ├── csrf/              # CSRF защита
│   └── error-handling/    # Обработка ошибок
└── infrastructure/        # Инфраструктура
    ├── docker/            # Docker конфигурации
    ├── nginx/             # Nginx конфигурации
    └── scripts/           # Скрипты развертывания
```

## 🔄 Архитектурные слои

### 1. Presentation Layer (Слой представления)
**Приложения:**
- **Web App** - пользовательский интерфейс
- **Trainer Panel** - административный интерфейс
- **Error Dashboard** - интерфейс мониторинга
- **Bull Board** - интерфейс управления очередями

**Технологии:**
- Next.js 15 с App Router
- React 19 с Server Components
- Material-UI для компонентов
- Tailwind CSS для стилизации

### 2. Business Logic Layer (Слой бизнес-логики)
**Пакеты:**
- **Auth** - аутентификация и авторизация
- **Worker** - фоновые задачи
- **WebPush** - push уведомления
- **Error Handling** - обработка ошибок

**Технологии:**
- Node.js серверы
- NextAuth.js для аутентификации
- BullMQ для очередей
- Web Push API

### 3. Data Access Layer (Слой доступа к данным)
**Пакеты:**
- **Prisma** - ORM и миграции
- **Types** - типизация данных
- **Queues** - управление очередями

**Технологии:**
- PostgreSQL как основная БД
- Redis для кэширования и очередей
- Prisma ORM
- TypeScript типы

### 4. Infrastructure Layer (Инфраструктурный слой)
**Компоненты:**
- Docker контейнеры
- Nginx reverse proxy
- CI/CD пайплайны
- Мониторинг и логирование

## 🌐 Сетевая архитектура

### Внешние сервисы
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Browser   │    │  Mobile App     │    │  Telegram Bot   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Nginx Proxy   │
                    └─────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web App       │    │ Trainer Panel   │    │ Error Dashboard │
│   (Port 3002)   │    │ (Port 3001)     │    │ (Port 3005)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   API Gateway   │
                    └─────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │     Redis       │    │  Background     │
│   Database      │    │   Cache/Queue   │    │   Workers       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Внутренняя коммуникация
- **HTTP/HTTPS** - для веб-приложений
- **WebSocket** - для real-time обновлений
- **Redis Pub/Sub** - для межсервисного общения
- **Queue Messages** - для асинхронных задач

## 🗄️ Архитектура данных

### База данных PostgreSQL
```sql
-- Основные таблицы
Users (id, email, name, role, ...)
Courses (id, name, description, level, ...)
Trainings (id, userId, courseId, status, ...)
Steps (id, courseDayId, name, description, ...)
Achievements (id, name, description, ...)
PushLogs (id, userId, message, status, ...)
```

### Redis кэширование
```typescript
// Кэширование пользователей
const userCache = {
  key: `user:${userId}`,
  ttl: 3600, // 1 час
  data: userData
};

// Кэширование курсов
const courseCache = {
  key: `course:${courseId}`,
  ttl: 7200, // 2 часа
  data: courseData
};
```

### Очереди задач
```typescript
// Push уведомления
const pushQueue = new Queue('push-notifications', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
  }
});

// Email уведомления
const emailQueue = new Queue('email-notifications', {
  connection: redisConnection
});
```

## 🔐 Архитектура безопасности

### Аутентификация
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │───▶│  NextAuth   │───▶│  Database   │
│             │    │   Server    │    │             │
└─────────────┘    └─────────────┘    └─────────────┘
                           │
                           ▼
                   ┌─────────────┐
                   │   JWT Token │
                   │  Generation │
                   └─────────────┘
```

### Авторизация
- **Role-based Access Control (RBAC)**
- **Middleware для проверки прав**
- **CSRF защита**
- **Rate limiting**

### Защита данных
- **Шифрование паролей** (bcrypt)
- **HTTPS для всех соединений**
- **Валидация входных данных**
- **SQL injection защита** (Prisma)

## 📊 Архитектура мониторинга

### Логирование
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Application│───▶│   Logger    │───▶│  Log Store  │
│     Logs    │    │  (Winston)  │    │ (File/DB)   │
└─────────────┘    └─────────────┘    └─────────────┘
```

### Мониторинг ошибок
- **Error Dashboard** - централизованный сбор ошибок
- **Real-time мониторинг** - WebSocket обновления
- **Алерты** - уведомления о критических ошибках
- **Метрики** - производительность и использование

### Health Checks
```typescript
// Health check endpoint
app.get('/health', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    queues: await checkQueues()
  };
  
  const isHealthy = Object.values(checks).every(check => check.status === 'ok');
  
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    checks
  });
});
```

## 🚀 Архитектура развертывания

### Docker контейнеризация
```dockerfile
# Multi-stage build для оптимизации
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  web:
    build: ./apps/web
    ports:
      - "3002:3002"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/gafus
    depends_on:
      - db
      - redis

  trainer-panel:
    build: ./apps/trainer-panel
    ports:
      - "3001:3001"
    depends_on:
      - db
      - redis

  db:
    image: postgres:14
    environment:
      - POSTGRES_DB=gafus
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:6-alpine
    ports:
      - "6379:6379"
```

### CI/CD пайплайн
```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: pnpm install
      - run: pnpm test
      - run: pnpm typecheck
      - run: pnpm lint

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: pnpm build
      - run: docker build -t gafus/web ./apps/web
      - run: docker build -t gafus/trainer-panel ./apps/trainer-panel

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: docker-compose up -d
```

## 🔄 Паттерны архитектуры

### 1. Repository Pattern
```typescript
// Абстракция доступа к данным
interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(user: CreateUserData): Promise<User>;
  update(id: string, data: UpdateUserData): Promise<User>;
  delete(id: string): Promise<void>;
}

// Реализация через Prisma
class PrismaUserRepository implements UserRepository {
  constructor(private prisma: PrismaClient) {}
  
  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
  // ... другие методы
}
```

### 2. Service Layer Pattern
```typescript
// Бизнес-логика в сервисах
class UserService {
  constructor(
    private userRepo: UserRepository,
    private authService: AuthService
  ) {}
  
  async createUser(data: CreateUserData): Promise<User> {
    // Валидация
    if (!this.isValidEmail(data.email)) {
      throw new Error('Invalid email');
    }
    
    // Хеширование пароля
    const hashedPassword = await this.authService.hashPassword(data.password);
    
    // Создание пользователя
    return this.userRepo.create({
      ...data,
      password: hashedPassword
    });
  }
}
```

### 3. Event-Driven Architecture
```typescript
// События для асинхронной обработки
interface UserRegisteredEvent {
  type: 'USER_REGISTERED';
  payload: {
    userId: string;
    email: string;
    name: string;
  };
}

// Обработчик событий
class UserEventHandler {
  async handleUserRegistered(event: UserRegisteredEvent) {
    // Отправка welcome email
    await this.emailService.sendWelcomeEmail(event.payload.email);
    
    // Создание начальных данных
    await this.userDataService.createInitialData(event.payload.userId);
  }
}
```

### 4. CQRS (Command Query Responsibility Segregation)
```typescript
// Команды для изменения данных
interface CreateUserCommand {
  type: 'CREATE_USER';
  payload: CreateUserData;
}

// Запросы для чтения данных
interface GetUserQuery {
  type: 'GET_USER';
  payload: { id: string };
}

// Обработчики команд и запросов
class CreateUserCommandHandler {
  async handle(command: CreateUserCommand): Promise<void> {
    // Логика создания пользователя
  }
}

class GetUserQueryHandler {
  async handle(query: GetUserQuery): Promise<User | null> {
    // Логика получения пользователя
  }
}
```

## 📈 Масштабирование

### Горизонтальное масштабирование
- **Load Balancer** - распределение нагрузки
- **Stateless приложения** - независимость от состояния
- **Database sharding** - разделение данных
- **CDN** - кэширование статики

### Вертикальное масштабирование
- **Увеличение ресурсов** - CPU, RAM, Storage
- **Оптимизация запросов** - индексы, кэширование
- **Connection pooling** - пулы соединений
- **Memory optimization** - оптимизация памяти

### Кэширование
```typescript
// Многоуровневое кэширование
const cacheStrategy = {
  L1: 'In-memory cache',      // Самый быстрый
  L2: 'Redis cache',          // Быстрый, общий
  L3: 'Database cache',       // Медленный, персистентный
  L4: 'External API cache'    // Самый медленный
};
```

## 🔧 Конфигурация

### Environment Variables
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/gafus"

# Redis
REDIS_URL="redis://localhost:6379"

# Authentication
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# External Services
TELEGRAM_BOT_TOKEN="your-bot-token"
VAPID_PUBLIC_KEY="your-vapid-public-key"
VAPID_PRIVATE_KEY="your-vapid-private-key"
```

### Feature Flags
```typescript
// Управление функциональностью
const featureFlags = {
  ENABLE_PUSH_NOTIFICATIONS: process.env.ENABLE_PUSH_NOTIFICATIONS === 'true',
  ENABLE_TELEGRAM_BOT: process.env.ENABLE_TELEGRAM_BOT === 'true',
  ENABLE_ANALYTICS: process.env.ENABLE_ANALYTICS === 'true',
};
```

## 🧪 Тестирование

### Пирамида тестирования
```
        ┌─────────────┐
        │   E2E Tests │  ← Меньше, медленнее, дороже
        └─────────────┘
       ┌─────────────────┐
       │ Integration     │
       │ Tests           │
       └─────────────────┘
    ┌───────────────────────┐
    │   Unit Tests          │  ← Больше, быстрее, дешевле
    └───────────────────────┘
```

### Стратегия тестирования
- **Unit тесты** - 70% покрытия
- **Integration тесты** - 20% покрытия
- **E2E тесты** - 10% покрытия

## 📚 Документация

### Техническая документация
- **API документация** - OpenAPI/Swagger
- **Архитектурные решения** - ADR (Architecture Decision Records)
- **Диаграммы** - Mermaid диаграммы
- **Руководства** - по разработке и развертыванию

### Живая документация
- **Storybook** - для UI компонентов
- **API Explorer** - для тестирования API
- **Database Schema** - Prisma Studio
- **Queue Dashboard** - Bull Board
