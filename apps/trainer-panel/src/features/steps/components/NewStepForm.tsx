"use client";

import { MarkdownInput } from "@shared/components/common";
import { FormField, NumberField } from "@shared/components/ui/FormField";
import { ValidationErrors } from "@shared/components/ui/ValidationError";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import styles from "./NewStepForm.module.css";

import type { ActionResult } from "@gafus/types";

import { Alert, Box, Button, Typography } from "@/utils/muiImports";

interface StepFormData {
  title: string;
  description: string;
  duration: string;
  videoUrl: string;
}

interface StepInitialData {
  id?: string;
  title?: string;
  description?: string;
  durationSec?: number;
  videoUrl?: string | null;
  imageUrls?: string[];
  pdfUrls?: string[];
}

type ServerAction = (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;

interface NewStepFormProps {
  initialData?: StepInitialData;
  serverAction: ServerAction;
}

export default function NewStepForm({ initialData, serverAction }: NewStepFormProps) {
  const hasInitial = Boolean(initialData && (initialData.title || initialData.id));
  const router = useRouter();

  // Используем useState вместо useActionState для локального управления
  const [formState, setFormState] = useState<ActionResult>({});
  const [isPending, setIsPending] = useState(false);

  const [imageUrls, setImageUrls] = useState<string[]>(initialData?.imageUrls ?? []);
  const [pdfUrls, setPdfUrls] = useState<string[]>(initialData?.pdfUrls ?? []);
  const [_imagePreviews, _setImagePreviews] = useState<string[]>([]);
  const [_pdfNames, _setPdfNames] = useState<string[]>([]);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showErrorMessage, setShowErrorMessage] = useState(false);
  const [_successCount, _setSuccessCount] = useState(0);
  const [_localSuccess, setLocalSuccess] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const form = useForm<StepFormData>({
    mode: "onBlur",
    defaultValues: {
      title: initialData?.title ?? "",
      description: initialData?.description ?? "",
      duration: initialData?.durationSec != null ? String(initialData.durationSec) : "",
      videoUrl: initialData?.videoUrl ?? "",
    },
  });

  useEffect(() => {
    // Синхронизируем дефолтные значения при смене initialData
    if (initialData) {
      form.reset({
        title: initialData.title ?? "",
        description: initialData.description ?? "",
        duration: initialData.durationSec != null ? String(initialData.durationSec) : "",
        videoUrl: initialData.videoUrl ?? "",
      });
      setImageUrls(initialData.imageUrls ?? []);
      setPdfUrls(initialData.pdfUrls ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData?.id]);

  // Локальные правила валидации
  const validationRules = {
    title: {
      required: "Название обязательно",
      minLength: { value: 3, message: "Минимум 3 символа" },
      maxLength: { value: 100, message: "Максимум 100 символов" },
    },
    duration: {
      required: "Длительность обязательна",
      validate: (value: string) => {
        if (!value) return "Введите длительность";
        const num = parseInt(value);
        if (isNaN(num) || num <= 0) return "Длительность должна быть положительным числом";
        if (num > 1000) return "Длительность не может быть больше 1000";
        return true;
      },
    },
    videoUrl: {
      validate: (value: string) => {
        if (!value) return true; // Необязательное поле
        const urlPattern = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|rutube\.ru|vimeo\.com)\/.+/;
        return urlPattern.test(value) || "Неверный формат ссылки на видео";
      },
    },
  };

  const handleSubmit = async (data: StepFormData) => {
    setIsPending(true);

    try {
      const formData = new FormData();
      if (initialData?.id) formData.append("id", initialData.id);
      formData.append("title", data.title);
      formData.append("description", data.description);
      formData.append("duration", data.duration);
      if (data.videoUrl) formData.append("videoUrl", data.videoUrl);

      imageUrls.forEach((url) => formData.append("imageUrls", url));
      pdfUrls.forEach((url) => formData.append("pdfUrls", url));

      const result = await serverAction({}, formData);
      setFormState(result);
    } catch (error) {
      setFormState({ error: error instanceof Error ? error.message : "Произошла ошибка" });
    } finally {
      setIsPending(false);
    }
  };

  useEffect(() => {
    if (formState?.success) {
      if (hasInitial) {
        // Если редактировали существующий шаг - показываем уведомление и редиректим
        setShowSuccessMessage(true);

        // Редиректим через 2 секунды, чтобы пользователь увидел уведомление
        setTimeout(() => {
          router.push("/main-panel/steps");
        }, 2000);
      } else {
        // Если создавали новый шаг - очищаем форму
        setLocalSuccess(true);

        // Показываем уведомление об успехе
        setShowSuccessMessage(true);

        // Скрываем уведомление через 6 секунд
        setTimeout(() => {
          setShowSuccessMessage(false);
        }, 6000);

        // Очищаем форму сразу после успешного создания
        form.reset();
        setImageUrls([]);
        setPdfUrls([]);
        _setImagePreviews([]);
        _setPdfNames([]);

        // Увеличиваем key чтобы пересоздать компонент с чистым formState
        setFormKey((prev) => prev + 1);

        // Сбрасываем formState чтобы useEffect сработал при следующем создании
        setFormState({});
      }
    }

    if (formState?.error) {
      setShowErrorMessage(true);

      // Скрываем уведомление об ошибке через 5 секунд
      setTimeout(() => {
        setShowErrorMessage(false);
      }, 5000);
    }
  }, [formState?.success, formState?.error, hasInitial, form, router]);

  return (
    <Box key={formKey} className={styles.formContainer}>
      <Typography variant="h6" gutterBottom className={styles.sectionTitle}>
        {hasInitial ? "Измените шаг тренировки" : "Заполните шаг тренировки"}
      </Typography>

      {showErrorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {formState?.error}
        </Alert>
      )}

      {showSuccessMessage && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {hasInitial ? "Шаг успешно обновлён!" : "Шаг успешно создан!"}
        </Alert>
      )}

      <form onSubmit={form.handleSubmit(handleSubmit)}>
        {initialData?.id ? <input type="hidden" name="id" value={initialData.id} /> : null}
        <FormField
          id="title"
          label="Название шага *"
          name="title"
          placeholder="Введите название шага"
          form={form}
          rules={validationRules.title}
        />

        <Box sx={{ mb: 3 }}>
          <Typography className={styles.inputLabel}>Описание *</Typography>
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

        <NumberField
          id="duration"
          label="Длительность (секунды) *"
          name="duration"
          placeholder="Введите длительность"
          form={form}
          rules={validationRules.duration}
        />

        <FormField
          id="videoUrl"
          label="Ссылка на видео"
          name="videoUrl"
          placeholder="https://youtube.com/..."
          form={form}
          rules={validationRules.videoUrl}
        />

        {/* Здесь можно добавить загрузку изображений и PDF */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Медиа файлы (опционально)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Функция загрузки файлов будет добавлена позже
          </Typography>
        </Box>

        <ValidationErrors
          errors={Object.fromEntries(
            Object.entries(form.formState.errors).map(([key, error]) => [
              key,
              error?.message || undefined,
            ]),
          )}
        />

        <Button
          type="submit"
          variant="contained"
          disabled={isPending || !form.formState.isValid}
          sx={{ mt: 2 }}
        >
          {isPending
            ? hasInitial
              ? "Сохранение..."
              : "Создание..."
            : hasInitial
              ? "Сохранить изменения"
              : "Создать шаг"}
        </Button>
      </form>
    </Box>
  );
}
