# Руководство по валидации форм в Trainer Panel

## Обзор

В trainer-panel внедрена система валидации на основе React Hook Form, адаптированная для работы с Material-UI компонентами.

## Основные компоненты

### 1. Универсальный хук валидации

```typescript
import { useFormWithValidation, commonValidationRules } from "@/hooks/useFormValidation";

// Создание формы с валидацией
const { form, isFormValid, getErrors } = useFormWithValidation(defaultValues, validationSchema);
```

### 2. Компоненты полей с Material-UI

```typescript
import {
  FormField,
  TextFieldComponent,
  NumberField,
  SelectField,
  TextAreaField
} from "@/components/ui/FormField";

// Использование
<FormField
  id="title"
  label="Название"
  name="title"
  form={form}
  rules={commonValidationRules.title}
/>
```

### 3. Компоненты ошибок

```typescript
import { ValidationError, ValidationErrors, FieldError } from "@/components/ui/ValidationError";

// Одиночная ошибка
<ValidationError error={errors.title?.message} />

// Множественные ошибки
<ValidationErrors errors={errors} />

// Ошибка под полем
<FieldError error={errors.title?.message} />
```

## Предустановленные правила валидации

### Базовые правила

```typescript
import { commonValidationRules } from "@/hooks/useFormValidation";

// Название
rules={commonValidationRules.title}

// Описание
rules={commonValidationRules.description}

// Краткое описание
rules={commonValidationRules.shortDescription}

// Длительность
rules={commonValidationRules.duration}

// Ссылка на видео
rules={commonValidationRules.videoUrl}

// Изображение
rules={commonValidationRules.imageUrl}

// Название курса
rules={commonValidationRules.courseName}

// Продолжительность курса
rules={commonValidationRules.courseDuration}

// Название дня
rules={commonValidationRules.dayTitle}

// Тип дня
rules={commonValidationRules.dayType}

// Описание дня
rules={commonValidationRules.dayDescription}
```

## Примеры использования

### 1. Форма создания шага

```typescript
import { useForm } from "react-hook-form";
import { FormField, NumberField } from "@/components/ui/FormField";
import { commonValidationRules } from "@/hooks/useFormValidation";

export function NewStepForm() {
  const form = useForm({
    mode: "onBlur",
    defaultValues: {
      title: "",
      description: "",
      duration: "",
      videoUrl: ""
    }
  });

  const onSubmit = (data) => {
    // Обработка отправки формы
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FormField
        id="title"
        label="Название шага *"
        name="title"
        form={form}
        rules={commonValidationRules.title}
      />

      <NumberField
        id="duration"
        label="Длительность (секунды) *"
        name="duration"
        form={form}
        rules={commonValidationRules.duration}
      />

      <FormField
        id="videoUrl"
        label="Ссылка на видео"
        name="videoUrl"
        form={form}
        rules={commonValidationRules.videoUrl}
      />

      <button
        type="submit"
        disabled={!form.formState.isValid}
      >
        Создать шаг
      </button>
    </form>
  );
}
```

### 2. Форма создания курса

```typescript
import { FormField, TextAreaField, SelectField } from "@/components/ui/FormField";

<FormField
  id="name"
  label="Название курса *"
  name="name"
  form={form}
  rules={commonValidationRules.courseName}
/>

<TextAreaField
  id="shortDesc"
  label="Краткое описание *"
  name="shortDesc"
  form={form}
  rules={commonValidationRules.shortDescription}
/>

<FormField
  id="duration"
  label="Продолжительность курса *"
  name="duration"
  form={form}
  rules={commonValidationRules.courseDuration}
/>
```

### 3. Форма дня тренировки

```typescript
import { FormField, SelectField } from "@/components/ui/FormField";

<FormField
  id="title"
  label="Название дня *"
  name="title"
  form={form}
  rules={commonValidationRules.dayTitle}
/>

<SelectField
  id="type"
  label="Тип дня *"
  name="type"
  form={form}
  options={[
    { value: "regular", label: "Тренировочный день" },
    { value: "introduction", label: "Вводный день" },
    { value: "test", label: "Проверочный день" },
    { value: "rest", label: "День отдыха" }
  ]}
  rules={commonValidationRules.dayType}
/>
```

## Серверная валидация

### Валидация в server actions

```typescript
import { validateStepForm, validateCourseForm } from "@/lib/validation/serverValidation";

export async function createStep(prevState: ActionResult, formData: FormData) {
  try {
    const title = formData.get("title")?.toString() || "";
    const description = formData.get("description")?.toString() || "";
    const duration = formData.get("duration")?.toString() || "";

    // Серверная валидация
    const validation = validateStepForm({
      title,
      description,
      duration,
      videoUrl: formData.get("videoUrl")?.toString() || "",
    });

    if (!validation.isValid) {
      return { error: `Ошибка валидации: ${Object.values(validation.errors).join(", ")}` };
    }

    // Создание в БД
    // ...
  } catch (error) {
    return { error: "Не удалось создать шаг" };
  }
}
```

### Доступные функции валидации

- `validateStepForm()` - валидация формы шага
- `validateCourseForm()` - валидация формы курса
- `validateTrainingDayForm()` - валидация формы дня тренировки
- `validateForm()` - универсальная валидация

## Интеграция с Material-UI

### Стилизация ошибок

```typescript
// Автоматическая стилизация ошибок в FormField
<FormField
  id="title"
  label="Название"
  name="title"
  form={form}
  rules={commonValidationRules.title}
  // Ошибки отображаются автоматически через helperText
/>
```

### Кастомные компоненты ошибок

```typescript
import { Alert } from "@mui/material";
import { ValidationErrors } from "@/components/ui/ValidationError";

<ValidationErrors errors={form.formState.errors} />
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
      form.setError("title", { message: result.error });
    }
  } catch (error) {
    console.error(error);
  }
};
```

### 3. Условная валидация

```typescript
const rules = {
  videoUrl: {
    validate: (value) => {
      if (!value) return true; // Пропускаем если поле пустое
      const urlPattern = /^https?:\/\/(www\.)?(youtube\.com|rutube\.ru)\/.+/;
      return urlPattern.test(value) || "Неверный формат ссылки на видео";
    },
  },
};
```

## Отличия от web приложения

### 1. Material-UI интеграция

- Использует Material-UI компоненты вместо HTML элементов
- Автоматическая стилизация ошибок через `helperText`
- Поддержка Material-UI тем и стилей

### 2. Специфичные правила валидации

- Правила адаптированы под контент trainer-panel
- Поддержка валидации курсов, шагов и дней тренировок
- Специальные правила для видео ссылок

### 3. Компоненты ошибок

- Использует Material-UI Alert компоненты
- Поддержка множественных ошибок
- Интеграция с Material-UI темами

## Миграция существующих форм

### До (без валидации):

```typescript
<TextField
  value={title}
  onChange={(e) => setTitle(e.target.value)}
  fullWidth
  required
/>
```

### После (с валидацией):

```typescript
<FormField
  id="title"
  label="Название"
  name="title"
  form={form}
  rules={commonValidationRules.title}
/>
```

## Тестирование

### Тестирование валидации:

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { useForm } from "react-hook-form";

test("показывает ошибку при неверном названии", () => {
  const TestComponent = () => {
    const form = useForm();
    return (
      <FormField
        name="title"
        form={form}
        rules={commonValidationRules.title}
      />
    );
  };

  render(<TestComponent />);

  const input = screen.getByRole("textbox");
  fireEvent.blur(input);

  expect(screen.getByText("Название обязательно")).toBeInTheDocument();
});
```

## Заключение

Система валидации в trainer-panel обеспечивает:

1. **Типобезопасность** - полная поддержка TypeScript
2. **Производительность** - минимальные ре-рендеры
3. **Интеграция с Material-UI** - автоматическая стилизация
4. **Серверная валидация** - безопасность данных
5. **Переиспользуемость** - готовые компоненты и правила

Используйте предустановленные правила для быстрой разработки и создавайте кастомные правила для специфических требований.
