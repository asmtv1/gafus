# Trainer Panel (@gafus/trainer-panel)

## 📋 Обзор

Trainer Panel - это административная панель для тренеров и администраторов системы GAFUS, предоставляющая инструменты для создания курсов, управления пользователями и анализа статистики.

## 🎯 Основные функции

### Для тренеров

- **👥 Управление пользователями** - Просмотр и редактирование профилей
- **📝 Создание контента** - Разработка курсов и шагов тренировок
- **📊 Аналитика** - Статистика использования и прогресса
- **✅ Проверка экзаменов** - Оценка результатов тестирования
- **📈 Отчеты** - Детальная аналитика по курсам и пользователям

> Вся серверная логика по сбору статистики вынесена в пакет `@gafus/statistics`, поэтому внутри приложения остаются только UI-компоненты и server actions-обёртки.

**Вне scope миграции в core:** функциональность `features/ai-chat/` (шифрование API-ключей, вызовы OpenRouter) не переносится в `@gafus/core` и остаётся в приложении.

### Для администраторов

- **🔧 Системное управление** - Настройка системы
- **👤 Управление ролями** - Назначение прав доступа
- **📊 Общая статистика** - Системная аналитика
- **🛠️ Техническое обслуживание** - Мониторинг и диагностика
- **📢 Push-рассылка** - Массовая отправка push-уведомлений всем пользователям

## 🏗️ Архитектура

### Структура приложения

```
apps/trainer-panel/
├── src/
│   ├── app/                    # App Router страницы
│   │   ├── (main)/            # Основная панель
│   │   │   └── main-panel/    # Главная панель управления
│   │   ├── api/               # API routes
│   │   └── layout.tsx         # Корневой layout
│   ├── features/              # Функциональные модули
│   │   ├── admin/             # Административные функции
│   │   ├── broadcasts/        # Push-рассылки
│   │   ├── courses/           # Управление курсами
│   │   ├── exam-results/      # Результаты экзаменов
│   │   ├── statistics/        # Статистика и аналитика
│   │   ├── steps/             # Управление шагами
│   │   └── users/             # Управление пользователями
│   ├── shared/                # Общие компоненты
│   │   ├── components/        # UI компоненты
│   │   ├── hooks/             # React хуки
│   │   ├── lib/               # Утилиты и библиотеки
│   │   └── providers/         # Context провайдеры
│   └── utils/                 # Утилиты
└── public/                    # Статические файлы
```

### Разделение слоёв и @gafus/core

Бизнес-логика панели тренера вынесена в пакет **@gafus/core**. В приложении остаются только:

1. **Проверка сессии и роли** — `getServerSession(authOptions)`, доступ только для TRAINER / ADMIN / MODERATOR.
2. **Парсинг и валидация ввода** — Zod-схемы (часто реэкспорт из core), FormData/JSON. Валидация файлов (тип, размер) — через `validateImageUpload` / `validateVideoUpload` из core.
3. **Вызов сервисов core** — например `createTrainerNote()`, `createCourse()`, `updateStep()`.
4. **Инвалидация кэша** — только при `result.success`: `revalidatePath()`, `revalidateTag()`, `invalidateCoursesCache()`, `invalidateTrainingDaysCache()`.
5. **CDN-операции** — загрузка/удаление файлов на CDN выполняется в app; core получает и возвращает только URL/пути.

Порядок в Server Action: (1) сессия/роль → (2) валидация → (3) вызов core → (4) при успехе — revalidate.

Критические гарантии (регрессии при изменении): сохранение связей DayOnCourse при обновлении курса (прогресс пользователей не теряется), откат CDN при ошибке core после загрузки файла, транзакционность проверки экзамена (UserStep + ExamResult). Подробнее — [trainer-panel-core-migration.md](../development/trainer-panel-core-migration.md).

Сервисы core, используемые trainer-panel: **notes**, **trainerCourse**, **trainerStep**, **trainingDay**, **trainerVideo**, **exam**, **user** (поиск), **course** (обновление логотипа). Статистика — **@gafus/statistics**.

### Инвалидация кэша и CACHE_TAGS

Теги для `revalidateTag()` заданы в **@gafus/core/services/cache** (`CACHE_TAGS`). В коде приложения используются только эти константы, а не строковые литералы. Функции `invalidateCoursesCache()` и `invalidateTrainingDaysCache()` в `shared/lib/actions/` также опираются на `CACHE_TAGS` из core.

### Роутинг

```typescript
// App Router структура
app/
├── (main)/
│   └── main-panel/
│       ├── dashboard/         # Главная панель
│       ├── courses/           # Управление курсами
│       ├── users/             # Управление пользователями
│       ├── statistics/        # Статистика
│       └── exam-results/      # Результаты экзаменов
└── login/                     # Авторизация
```

## 🎨 UI и UX

### Дизайн система

- **Material-UI** компоненты
- **Data Grid** для таблиц данных
- **Charts** для визуализации статистики
- **Responsive design** для всех устройств

### Основные страницы

#### Dashboard

- Общая статистика системы
- Активные курсы и пользователи
- Последние экзамены и результаты
- Быстрые действия

#### Управление курсами

- Создание и редактирование курсов
- **Тип курса:** переключатель «Полноценный курс» | «Мини-гайд». Мини-гайд — курс с одним HTML-документом вместо дней (чек-листы, справочники). Подробнее: [docs/features/guide-course-type.md](../features/guide-course-type.md).
- Управление днями тренировок (для дней типа «Подведение итогов» — опция «Показывать экспорт «Ваш путь» в этом дне» управляет видимостью кнопки экспорта PDF у пользователя)
- Создание шагов и экзаменов
- Загрузка медиа-контента
- **Поддержка видео:** YouTube, Rutube, Vimeo, VK Video; при создании/редактировании курса и шагов — выбор из загруженных в «Мои видео» (компонент `VideoSelector`).
- **Платные курсы:** создавать и назначать тип «Платный курс» могут только администратор и тренер с ником **gafus**. У остальных тренеров в форме курса опция «Платный курс» не отображается; при попытке создать/обновить платный курс через API возвращается ошибка.
- **Обязательные поля при создании курса:**
  - Название курса
  - Краткое описание
  - Полное описание
  - Продолжительность курса
  - **Логотип курса** (обязательно загрузить изображение)

#### Персонализированные курсы

При включённой галочке «Персонализированный курс» ученик при первом заходе заполняет своё имя, пол и имя питомца. В текстах шагов и дней курса доступны плейсхолдеры, которые подставляются автоматически:

| Плейсхолдер       | Падеж        | Пример (Андрей, муж.; Барсик) |
|-------------------|--------------|--------------------------------|
| `{{userName}}`    | Именительный | Андрей                         |
| `{{userNameGen}}` | Родительный  | Андрея                         |
| `{{userNameDat}}` | Дательный    | Андрею                         |
| `{{userNameAcc}}` | Винительный  | Андрея                         |
| `{{userNameIns}}` | Творительный | Андреем                        |
| `{{userNamePre}}` | Предложный   | об Андрее                      |
| `{{petName}}`     | Именительный | Барсик                         |
| `{{petNameGen}}`  | Родительный  | Барсика                        |
| `{{petNameDat}}`  | Дательный    | Барсику                        |
| `{{petNameAcc}}`  | Винительный  | Барсика                        |
| `{{petNameIns}}`  | Творительный | Барсиком                       |
| `{{petNamePre}}`  | Предложный    | о Барсике                      |

Склонение имени ученика задаётся полом (мужской/женский); склонение клички питомца — полом питомца (в форме персонализации можно указать «Пол питомца»: мужской/женский/не указан). Все пять падежей клички (родительный, дательный, винительный, творительный, предложный) можно исправить вручную в форме: кнопка «Подставить склонения» заполняет их автоматически, после чего пользователь может отредактировать любое поле.

**Согласование по полу** — для глаголов, прилагательных и местоимений используются плейсхолдеры вида «вариант для мужского|вариант для женского»: `{{userGenderPronoun:Он|Она}}`, `{{userGenderAdj:серьёзен|серьёзна}}`, `{{userGenderVerb:ждал|ждала}}`, `{{userGenderPoss:его|её}}` (ученик); `{{petGenderPronoun:он|она}}`, `{{petGenderAdj:готов|готова}}`, `{{petGenderVerb:сдался|сдалась}}` (питомец). Подставляется нужный вариант по полу ученика/питомца.

При создании и редактировании **шага** и **дня** тренировки под полями названия и описания отображается подсказка с перечнем плейсхолдеров и падежей. В карточке курса на странице статистики отображается бейдж «Персонализированный», если у курса включена эта опция.

**Примеры в тексте шага:**

- «{{userName}}, сегодня мы отработаем команду с {{petNameDat}}.»
- «Похвалите {{petName}} после выполнения.»
- «Мы учим {{petNameAcc}} держать позу» (винительный: кого?).
- «{{userNameDat}} понадобится 10 минут на этот блок.»

#### Мои видео

- Загрузка личных видео в CDN (папка `uploads/trainer-videos`)
- Полоса прогресса для длинных загрузок (до 200 МБ)
- Автоматическое сохранение метаданных (размер, расширение, дата)
- Список всех роликов тренера с возможностью копировать CDN-ссылку и открывать файл
- Использование загруженных видео в шагах, экзаменах и курсах

#### Управление пользователями

- Список всех пользователей
- Детальная информация о пользователях
- Управление ролями и правами
- Статистика активности

#### Результаты экзаменов

- Список всех сданных экзаменов по курсам тренера
- **Фильтрация:** Toggle "Скрыть зачтённые экзамены" для управления отображением
- **Статистика:** Счётчики всего/ожидающих/зачтённых экзаменов
- **Сохранение настроек:** Предпочтение фильтра сохраняется в localStorage
- Детальный просмотр ответов на тестовые вопросы
- Просмотр письменной обратной связи
- Просмотр видео отчётов
- Кнопка "Зачесть" для утверждения экзамена
- Статусы: "Ожидает проверки" (IN_PROGRESS), "Зачтено" (COMPLETED)

#### Статистика

- Графики прогресса пользователей
- Аналитика по курсам (в т.ч. вкладка «Открывшие» — пользователи, открывшие хотя бы один день курса, с детализацией дней и датами)
- Отчеты по экзаменам
- Экспорт данных

#### Push-рассылка (только ADMIN)

- **Массовая отправка уведомлений** - Отправка push-уведомлений всем пользователям с активными подписками
- **Форма рассылки:**
  - Заголовок уведомления (до 100 символов)
  - Текст уведомления (до 300 символов)
  - URL для перехода (необязательно)
- **Статистика отправки:**
  - Количество отправленных уведомлений
  - Количество неудачных попыток
  - Автоматическое удаление недействительных подписок
- **Безопасность:**
  - Доступ только для роли ADMIN
  - Валидация входных данных
  - Логирование всех рассылок

## 🔧 Технические особенности

### Валидация данных

- Для всех серверных экшенов используется `zod` (версия ^3.24.1) из зависимостей приложения, чтобы обеспечивать типобезопасную проверку форм и запросов.

### Material-UI интеграция

```typescript
// Настройка темы
import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: {
      main: "#1976d2",
    },
    secondary: {
      main: "#dc004e",
    },
  },
  components: {
    MuiDataGrid: {
      styleOverrides: {
        root: {
          "& .MuiDataGrid-cell": {
            borderBottom: "1px solid #e0e0e0",
          },
        },
      },
    },
  },
});
```

### Data Grid для таблиц

```typescript
import { DataGrid, GridColDef } from '@mui/x-data-grid';

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 90 },
  { field: 'username', headerName: 'Пользователь', width: 150 },
  { field: 'email', headerName: 'Email', width: 200 },
  { field: 'role', headerName: 'Роль', width: 120 },
];

function UsersTable({ users }: { users: User[] }) {
  return (
    <DataGrid
      rows={users}
      columns={columns}
      pageSize={25}
      rowsPerPageOptions={[25, 50, 100]}
      checkboxSelection
      disableSelectionOnClick
    />
  );
}
```

### Charts и аналитика

```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function StatisticsChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="users" stroke="#8884d8" />
        <Line type="monotone" dataKey="courses" stroke="#82ca9d" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

## 📊 Управление данными

### React Query для серверного состояния

```typescript
import { useQuery, useMutation, useQueryClient } from '@gafus/react-query';

function CoursesManager() {
  const queryClient = useQueryClient();

  const { data: courses, isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: fetchCourses
  });

  const createCourse = useMutation({
    mutationFn: createNewCourse,
    onSuccess: () => {
      queryClient.invalidateQueries(['courses']);
    }
  });

  return (
    <div>
      {isLoading ? <Loading /> : <CoursesList courses={courses} />}
      <CreateCourseButton onClick={() => createCourse.mutate()} />
    </div>
  );
}
```

### Формы с валидацией

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const courseSchema = z.object({
  name: z.string().min(1, 'Название обязательно'),
  description: z.string().min(10, 'Описание должно быть не менее 10 символов'),
  logoImg: z.string().min(1, 'Логотип курса обязателен'),
  trainingLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']),
});

function CourseForm() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(courseSchema)
  });

  const onSubmit = (data: any) => {
    createCourse.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <TextField
        {...register('name')}
        error={!!errors.name}
        helperText={errors.name?.message}
        label="Название курса"
      />
      {/* остальные поля */}
    </form>
  );
}
```

## 🔐 Безопасность и авторизация

### Ролевая модель доступа

```typescript
import { withRole } from "@gafus/auth/server";

// Только для тренеров и администраторов
export default withRole(["TRAINER", "ADMIN"])(async function handler(req, res) {
  const users = await getUsers();
  res.json({ users });
});

// Только для администраторов
export default withRole(["ADMIN"])(async function handler(req, res) {
  const systemStats = await getSystemStats();
  res.json({ stats: systemStats });
});
```

### Middleware для защиты маршрутов

```typescript
// middleware.ts
import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: ({ token, req }) => {
      const { pathname } = req.nextUrl;

      // Проверка роли для разных маршрутов
      if (pathname.startsWith("/main-panel/admin")) {
        return token?.role === "ADMIN";
      }

      if (pathname.startsWith("/main-panel")) {
        return ["TRAINER", "ADMIN", "MODERATOR"].includes(token?.role);
      }

      return !!token;
    },
  },
});

export const config = {
  matcher: ["/main-panel/:path*"],
};
```

## 📈 Аналитика и отчеты

### Статистика пользователей

```typescript
function UserStatistics() {
  const { data: stats } = useQuery({
    queryKey: ['user-statistics'],
    queryFn: fetchUserStatistics
  });

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={3}>
        <StatCard
          title="Всего пользователей"
          value={stats?.totalUsers}
          icon={<PeopleIcon />}
        />
      </Grid>
      <Grid item xs={12} md={3}>
        <StatCard
          title="Активных сегодня"
          value={stats?.activeToday}
          icon={<OnlineIcon />}
        />
      </Grid>
      {/* остальные карточки */}
    </Grid>
  );
}
```

### Экспорт данных

```typescript
function ExportData() {
  const exportUsers = useMutation({
    mutationFn: exportUsersToExcel,
    onSuccess: (data) => {
      const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'users.xlsx';
      a.click();
    }
  });

  return (
    <Button onClick={() => exportUsers.mutate()}>
      Экспорт пользователей
    </Button>
  );
}
```

## 🧪 Тестирование

### Unit тесты компонентов

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { CourseForm } from './CourseForm';

test('should create course successfully', async () => {
  const mockCreateCourse = jest.fn();
  render(<CourseForm onCreateCourse={mockCreateCourse} />);

  fireEvent.change(screen.getByLabelText('Название курса'), {
    target: { value: 'Тестовый курс' }
  });

  fireEvent.click(screen.getByText('Создать курс'));

  expect(mockCreateCourse).toHaveBeenCalledWith({
    name: 'Тестовый курс',
    description: '',
    trainingLevel: 'BEGINNER'
  });
});
```

### E2E тесты

```typescript
import { test, expect } from "@playwright/test";

test("trainer can create course", async ({ page }) => {
  await page.goto("/main-panel/courses");
  await page.click('[data-testid="create-course-button"]');

  await page.fill('[data-testid="course-name"]', "Новый курс");
  await page.fill('[data-testid="course-description"]', "Описание курса");
  await page.selectOption('[data-testid="training-level"]', "BEGINNER");

  await page.click('[data-testid="save-course"]');

  await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
});
```

## 🚀 Развертывание

### Переменные окружения

```env
# Next.js
NEXT_PUBLIC_APP_URL=https://trainer.gafus.ru
NEXTAUTH_URL=https://trainer.gafus.ru
NEXTAUTH_SECRET=your-secret

# API
NEXT_PUBLIC_API_URL=https://api.gafus.ru

# Роли доступа
TRAINER_PANEL_ALLOWED_ROLES=TRAINER,ADMIN,MODERATOR
```

### Docker

```dockerfile
FROM node:18-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runtime
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
EXPOSE 3001
CMD ["npm", "start"]
```

## 🔧 Разработка

### Команды разработки

```bash
# Разработка
pnpm dev                    # Запуск в режиме разработки (порт 3001)
pnpm build                  # Сборка для продакшена
pnpm start                  # Запуск продакшен версии

# Линтинг и типизация
pnpm lint                   # Проверка кода
pnpm typecheck             # Проверка типов
```

### Структура компонентов

```typescript
// Переиспользуемые компоненты
shared/components/
├── common/
│   ├── StatCard.tsx        # Карточка статистики
│   ├── DataTable.tsx       # Таблица данных
│   └── FormDialog.tsx      # Модальное окно формы
├── ui/
│   ├── Button.tsx          # Кнопка
│   ├── Input.tsx           # Поле ввода
│   └── Select.tsx          # Выпадающий список
└── Dashboard.tsx           # Основной dashboard
```

## 📊 Мониторинг

### Логирование действий

```typescript
import { logger } from "@gafus/logger";

// Логирование действий тренера
logger.info("Trainer action", {
  action: "course_created",
  trainerId: trainer.id,
  courseId: course.id,
  courseName: course.name,
});

// Логирование push-рассылок
logger.info("Broadcast push notification sent", {
  adminId: admin.id,
  totalSubscriptions: 150,
  sentCount: 148,
  failedCount: 2,
});
```

### Метрики производительности

```typescript
// Отслеживание времени загрузки
const startTime = Date.now();
const users = await fetchUsers();
const loadTime = Date.now() - startTime;

logger.info("Performance metric", {
  operation: "fetch_users",
  duration: loadTime,
  recordCount: users.length,
});
```

---

_Trainer Panel предоставляет мощные инструменты для управления системой обучения домашних животных и анализа результатов._
