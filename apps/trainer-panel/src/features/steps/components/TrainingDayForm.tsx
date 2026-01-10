"use client";

import { Alert, AlertTitle, Box, Typography } from "@mui/material";
import MarkdownInput from "@shared/components/common/MarkdownInput";
import { FormField, SelectField } from "@shared/components/ui/FormField";
import { ValidationErrors } from "@shared/components/ui/ValidationError";
import { commonValidationRules } from "@shared/hooks/useFormValidation";
import React from "react";
import { useForm, type RegisterOptions } from "react-hook-form";

import sharedStyles from "@shared/styles/FormLayout.module.css";

interface TrainingDayFormData {
  title: string;
  type: string;
  description: string;
  equipment: string;
}

interface TrainingDayFormProps {
  title?: string;
  type?: string;
  description?: string;
  equipment?: string;
  onChange: (data: TrainingDayFormData) => void;
}

export default function TrainingDayForm({
  title,
  type,
  description,
  equipment,
  onChange,
}: TrainingDayFormProps) {
  const form = useForm<TrainingDayFormData>({
    mode: "onBlur",
    defaultValues: {
      title: title ?? "",
      type: type ?? "regular",
      description: description ?? "",
      equipment: equipment ?? "",
    },
  });

  // Сбрасываем значения формы при изменении входящих пропсов
  React.useEffect(() => {
    form.reset({
      title: title ?? "",
      type: type ?? "regular",
      description: description ?? "",
      equipment: equipment ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, type, description, equipment]);

  // Обновляем родительский компонент при изменении формы
  React.useEffect(() => {
    const subscription = form.watch((value) => {
      onChange(value as TrainingDayFormData);
    });
    return () => subscription.unsubscribe();
  }, [form, onChange]);

  return (
    <Box className={sharedStyles.formContainer}>
      <FormField
        id="title"
        label="Название дня *"
        name="title"
        placeholder="Введите название дня"
        form={form}
        rules={commonValidationRules.dayTitle as RegisterOptions<TrainingDayFormData, "title">}
      />

      <SelectField
        id="type"
        label="Тип дня *"
        name="type"
        form={form}
        options={[
          { value: "regular", label: "Тренировочный день" },
          { value: "introduction", label: "Вводный блок" },
          { value: "instructions", label: "Инструкции" },
          { value: "diagnostics", label: "Диагностика" },
          { value: "summary", label: "Подведение итогов" },
        ]}
        rules={commonValidationRules.dayType as RegisterOptions<TrainingDayFormData, "type">}
      />

      <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
        <AlertTitle>Различия между типами дней:</AlertTitle>
        <Typography variant="body2" component="div" sx={{ mt: 1 }}>
          <strong>Тренировочный день</strong> — основной день с практическими упражнениями и шагами.
          <br />
          <em>В курсе нумеруется как "День 1, 2..."</em>
          <br />
          <br />
          <strong>Вводный блок</strong> — знакомство с курсом, общая информация.
          <br />
          <em>В курсе не нумеруется.</em>
          <br />
          <br />
          <strong>Инструкции</strong> — правила, рекомендации, методические материалы.
          <br />
          <em>В курсе не нумеруется.</em>
          <br />
          <br />
          <strong>Диагностика</strong> — проверка начального уровня знаний и навыков.
          <br />
          <em>В курсе не нумеруется.</em>
          <br />
          <br />
          <strong>Подведение итогов</strong> — финальный день с результатами и выводами.
          <br />
          <em>В курсе не нумеруется, закрыт для просмотра ученику пока все дни до него не будут пройдены.</em>
        </Typography>
      </Alert>

      <FormField
        id="equipment"
        label="Необходимое оборудование"
        name="equipment"
        placeholder="например: поводок, игрушки, лакомства"
        form={form}
      />

      <Box className={sharedStyles.formField}>
        <Typography className={sharedStyles.formLabel}>Описание *</Typography>
        <MarkdownInput
          value={form.watch("description")}
          onChange={(value: string) => form.setValue("description", value)}
        />
        {form.formState.errors.description && (
          <Alert severity="error" className={sharedStyles.formAlert}>
            {form.formState.errors.description.message}
          </Alert>
        )}
      </Box>

      <ValidationErrors
        errors={Object.fromEntries(
          Object.entries(form.formState.errors).map(([key, error]) => [
            key,
            // Преобразуем объект ошибки RHF в строку
            (error as { message?: string } | undefined)?.message || undefined,
          ]),
        )}
      />
    </Box>
  );
}
