"use client";

import UserSearchSelector from "@features/users/components/UserSearchSelector";
import { useCSRFStore } from "@gafus/csrf";
import { DualListSelector, MarkdownInput } from "@shared/components/common";
import { FormField, TextAreaField } from "@shared/components/ui/FormField";
import { Toast, useToast } from "@shared/components/ui/Toast";
import { ValidationErrors } from "@shared/components/ui/ValidationError";
import { commonValidationRules } from "@shared/hooks/useFormValidation";
import { useStatisticsMutation } from "@shared/hooks/useStatistics";
import { createCourseServerAction, updateCourseServerAction } from "@shared/lib/actions/courses";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  Radio,
  RadioGroup,
  Typography,
} from "../../../../utils/muiImports";
import CourseMediaUploader from "./CourseMediaUploader";
import sharedStyles from "@shared/styles/FormLayout.module.css";
import FormSection from "@shared/components/FormSection";

import type { TrainerCourseFormData as CourseFormData, TrainerDay as DayItem } from "@gafus/types";

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
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { token: _token } = useCSRFStore();
  const [selectedUsers, setSelectedUsers] =
    useState<{ id: string; username: string }[]>(initialSelectedUsers);
  const router = useRouter();
  const { data: session } = useSession();
  const canCreatePaidCourse =
    !!session?.user &&
    (session.user.role === "ADMIN" ||
      (session.user as { username?: string }).username?.toLowerCase() === "gafus");
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
      isPaid: false,
      priceRub: null as number | null,
      showInProfile: true,
      isPersonalized: false,
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
        isPaid: initialValues.isPaid ?? false,
        priceRub: initialValues.priceRub ?? null,
        showInProfile: initialValues.showInProfile ?? true,
        isPersonalized: initialValues.isPersonalized ?? false,
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
          isPaid: data.isPaid,
          priceRub: data.priceRub ?? null,
          showInProfile: data.showInProfile,
          isPersonalized: data.isPersonalized,
          trainingDays: data.trainingDays,
          allowedUsers: data.allowedUsers,
          equipment: data.equipment,
          trainingLevel: data.trainingLevel,
        });
        if (!res.success) throw new Error(res.error || "Ошибка сохранения изменений");
        showToast("Изменения сохранены", "success");
      } else {
        // Создаем FormData для создания курса
        const formData = new FormData();
        formData.append("name", data.name);
        formData.append("shortDesc", data.shortDesc);
        formData.append("description", data.description);
        formData.append("duration", data.duration);
        if (data.videoUrl) {
          formData.append("videoUrl", data.videoUrl);
        }
        formData.append("isPublic", data.isPublic ? "true" : "false");
        formData.append("isPaid", data.isPaid ? "true" : "false");
        if (data.isPaid && data.priceRub != null) {
          formData.append("priceRub", String(data.priceRub));
        }
        formData.append("showInProfile", data.showInProfile ? "true" : "false");
        formData.append("isPersonalized", data.isPersonalized ? "true" : "false");
        formData.append("equipment", data.equipment || "");
        formData.append("trainingLevel", data.trainingLevel || "BEGINNER");

        // Добавляем trainingDays
        data.trainingDays.forEach((dayId) => {
          formData.append("trainingDays", dayId);
        });

        // Добавляем allowedUsers
        data.allowedUsers.forEach((userId) => {
          formData.append("allowedUsers", userId);
        });

        // Добавляем logoFile, если есть
        if (logoFile) {
          formData.append("logoImg", logoFile);
        }

        const res = await createCourseServerAction(formData);
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
    <Box className={sharedStyles.formContainer}>
      {error && (
        <Alert severity="error" className={sharedStyles.formAlert} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" className={sharedStyles.formAlert}>
          {success}
        </Alert>
      )}

      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <FormSection title="Основная информация">
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
          <Box className={sharedStyles.formField}>
            <Typography className={sharedStyles.formLabel}>Полное описание *</Typography>
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
          <FormControl component="fieldset" className={sharedStyles.formField}>
            <Typography className={sharedStyles.formLabel}>Уровень сложности</Typography>
            <RadioGroup
              value={form.watch("trainingLevel")}
              onChange={(e) =>
                form.setValue(
                  "trainingLevel",
                  e.target.value as "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT",
                )
              }
              row
            >
              {[
                { value: "BEGINNER", label: "Начальный" },
                { value: "INTERMEDIATE", label: "Средний" },
                { value: "ADVANCED", label: "Продвинутый" },
                { value: "EXPERT", label: "Экспертный" },
              ].map((level) => (
                <FormControlLabel
                  key={level.value}
                  value={level.value}
                  control={<Radio />}
                  label={level.label}
                />
              ))}
            </RadioGroup>
          </FormControl>
          <FormField
            id="videoUrl"
            label="Ссылка на видео"
            name="videoUrl"
            placeholder="https://youtube.com/..., https://vk.com/video..."
            form={form}
            rules={commonValidationRules.videoUrl}
            helperText="Поддерживаются: YouTube, Rutube, Vimeo, VK Video"
          />
        </FormSection>

        <FormSection title="Медиа">
          <input type="hidden" {...form.register("logoImg", commonValidationRules.logoImg)} />
          <CourseMediaUploader
            onUploadComplete={(url) => {
              form.setValue("logoImg", url, { shouldValidate: true });
            }}
            onFileSelect={(file) => {
              setLogoFile(file);
              // Устанавливаем временный URL для preview
              const previewUrl = URL.createObjectURL(file);
              form.setValue("logoImg", previewUrl, { shouldValidate: true });
            }}
            courseId={courseId}
          />
          {form.formState.errors.logoImg && (
            <Alert severity="error" className={sharedStyles.formAlert}>
              {form.formState.errors.logoImg.message}
            </Alert>
          )}
        </FormSection>

        <FormSection title="Доступ">
          <FormControl component="fieldset" className={sharedStyles.formField}>
            <Typography className={sharedStyles.formLabel}>Тип курса</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              • <strong>Публичный курс</strong> — доступен всем пользователям бесплатно
              <br />• <strong>Приватный курс</strong> — доступен только выбранным пользователям
              {canCreatePaidCourse && (
                <>
                  <br />• <strong>Платный курс</strong> — доступен всем пользователям за плату
                </>
              )}
            </Typography>
            <RadioGroup
              value={(() => {
                const isPublic = form.watch("isPublic");
                const isPaid = form.watch("isPaid");
                if (isPublic && !isPaid) return "public";
                if (!isPublic && !isPaid) return "private";
                if (isPaid) return "paid";
                return "public";
              })()}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "public") {
                  form.setValue("isPublic", true);
                  form.setValue("isPaid", false);
                  form.setValue("priceRub", null);
                  setSelectedUsers([]);
                  form.setValue("allowedUsers", []);
                } else if (value === "private") {
                  form.setValue("isPublic", false);
                  form.setValue("isPaid", false);
                  form.setValue("priceRub", null);
                } else if (value === "paid") {
                  form.setValue("isPublic", true);
                  form.setValue("isPaid", true);
                  form.setValue("priceRub", form.watch("priceRub") ?? 0);
                  setSelectedUsers([]);
                  form.setValue("allowedUsers", []);
                }
              }}
              row
            >
              <FormControlLabel value="public" control={<Radio />} label="Публичный курс" />
              <FormControlLabel value="private" control={<Radio />} label="Приватный курс" />
              {(canCreatePaidCourse || form.watch("isPaid")) && (
                <FormControlLabel
                  value="paid"
                  control={<Radio />}
                  label="Платный курс"
                  disabled={!canCreatePaidCourse}
                />
              )}
            </RadioGroup>
          </FormControl>
          {form.watch("isPaid") && (
            <Box className={sharedStyles.formField} sx={{ maxWidth: 200 }}>
              <FormField
                id="priceRub"
                name="priceRub"
                label="Цена, ₽"
                type="number"
                form={form}
                rules={{
                  required: "Укажите цену",
                  min: { value: 1, message: "Минимум 1 ₽" },
                  max: { value: 999999, message: "Максимум 999 999 ₽" },
                }}
              />
            </Box>
          )}
          <FormControl component="fieldset" className={sharedStyles.formField}>
            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.watch("showInProfile")}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      form.setValue("showInProfile", e.target.checked);
                    }}
                  />
                }
                label="Показывать курс в моём профиле"
              />
            </FormGroup>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Если включено, курс будет отображаться в вашем публичном профиле для всех посетителей
            </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.watch("isPersonalized")}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      form.setValue("isPersonalized", e.target.checked);
                    }}
                  />
                }
                label="Персонализированный курс"
              />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {"В текстах шагов можно использовать плейсхолдеры имени ученика и питомца ({{userName}}, {{petName}} и др.)"}
            </Typography>
          </FormControl>
        </FormSection>

        {/* Блок выбора пользователей для приватного курса */}
        {!form.watch("isPublic") && !form.watch("isPaid") && (
          <FormSection title="Доступ к курсу">
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Выберите пользователей, которым будет доступен этот курс
            </Typography>
            <UserSearchSelector selectedUsers={selectedUsers} setSelectedUsers={setSelectedUsers} />
          </FormSection>
        )}

        <FormSection title="Тренировочные дни">
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
        </FormSection>

        <ValidationErrors
          errors={Object.fromEntries(
            Object.entries(form.formState.errors).map(([key, val]) => [
              key,
              // react-hook-form FieldError -> берём только строку message
              (val as { message?: string } | undefined)?.message,
            ]),
          )}
        />

        <Box className={sharedStyles.formActions}>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || !form.formState.isValid}
            className={sharedStyles.formButton}
          >
            {isSubmitting
              ? mode === "edit"
                ? "Сохранение..."
                : "Создание..."
              : mode === "edit"
                ? "Сохранить изменения"
                : "Создать курс"}
          </Button>
        </Box>
      </form>
      <Toast open={open} message={message} severity={severity} onClose={closeToast} />
    </Box>
  );
}
