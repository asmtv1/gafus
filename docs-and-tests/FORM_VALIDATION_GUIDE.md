# Руководство по валидации форм с React Hook Form

## Обзор

В проекте используется React Hook Form для валидации форм на клиенте. Это обеспечивает:

- ✅ Типобезопасность с TypeScript
- ✅ Производительность (минимальные ре-рендеры)
- ✅ Гибкость в настройке правил валидации
- ✅ Хорошую интеграцию с существующими компонентами

## Основные компоненты

### 1. Универсальный хук валидации

```typescript
import { useFormWithValidation, commonValidationRules } from "@/hooks/useFormValidation";

// Создание формы с валидацией
const { form, isFormValid, getErrors } = useFormWithValidation(defaultValues, validationSchema);
```

### 2. Компоненты полей

```typescript
import {
  TextField,
  EmailField,
  PasswordField,
  NumberField,
  DateField,
  TextAreaField,
  SelectField
} from "@/components/ui/FormField";

// Использование
<TextField
  id="name"
  label="Имя"
  name="name"
  form={form}
  rules={commonValidationRules.name}
/>
```

### 3. Компоненты ошибок

```typescript
import { ValidationError, ValidationErrors } from "@/components/ui/ValidationError";

// Одиночная ошибка
<ValidationError error={errors.name?.message} />

// Множественные ошибки
<ValidationErrors errors={errors} />
```

## Предустановленные правила валидации

### Базовые правила

```typescript
import { commonValidationRules } from "@/hooks/useFormValidation";

// Обязательное поле
rules={commonValidationRules.required("Сообщение")}

// Email
rules={commonValidationRules.email}

// Телефон
rules={commonValidationRules.phone}

// Пароль
rules={commonValidationRules.password}

// Имя
rules={commonValidationRules.name}

// Число с ограничениями
rules={commonValidationRules.number(0, 100)}

// Дата
rules={commonValidationRules.date}
```

### Кастомные правила

```typescript
const customRules = {
  required: "Поле обязательно",
  minLength: { value: 3, message: "Минимум 3 символа" },
  maxLength: { value: 50, message: "Максимум 50 символов" },
  pattern: {
    value: /^[а-яёА-ЯЁa-zA-Z\s]+$/,
    message: "Только буквы и пробелы",
  },
  validate: (value) => {
    // Кастомная логика валидации
    return true || "Ошибка валидации";
  },
};
```

## Примеры использования

### 1. Форма регистрации

```typescript
import { useForm } from "react-hook-form";
import { TextField, PasswordField } from "@/components/ui/FormField";
import { commonValidationRules } from "@/hooks/useFormValidation";

export function RegisterForm() {
  const form = useForm({
    mode: "onBlur",
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: ""
    }
  });

  const onSubmit = (data) => {
    // Обработка отправки формы
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <TextField
        id="name"
        label="Имя"
        name="name"
        form={form}
        rules={commonValidationRules.name}
      />

      <TextField
        id="email"
        label="Email"
        name="email"
        form={form}
        rules={commonValidationRules.email}
      />

      <PasswordField
        id="password"
        label="Пароль"
        name="password"
        form={form}
        rules={commonValidationRules.password}
      />

      <PasswordField
        id="confirmPassword"
        label="Подтвердите пароль"
        name="confirmPassword"
        form={form}
        rules={{
          required: "Подтвердите пароль",
          validate: (value) =>
            value === form.getValues("password") || "Пароли не совпадают"
        }}
      />

      <button
        type="submit"
        disabled={!form.formState.isValid}
      >
        Зарегистрироваться
      </button>
    </form>
  );
}
```

### 2. Форма с селектом

```typescript
import { SelectField } from "@/components/ui/FormField";

<SelectField
  id="type"
  label="Тип"
  name="type"
  form={form}
  options={[
    { value: "DOG", label: "Собака" },
    { value: "CAT", label: "Кошка" }
  ]}
  rules={{
    required: "Выберите тип",
    validate: (value) =>
      ["DOG", "CAT"].includes(value) || "Неверный тип"
  }}
/>
```

### 3. Форма с числовыми полями

```typescript
import { NumberField } from "@/components/ui/FormField";

<NumberField
  id="age"
  label="Возраст"
  name="age"
  form={form}
  rules={commonValidationRules.number(0, 120)}
/>

<NumberField
  id="weight"
  label="Вес (кг)"
  name="weight"
  form={form}
  rules={commonValidationRules.number(0.1, 500)}
/>
```

## Лучшие практики

### 1. Режимы валидации

```typescript
// Валидация при потере фокуса (рекомендуется)
const form = useForm({ mode: "onBlur" });

// Валидация при изменении
const form = useForm({ mode: "onChange" });

// Валидация при отправке
const form = useForm({ mode: "onSubmit" });
```

### 2. Обработка ошибок сервера

```typescript
const onSubmit = async (data) => {
  try {
    const result = await submitForm(data);
    if (result.error) {
      // Установка ошибки для конкретного поля
      form.setError("email", { message: result.error });
    }
  } catch (error) {
    // Обработка общих ошибок
    console.error(error);
  }
};
```

### 3. Условная валидация

```typescript
const rules = {
  email: {
    required: "Email обязателен",
    validate: (value) => {
      if (!value) return true; // Пропускаем если поле пустое
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || "Неверный email";
    },
  },
};
```

### 4. Валидация зависимых полей

```typescript
const rules = {
  confirmPassword: {
    required: "Подтвердите пароль",
    validate: (value) => {
      const password = form.getValues("password");
      return value === password || "Пароли не совпадают";
    },
  },
};
```

## Отличия от Zod

### Преимущества React Hook Form:

1. **Производительность** - минимальные ре-рендеры
2. **Гибкость** - легко настраивать кастомные правила
3. **Интеграция** - отличная работа с React компонентами
4. **Размер бандла** - меньше зависимостей
5. **Простота** - не требует дополнительных схем

### Когда использовать Zod:

1. **Сложная серверная валидация** - Zod лучше для валидации API
2. **Сериализация/десериализация** - Zod отлично подходит для парсинга данных
3. **Строгая типизация** - Zod может генерировать типы из схем

## Миграция с существующих форм

### До (без валидации):

```typescript
<input
  type="text"
  value={name}
  onChange={(e) => setName(e.target.value)}
/>
```

### После (с валидацией):

```typescript
<TextField
  id="name"
  label="Имя"
  name="name"
  form={form}
  rules={commonValidationRules.name}
/>
```

## Тестирование

### Тестирование валидации:

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { useForm } from "react-hook-form";

test("показывает ошибку при неверном email", () => {
  const TestComponent = () => {
    const form = useForm();
    return (
      <TextField
        name="email"
        form={form}
        rules={commonValidationRules.email}
      />
    );
  };

  render(<TestComponent />);

  const input = screen.getByRole("textbox");
  fireEvent.blur(input);

  expect(screen.getByText("Email обязателен")).toBeInTheDocument();
});
```

## Заключение

React Hook Form предоставляет мощную и гибкую систему валидации, которая отлично подходит для клиентской валидации форм. Используйте предустановленные правила и компоненты для быстрой разработки, а кастомные правила для специфических требований.
