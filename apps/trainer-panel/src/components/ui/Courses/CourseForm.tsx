"use client";

import { useCSRFStore } from "@gafus/csrf";
import { DualListSelector } from "@shared/components/common";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  Switch,
  Typography,
} from "../../../utils/muiImports";
import { FormField, TextAreaField } from "../FormField";
import CourseMediaUploader from "./CourseMediaUploader";

import type { TrainerCourseFormData as CourseFormData, TrainerDay as DayItem } from "@gafus/types";

import UserSearchSelector from "@/features/users/components/UserSearchSelector";
import { MarkdownInput } from "@/shared/components/common";
import { Toast } from "@/shared/components/ui";
import { useToast } from "@/shared/components/ui/Toast";
import { ValidationErrors } from "@/shared/components/ui/ValidationError";
import { commonValidationRules } from "@/shared/hooks/useFormValidation";
import { useStatisticsMutation } from "@/shared/hooks/useStatistics";
import { createCourseServerAction, updateCourseServerAction } from "@/shared/lib/actions/courses";

interface Props {
  allDays: DayItem[];
  mode?: "create" | "edit";
  courseId?: string;
  initialValues?: Partial<CourseFormData>;
  initialSelectedUsers?: { id: string; username: string }[];
}

export default function CourseForm({
  allDays,
  mode = "create",
  courseId,
  initialValues,
  initialSelectedUsers = [],
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { token: _token } = useCSRFStore();
  const [selectedUsers, setSelectedUsers] =
    useState<{ id: string; username: string }[]>(initialSelectedUsers);
  const router = useRouter();
  const { data: session } = useSession();
  const { invalidateStatistics } = useStatisticsMutation();
  const { open, message, severity, showToast, closeToast } = useToast();

  const form = useForm<CourseFormData>({
    mode: "onBlur",
    defaultValues: {
      name: "",
      shortDesc: "",
      description: "",
      duration: "",
      videoUrl: "",
      logoImg: "",
      isPublic: true,
      trainingDays: [],
      allowedUsers: [],
      equipment: "",
      trainingLevel: "BEGINNER",
    },
  });

  // Применяем initialValues при редактировании
  useEffect(() => {
    if (initialValues) {
      form.reset({
        name: initialValues.name ?? "",
        shortDesc: initialValues.shortDesc ?? "",
        description: initialValues.description ?? "",
        duration: initialValues.duration ?? "",
        videoUrl: initialValues.videoUrl ?? "",
        logoImg: initialValues.logoImg ?? "",
        isPublic: initialValues.isPublic ?? true,
        trainingDays: initialValues.trainingDays ?? [],
        allowedUsers: initialValues.allowedUsers ?? [],
        equipment: initialValues.equipment ?? "",
        trainingLevel: initialValues.trainingLevel ?? "BEGINNER",
      });
    }
  }, [initialValues, form]);

  // Синхронизируем выбранных пользователей с полем формы allowedUsers
  useEffect(() => {
    form.setValue(
      "allowedUsers",
      selectedUsers.map((u) => u.id),
    );
  }, [selectedUsers, form]);

  const handleSubmit = async (data: CourseFormData) => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (mode === "edit" && courseId) {
        const res = await updateCourseServerAction({
          id: courseId,
          name: data.name,
          shortDesc: data.shortDesc,
          description: data.description,
          duration: data.duration,
          videoUrl: data.videoUrl,
          logoImg: data.logoImg,
          isPublic: data.isPublic,
          trainingDays: data.trainingDays,
          allowedUsers: data.allowedUsers,
          equipment: data.equipment,
          trainingLevel: data.trainingLevel,
        });
        if (!res.success) throw new Error(res.error || "Ошибка сохранения изменений");
        showToast("Изменения сохранены", "success");
      } else {
        const res = await createCourseServerAction({
          name: data.name,
          shortDesc: data.shortDesc,
          description: data.description,
          duration: data.duration,
          videoUrl: data.videoUrl,
          logoImg: data.logoImg,
          isPublic: data.isPublic,
          trainingDays: data.trainingDays,
          allowedUsers: data.allowedUsers,
          equipment: data.equipment,
          trainingLevel: data.trainingLevel,
        });
        if (!res.success) throw new Error(res.error || "Ошибка создания курса");
        showToast("Курс успешно создан!", "success");
      }
      // Инвалидируем клиентский кэш статистики, затем переходим на страницу статистики
      const userId = session?.user?.id || "";
      const isElevated = Boolean(
        session?.user?.role && ["ADMIN", "MODERATOR"].includes(session.user.role),
      );
      if (userId) {
        invalidateStatistics(userId, isElevated);
      }
      router.push("/main-panel/statistics");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", p: 3 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Основная информация
          </Typography>
          <FormField
            id="name"
            label="Название курса *"
            name="name"
            placeholder="Введите название курса"
            form={form}
            rules={commonValidationRules.courseName}
          />
          <TextAreaField
            id="shortDesc"
            label="Краткое описание *"
            name="shortDesc"
            placeholder="Краткое описание курса"
            form={form}
            rules={commonValidationRules.shortDescription}
          />
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Полное описание *
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
          <FormField
            id="duration"
            label="Продолжительность курса *"
            name="duration"
            placeholder="например: 30 дней"
            form={form}
            rules={commonValidationRules.courseDuration}
          />
          <FormField
            id="equipment"
            label="Необходимое оборудование"
            name="equipment"
            placeholder="например: поводок, игрушки, лакомства"
            form={form}
          />
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Уровень сложности
            </Typography>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              {[
                { value: "BEGINNER", label: "Начальный" },
                { value: "INTERMEDIATE", label: "Средний" },
                { value: "ADVANCED", label: "Продвинутый" },
                { value: "EXPERT", label: "Экспертный" },
              ].map((level) => (
                <FormControlLabel
                  key={level.value}
                  control={
                    <Switch
                      checked={form.watch("trainingLevel") === level.value}
                      onChange={() =>
                        form.setValue(
                          "trainingLevel",
                          level.value as "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT",
                        )
                      }
                    />
                  }
                  label={level.label}
                />
              ))}
            </Box>
          </Box>
          <FormField
            id="videoUrl"
            label="Ссылка на видео"
            name="videoUrl"
            placeholder="https://youtube.com/..."
            form={form}
            rules={commonValidationRules.videoUrl}
          />
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Медиа
          </Typography>
          <CourseMediaUploader onUploadComplete={(url) => form.setValue("logoImg", url)} />
          {form.formState.errors.logoImg && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {form.formState.errors.logoImg.message}
            </Alert>
          )}
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Доступ
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={form.watch("isPublic")}
                onChange={(e) => {
                  const value = e.target.checked;
                  form.setValue("isPublic", value);
                  if (value) {
                    // Если курс становится публичным — очищаем список разрешённых
                    setSelectedUsers([]);
                    form.setValue("allowedUsers", []);
                  }
                }}
              />
            }
            label="Публичный курс"
          />
        </Box>

        {/* Блок выбора пользователей для приватного курса */}
        {!form.watch("isPublic") && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Доступ к курсу
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Выберите пользователей, которым будет доступен этот курс
            </Typography>
            <UserSearchSelector selectedUsers={selectedUsers} setSelectedUsers={setSelectedUsers} />
          </Box>
        )}

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Выберите дни которые будут использованы в этом курсе
          </Typography>
          <DualListSelector
            allItems={allDays}
            selectedItems={
              (form.watch("trainingDays") || [])
                .map((id) => allDays.find((d) => d.id === id))
                .filter(Boolean) as DayItem[]
            }
            onSelectionChange={(selectedDays) => {
              // Разрешаем дубликаты: как при создании дня
              const selectedIds = selectedDays.map((day) => day.id);
              form.setValue("trainingDays", selectedIds);
            }}
            getItemLabel={(day) => day.title}
            getItemId={(day) => day.id}
            title="Тренировочные дни"
            allowDuplicates={true}
          />
        </Box>

        <ValidationErrors
          errors={Object.fromEntries(
            Object.entries(form.formState.errors).map(([key, val]) => [
              key,
              // react-hook-form FieldError -> берём только строку message
              (val as { message?: string } | undefined)?.message,
            ]),
          )}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={isSubmitting || !form.formState.isValid}
          sx={{ mt: 2 }}
        >
          {isSubmitting
            ? mode === "edit"
              ? "Сохранение..."
              : "Создание..."
            : mode === "edit"
              ? "Сохранить изменения"
              : "Создать курс"}
        </Button>
      </form>
      <Toast open={open} message={message} severity={severity} onClose={closeToast} />
    </Box>
  );
}
