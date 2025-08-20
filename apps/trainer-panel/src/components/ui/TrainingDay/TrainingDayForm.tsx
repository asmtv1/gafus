"use client";

import { Alert, Box, Typography } from "@mui/material";
import React from "react";
import { useForm, type RegisterOptions } from "react-hook-form";

import { FormField, SelectField } from "@/components/ui/FormField";
import { MarkdownInput } from "@/shared/components/common";
import { ValidationErrors } from "@/shared/components/ui/ValidationError";
import { commonValidationRules } from "@/shared/hooks/useFormValidation";

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
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Заполните информацию о дне тренировки, обязательные поля отмечены звездочкой
      </Typography>

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
          { value: "introduction", label: "Вводный день" },
          { value: "test", label: "Проверочный или экзаменационный день" },
          { value: "rest", label: "День отдыха" },
        ]}
        rules={commonValidationRules.dayType as RegisterOptions<TrainingDayFormData, "type">}
      />

      <FormField
        id="equipment"
        label="Необходимое оборудование"
        name="equipment"
        placeholder="например: поводок, игрушки, лакомства"
        form={form}
      />

      <Box sx={{ mb: 3 }}>
        <Typography variant="body1" sx={{ mb: 1 }}>
          Описание *
        </Typography>
        <MarkdownInput
          value={form.watch("description")}
          onChange={(value: string) => form.setValue("description", value)}
        />
        {form.formState.errors.description && (
          <Alert severity="error" sx={{ mt: 1 }}>
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
