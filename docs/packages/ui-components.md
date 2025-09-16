# UI Components Package - Переиспользуемые компоненты

## 🎨 Описание

Пакет `@gafus/ui-components` содержит переиспользуемые UI компоненты для всех приложений в экосистеме Gafus. Обеспечивает консистентность дизайна, ускоряет разработку и упрощает поддержку интерфейса.

## 🎯 Основные функции

### Переиспользуемые компоненты
- Готовые компоненты для общих задач
- Консистентный дизайн во всех приложениях
- Типобезопасные пропсы
- Настраиваемые стили и поведение

### Дизайн система
- Единая цветовая схема
- Консистентная типографика
- Стандартные размеры и отступы
- Адаптивные компоненты

### Интеграция с Material-UI
- Основа на Material-UI компонентах
- Кастомизация темы
- Поддержка темной/светлой темы
- Адаптивный дизайн

## 🏗️ Архитектура

### Технологический стек
- **React 19** - UI библиотека
- **TypeScript** - типизация
- **Material-UI** - базовые компоненты
- **Emotion** - CSS-in-JS
- **Next.js** - интеграция с Next.js

### Структура пакета

```
packages/ui-components/
├── src/
│   ├── LoginForm.tsx           # Форма входа
│   ├── index.ts                # Главный экспорт
│   └── components/             # Дополнительные компоненты
│       ├── Button/             # Кастомные кнопки
│       ├── Form/               # Формы
│       ├── Layout/             # Макеты
│       └── ...
├── dist/                       # Скомпилированный код
└── package.json                # Зависимости
```

## 🔧 API Reference

### LoginForm - Форма входа

#### Пропсы
```typescript
interface LoginFormProps {
  title?: string;                    // Заголовок формы
  subtitle?: string;                 // Подзаголовок
  icon?: React.ReactNode;           // Иконка
  allowedRoles?: UserRole[];        // Разрешенные роли
  redirectPath?: string;            // Путь перенаправления
  onSuccess?: () => void;           // Колбэк успешного входа
  onError?: (error: string) => void; // Колбэк ошибки
}
```

#### Использование
```typescript
import { LoginForm } from "@gafus/ui-components";

// Базовая форма входа
<LoginForm />

// Форма с кастомизацией
<LoginForm
  title="Вход в панель тренера"
  subtitle="Введите ваши учетные данные"
  allowedRoles={['TRAINER', 'ADMIN']}
  redirectPath="/trainer-panel"
  onSuccess={() => console.log('Успешный вход')}
  onError={(error) => console.error('Ошибка:', error)}
/>
```

#### Функциональность
- **Аутентификация** - интеграция с NextAuth.js
- **Валидация ролей** - проверка прав доступа
- **Обработка ошибок** - отображение ошибок входа
- **Состояние загрузки** - индикатор процесса входа
- **Перенаправление** - автоматическое перенаправление после входа

## 🚀 Использование

### Установка
```bash
# В package.json приложения
{
  "dependencies": {
    "@gafus/ui-components": "workspace:*"
  }
}
```

### Импорт компонентов
```typescript
// Импорт конкретного компонента
import { LoginForm } from "@gafus/ui-components";

// Импорт всех компонентов
import * as UI from "@gafus/ui-components";
```

### Использование в Next.js
```typescript
// app/login/page.tsx
import { LoginForm } from "@gafus/ui-components";

export default function LoginPage() {
  return (
    <LoginForm
      title="Вход в систему"
      subtitle="Введите ваши учетные данные"
      redirectPath="/dashboard"
    />
  );
}
```

### Использование в приложениях
```typescript
// apps/web/src/app/login/page.tsx
import { LoginForm } from "@gafus/ui-components";

export default function WebLoginPage() {
  return (
    <LoginForm
      title="Добро пожаловать в Gafus"
      subtitle="Войдите в свой аккаунт"
      redirectPath="/"
    />
  );
}

// apps/trainer-panel/src/app/login/page.tsx
import { LoginForm } from "@gafus/ui-components";

export default function TrainerLoginPage() {
  return (
    <LoginForm
      title="Панель тренера"
      subtitle="Войдите в панель управления"
      allowedRoles={['TRAINER', 'ADMIN']}
      redirectPath="/main-panel"
    />
  );
}
```

## 🎨 Дизайн система

### Цветовая схема
```typescript
// Основные цвета
const colors = {
  primary: '#1976d2',      // Основной цвет
  secondary: '#dc004e',    // Вторичный цвет
  success: '#2e7d32',      // Успех
  warning: '#ed6c02',      // Предупреждение
  error: '#d32f2f',        // Ошибка
  info: '#0288d1',         // Информация
};
```

### Типографика
```typescript
// Размеры шрифтов
const typography = {
  h1: { fontSize: '2.5rem', fontWeight: 600 },
  h2: { fontSize: '2rem', fontWeight: 600 },
  h3: { fontSize: '1.75rem', fontWeight: 500 },
  h4: { fontSize: '1.5rem', fontWeight: 500 },
  h5: { fontSize: '1.25rem', fontWeight: 500 },
  h6: { fontSize: '1rem', fontWeight: 500 },
  body1: { fontSize: '1rem', fontWeight: 400 },
  body2: { fontSize: '0.875rem', fontWeight: 400 },
};
```

### Размеры и отступы
```typescript
// Стандартные отступы
const spacing = {
  xs: 4,    // 4px
  sm: 8,    // 8px
  md: 16,   // 16px
  lg: 24,   // 24px
  xl: 32,   // 32px
  xxl: 48,  // 48px
};
```

## 🔧 Кастомизация

### Переопределение стилей
```typescript
import { LoginForm } from "@gafus/ui-components";
import { ThemeProvider, createTheme } from '@mui/material/styles';

const customTheme = createTheme({
  palette: {
    primary: {
      main: '#your-color',
    },
  },
  typography: {
    h4: {
      fontSize: '2rem',
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={customTheme}>
      <LoginForm />
    </ThemeProvider>
  );
}
```

### Кастомные пропсы
```typescript
// Расширение пропсов
interface CustomLoginFormProps extends LoginFormProps {
  customStyle?: React.CSSProperties;
  showForgotPassword?: boolean;
  onForgotPassword?: () => void;
}

// Использование
<LoginForm
  customStyle={{ maxWidth: 400 }}
  showForgotPassword={true}
  onForgotPassword={() => console.log('Забыли пароль?')}
/>
```

## 🧪 Тестирование

### Unit тесты
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { LoginForm } from "@gafus/ui-components";

describe('LoginForm', () => {
  test('renders login form', () => {
    render(<LoginForm />);
    
    expect(screen.getByText('Вход в систему')).toBeInTheDocument();
    expect(screen.getByLabelText('Имя пользователя')).toBeInTheDocument();
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
  });

  test('handles form submission', async () => {
    const onSuccess = jest.fn();
    render(<LoginForm onSuccess={onSuccess} />);
    
    fireEvent.change(screen.getByLabelText('Имя пользователя'), {
      target: { value: 'test@example.com' }
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: 'password123' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    
    // Проверка вызова колбэка
    expect(onSuccess).toHaveBeenCalled();
  });
});
```

### Integration тесты
```typescript
import { render, screen } from '@testing-library/react';
import { SessionProvider } from 'next-auth/react';
import { LoginForm } from "@gafus/ui-components";

const mockSession = {
  user: { role: 'TRAINER' },
  expires: '2024-12-31'
};

test('integrates with NextAuth', () => {
  render(
    <SessionProvider session={mockSession}>
      <LoginForm allowedRoles={['TRAINER']} />
    </SessionProvider>
  );
  
  // Проверка интеграции
  expect(screen.getByText('Вход в систему')).toBeInTheDocument();
});
```

## 📱 Адаптивность

### Responsive дизайн
```typescript
// Адаптивные размеры
const responsiveSizes = {
  mobile: { maxWidth: 'sm' },
  tablet: { maxWidth: 'md' },
  desktop: { maxWidth: 'lg' },
};

// Использование
<LoginForm
  title="Вход в систему"
  // Автоматическая адаптация под размер экрана
/>
```

### Mobile-first подход
- Компоненты оптимизированы для мобильных устройств
- Адаптивные размеры и отступы
- Touch-friendly интерфейс
- Оптимизация для различных экранов

## 🔐 Безопасность

### Валидация входных данных
- Проверка email формата
- Валидация паролей
- Санитизация пользовательского ввода
- Защита от XSS атак

### CSRF защита
- Интеграция с NextAuth CSRF защитой
- Валидация токенов
- Защита от подделки запросов

## 📊 Производительность

### Оптимизация
- Lazy loading компонентов
- Мемоизация для предотвращения лишних рендеров
- Оптимизация бандла
- Tree shaking неиспользуемого кода

### Bundle size
- Минимальный размер пакета
- Оптимизация импортов
- Удаление неиспользуемого кода

## 🚀 Развертывание

### Сборка
```bash
pnpm build
```

### Проверка типов
```bash
pnpm typecheck
```

### Очистка
```bash
pnpm clean
```

### Watch режим для разработки
```bash
pnpm dev
```

## 🔄 Разработка

### Добавление новых компонентов
1. Создать файл компонента в `src/`
2. Определить типы и интерфейсы
3. Реализовать компонент
4. Добавить экспорт в `index.ts`
5. Написать тесты
6. Обновить документацию

### Структура нового компонента
```typescript
// src/Button.tsx
import React from 'react';
import { Button as MuiButton, ButtonProps as MuiButtonProps } from '@mui/material';

export interface CustomButtonProps extends MuiButtonProps {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
}

export const CustomButton: React.FC<CustomButtonProps> = ({
  variant = 'primary',
  size = 'medium',
  loading = false,
  children,
  ...props
}) => {
  return (
    <MuiButton
      variant={variant === 'primary' ? 'contained' : 'outlined'}
      size={size}
      disabled={loading}
      {...props}
    >
      {loading ? 'Загрузка...' : children}
    </MuiButton>
  );
};
```

### Экспорт из index.ts
```typescript
// src/index.ts
export { LoginForm } from './LoginForm';
export { CustomButton } from './Button';
export type { CustomButtonProps } from './Button';
```

## 📚 Примеры использования

### Полная интеграция в приложение
```typescript
// app/layout.tsx
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { theme } from './theme';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

// app/login/page.tsx
import { LoginForm } from "@gafus/ui-components";

export default function LoginPage() {
  return (
    <LoginForm
      title="Добро пожаловать в Gafus"
      subtitle="Войдите в свой аккаунт для доступа к тренировкам"
      redirectPath="/dashboard"
      onSuccess={() => {
        // Дополнительная логика после успешного входа
        console.log('Пользователь успешно вошел в систему');
      }}
      onError={(error) => {
        // Обработка ошибок
        console.error('Ошибка входа:', error);
      }}
    />
  );
}
```
