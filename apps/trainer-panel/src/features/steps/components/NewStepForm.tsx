"use client";

import { MarkdownInput } from "@shared/components/common";
import { FormField, NumberField } from "@shared/components/ui/FormField";
import { ValidationErrors } from "@shared/components/ui/ValidationError";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import sharedStyles from "@shared/styles/FormLayout.module.css";
import FormSection from "@shared/components/FormSection";
import ChecklistEditor from "./ChecklistEditor";
import StepImageUploader from "./StepImageUploader";

import type { ActionResult } from "@gafus/types";

import { Alert, Box, Button, Typography, FormControlLabel, Checkbox, FormGroup } from "@/utils/muiImports";

interface ChecklistQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
}

interface StepFormData {
  title: string;
  description: string;
  duration: string;
  videoUrl: string;
  type: string;
  requiresVideoReport: boolean;
  requiresWrittenFeedback: boolean;
  hasTestQuestions: boolean;
}

interface StepInitialData {
  id?: string;
  title?: string;
  description?: string;
  durationSec?: number;
  videoUrl?: string | null;
  type?: string;
  imageUrls?: string[];
  pdfUrls?: string[];
  checklist?: ChecklistQuestion[];
  requiresVideoReport?: boolean;
  requiresWrittenFeedback?: boolean;
  hasTestQuestions?: boolean;
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

  const [imageFiles, setImageFiles] = useState<File[]>([]); // Состояние для файлов
  const [deletedImages, setDeletedImages] = useState<string[]>([]); // Состояние для удаленных изображений
  const [pdfUrls, setPdfUrls] = useState<string[]>(initialData?.pdfUrls ?? []);
  const [checklist, setChecklist] = useState<ChecklistQuestion[]>(initialData?.checklist ?? []);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showErrorMessage, setShowErrorMessage] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const form = useForm<StepFormData>({
    mode: "onBlur",
    defaultValues: {
      title: initialData?.title ?? "",
      description: initialData?.description ?? "",
      duration: initialData?.durationSec != null ? String(initialData.durationSec) : "",
      videoUrl: initialData?.videoUrl ?? "",
      type: initialData?.type ?? "TRAINING",
      requiresVideoReport: initialData?.requiresVideoReport ?? false,
      requiresWrittenFeedback: initialData?.requiresWrittenFeedback ?? false,
      hasTestQuestions: initialData?.hasTestQuestions ?? false,
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
        type: initialData.type ?? "TRAINING",
        requiresVideoReport: initialData.requiresVideoReport ?? false,
        requiresWrittenFeedback: initialData.requiresWrittenFeedback ?? false,
        hasTestQuestions: initialData.hasTestQuestions ?? false,
      });
      setImageFiles([]);
      setPdfUrls(initialData.pdfUrls ?? []);
      setChecklist(initialData.checklist ?? []);
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
      validate: (value: string | boolean) => {
        const strValue = String(value);
        // Для экзаменационных шагов длительность не обязательна
        if (!strValue) return true;
        const num = parseInt(strValue);
        if (isNaN(num) || num <= 0) return "Длительность должна быть положительным числом";
        if (num > 1000) return "Длительность не может быть больше 1000";
        return true;
      },
    },
    videoUrl: {
      validate: (value: string | boolean) => {
        const strValue = String(value);
        if (!strValue) return true; // Необязательное поле
        const urlPattern = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|rutube\.ru|vimeo\.com)\/.+/;
        return urlPattern.test(strValue) || "Неверный формат ссылки на видео";
      },
    },
    hasTestQuestions: {
      validate: (value: string | boolean) => {
        const boolValue = Boolean(value);
        const type = form.watch("type");
        if (type === "EXAMINATION") {
          const requiresVideoReport = form.watch("requiresVideoReport");
          const requiresWrittenFeedback = form.watch("requiresWrittenFeedback");
          
          if (!boolValue && !requiresVideoReport && !requiresWrittenFeedback) {
            return "Выберите хотя бы один тип экзамена";
          }
        }
        return true;
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
      formData.append("type", data.type);
      
      // Для тренировочных шагов добавляем длительность и видео
      if (data.type === "TRAINING") {
        formData.append("duration", data.duration || "");
        if (data.videoUrl) formData.append("videoUrl", data.videoUrl);
        
        // Добавляем ВСЕ файлы изображений за один запрос (благодаря bodySizeLimit: 100mb)
        imageFiles.forEach((file, index) => {
          const extension = file.name.split('.').pop() || 'jpg';
          const fileName = `image_${Date.now()}_${index}.${extension}`;
          formData.append("images", file, fileName);
        });
        
        // Добавляем удаленные изображения
        deletedImages.forEach((imageUrl) => {
          formData.append("deletedImages", imageUrl);
        });
        pdfUrls.forEach((url) => formData.append("pdfUrls", url));
      }
      
      // Для экзаменационных шагов добавляем чек-лист и типы экзамена
      if (data.type === "EXAMINATION") {
        formData.append("checklist", JSON.stringify(checklist));
        formData.append("requiresVideoReport", String(data.requiresVideoReport));
        formData.append("requiresWrittenFeedback", String(data.requiresWrittenFeedback));
        formData.append("hasTestQuestions", String(data.hasTestQuestions));
      }

      const result = await serverAction({}, formData);
      setFormState(result);

      // Если сохранение прошло успешно, очищаем состояние файлов
      if (result.success) {
        setImageFiles([]);
      }
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
        // Показываем уведомление об успехе
        setShowSuccessMessage(true);

        // Скрываем уведомление через 6 секунд
        setTimeout(() => {
          setShowSuccessMessage(false);
        }, 6000);

        // Очищаем форму сразу после успешного создания
        form.reset();
        setImageFiles([]);
        setPdfUrls([]);

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
    <Box key={formKey} className={sharedStyles.formContainer}>
      {showErrorMessage && (
        <Alert severity="error" className={sharedStyles.formAlert}>
          {formState?.error}
        </Alert>
      )}

      {showSuccessMessage && (
        <Alert severity="success" className={sharedStyles.formAlert}>
          {hasInitial ? "Шаг успешно обновлён!" : "Шаг успешно создан!"}
        </Alert>
      )}

      <form onSubmit={form.handleSubmit(handleSubmit)}>
        {initialData?.id ? <input type="hidden" name="id" value={initialData.id} /> : null}
        
        <FormSection title="Основная информация">
          <FormField
            id="title"
            label="Название шага *"
            name="title"
            placeholder="Введите название шага"
            form={form}
            rules={validationRules.title}
          />

          <FormField
            id="type"
            label="Тип шага *"
            name="type"
            as="select"
            form={form}
            rules={{ required: "Выберите тип шага" }}
            options={[
              { value: "TRAINING", label: "Тренировочный" },
              { value: "EXAMINATION", label: "Экзаменационный" }
            ]}
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
        </FormSection>

        {/* Условное отображение полей в зависимости от типа шага */}
        {form.watch("type") === "TRAINING" ? (
          <>
            <FormSection title="Параметры тренировки">
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
            </FormSection>

            <FormSection title="Медиа файлы">
              <StepImageUploader
                onImagesChange={setImageFiles}
                onDeletedImagesChange={setDeletedImages}
                initialImages={initialData?.imageUrls || []}
                _stepId={initialData?.id}
                maxImages={10}
              />
            </FormSection>
          </>
        ) : (
          <>
            <FormSection title="Типы экзамена">
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Выберите, что должен предоставить пользователь для прохождения экзамена:
              </Typography>
              
              <FormGroup>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.watch("hasTestQuestions")}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        form.setValue("hasTestQuestions", e.target.checked);
                        form.trigger("hasTestQuestions");
                      }}
                    />
                  }
                  label="Тестовые вопросы"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.watch("requiresVideoReport")}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        form.setValue("requiresVideoReport", e.target.checked);
                        form.trigger("hasTestQuestions");
                      }}
                    />
                  }
                  label="Видео отчёт о работе"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.watch("requiresWrittenFeedback")}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        form.setValue("requiresWrittenFeedback", e.target.checked);
                        form.trigger("hasTestQuestions");
                      }}
                    />
                  }
                  label="Письменная обратная связь"
                />
              </FormGroup>
              
              {form.formState.errors.hasTestQuestions && (
                <Alert severity="error" className={sharedStyles.formAlert}>
                  {form.formState.errors.hasTestQuestions.message}
                </Alert>
              )}
            </FormSection>

            {form.watch("hasTestQuestions") && (
              <FormSection title="Тестовые вопросы">
                <ChecklistEditor
                  checklist={checklist}
                  onChange={setChecklist}
                />
              </FormSection>
            )}
          </>
        )}

        <ValidationErrors
          errors={Object.fromEntries(
            Object.entries(form.formState.errors).map(([key, error]) => [
              key,
              error?.message || undefined,
            ]),
          )}
        />

        <Box className={sharedStyles.formActions}>
          <Button
            type="submit"
            variant="contained"
            disabled={isPending || !form.formState.isValid}
            className={sharedStyles.formButton}
          >
            {isPending
              ? hasInitial
                ? "Сохранение..."
                : "Создание..."
              : hasInitial
                ? "Сохранить изменения"
                : "Создать шаг"}
          </Button>
        </Box>
      </form>
    </Box>
  );
}
