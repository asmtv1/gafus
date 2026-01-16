"use client";

import { FormField } from "@shared/components/ui/FormField";
import { useZodForm } from "@shared/hooks/useZodForm";
import { userProfileFormSchema } from "@shared/lib/validation/authSchemas";
import { useUserStore } from "@shared/stores";
import { clearProfilePageCache } from "@shared/lib/utils/clearProfileCache";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import styles from "./EditBioForm.module.css";

import type { BioFormData, UserProfile, UpdateUserProfileInput } from "@gafus/types";
import type { UserProfileFormSchema } from "@shared/lib/validation/authSchemas";

function mapProfileToForm(profile: UserProfile): Omit<BioFormData, "userId"> {
  return {
    fullName: profile.fullName || "",
    birthDate: profile.birthDate ? new Date(profile.birthDate).toISOString().split("T")[0] : "",
    about: profile.about || "",
    telegram: profile.telegram || "",
    instagram: profile.instagram || "",
    website: profile.website || "",
  };
}

export default function EditBioForm() {
  const [caughtError, setCaughtError] = useState<Error | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const { form, handleSubmit, reset } = useZodForm(userProfileFormSchema);

  const { profile, isLoading, error, fetchProfile, updateProfile } = useUserStore();
  const router = useRouter();

  // Предотвращаем проблемы с гидратацией
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Загружаем профиль если не загружен (только после гидратации)
  useEffect(() => {
    if (isHydrated && !profile) {
      fetchProfile();
    }
  }, [isHydrated, profile, fetchProfile]);

  // Обновляем форму когда профиль загружен
  useEffect(() => {
    if (isHydrated && profile) {
      reset(mapProfileToForm(profile));
    }
  }, [isHydrated, profile, reset]);

  // Получаем session только после гидратации
  const { data: session } = useSession();
  const username = isHydrated ? session?.user?.username : undefined;

  if (caughtError) throw caughtError;

  // Показываем загрузку до завершения гидратации
  if (!isHydrated) {
    return (
      <div className={styles.loading_container}>
        <h1 className={styles.loading_title}>Редактировать «О себе»</h1>
        <div className={styles.loading_content}>
          Загрузка формы...
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.loading_container}>
        <h1 className={styles.loading_title}>Редактировать «О себе»</h1>
        <div className={styles.loading_content}>
          Загрузка профиля...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.loading_container}>
        <h1 className={styles.loading_title}>Редактировать «О себе»</h1>
        <div className={`${styles.loading_content} ${styles.loading_error}`}>
          Ошибка загрузки профиля: {error}
        </div>
      </div>
    );
  }

  const onSubmit = async (data: UserProfileFormSchema) => {
    try {
      // Преобразуем данные в формат, ожидаемый updateProfile
      const updateData: UpdateUserProfileInput = {
        fullName: data.fullName || "",
        about: data.about || "",
        telegram: data.telegram || "",
        instagram: data.instagram || "",
        website: data.website || "",
        birthDate: data.birthDate || "",
      };
      await updateProfile(updateData);
      await clearProfilePageCache(username);
      reset(data);
      // Используем router.push вместо window.history.back() для надежности
      // Сохраняем параметр username при редиректе
      const redirectUrl = username ? `/profile?username=${username}` : "/courses";
      router.push(redirectUrl);
    } catch (error) {
      setCaughtError(error as Error);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Редактировать «О себе»</h1>

      <div className={styles.form_container}>
        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
        
        {/* Основная информация */}
        <div className={styles.profile_info_section}>
          <h3>Основная информация</h3>
          <FormField
            id="fullName"
            name="fullName"
            label="Имя и фамилия"
            type="text"
            placeholder="Имя и фамилия"
            form={form}
            // Валидация теперь через Zod схему
          />

          <FormField
            id="birthDate"
            name="birthDate"
            label="Дата рождения"
            type="date"
            form={form}
            // Валидация теперь через Zod схему
          />

          <FormField
            id="about"
            name="about"
            label="Заметки о себе"
            as="textarea"
            placeholder="О себе"
            form={form}
            // Валидация теперь через Zod схему
          />
        </div>

        {/* Контактная информация */}
        <div className={styles.profile_info_section}>
          <h3>Контактная информация</h3>
          <div>
            <FormField
              id="telegram"
              name="telegram"
              label="Telegram для связи"
              placeholder="asmtv1"
              form={form}
            />
            <p className={styles.helperText}>
              Введите username без @ (например: asmtv1). Минимум 5 символов, только латинские буквы, цифры и подчеркивание.
            </p>
          </div>

          <div>
            <FormField
              id="instagram"
              name="instagram"
              label="Ваш Instagram"
              placeholder="doghandler_lana"
              form={form}
            />
            <p className={styles.helperText}>
              Введите username без @ (например: doghandler_lana). До 30 символов, только латинские буквы, цифры, точки и подчеркивание.
            </p>
          </div>

          <div>
            <FormField
              id="website"
              name="website"
              label="YouTube или сайт"
              type="text"
              placeholder="youtube.com/@username или example.com"
              form={form}
            />
            <p className={styles.helperText}>
              Введите URL сайта или канала YouTube. Можно без https:// и www - они добавятся автоматически.
            </p>
          </div>
        </div>

        <div className={styles.form_buttons}>
          <button type="submit" className={styles.form_button}>Сохранить</button>
          <button type="button" onClick={() => router.back()} className={`${styles.form_button} ${styles.form_button_cancel}`}>
            Вернуться без сохранения
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}
