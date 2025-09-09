"use client";

import { FormField } from "@shared/components/ui/FormField";
import { useUserStore } from "@shared/stores";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import styles from "./EditBioForm.module.css";

import type { BioFormData, UserProfile } from "@gafus/types";

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
  if (caughtError) throw caughtError;

  const form = useForm<BioFormData>();
  const { reset, handleSubmit } = form;

  const { profile, isLoading, error, fetchProfile, updateProfile } = useUserStore();
  const router = useRouter();

  // Загружаем профиль если не загружен
  useEffect(() => {
    if (!profile) {
      fetchProfile();
    }
  }, [profile, fetchProfile]);

  // Обновляем форму когда профиль загружен
  useEffect(() => {
    if (profile) {
      reset(mapProfileToForm(profile));
    }
  }, [profile, reset]);

  const onSubmit = async (data: BioFormData) => {
    try {
      await updateProfile(data);
      reset(data);
      // Используем router.push вместо window.history.back() для надежности
      router.push("/profile");
    } catch (error) {
      setCaughtError(error as Error);
    }
  };

  if (isLoading) return <p>Загрузка…</p>;
  if (error) return <p>Ошибка загрузки профиля: {error}</p>;

  return (
    <div>
      <h1>Редактировать «О себе»</h1>

      <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
        <FormField
          id="fullName"
          name="fullName"
          label="Имя и фамилия"
          type="text"
          placeholder="Имя и фамилия"
          rules={{
            pattern: {
              value: /^[А-Яа-яЁё\s]+$/,
              message: "Только русские буквы",
            },
            maxLength: { value: 60, message: "Не более 60 символов" },
          }}
          form={form}
        />

        <FormField
          id="birthDate"
          name="birthDate"
          label="Дата рождения"
          type="date"
          rules={{
            validate: (value: string) =>
              !value || new Date(value) <= new Date() || "Дата не может быть в будущем",
          }}
          form={form}
        />

        <FormField
          id="about"
          name="about"
          label="Заметки о себе"
          as="textarea"
          placeholder="О себе"
          rules={{
            maxLength: { value: 300, message: "Не более 300 символов" },
          }}
          form={form}
        />

        <FormField
          id="telegram"
          name="telegram"
          label="Telegram для связи"
          placeholder="Telegram username"
          rules={{ maxLength: { value: 50, message: "Не более 50 символов" } }}
          form={form}
        />

        <FormField
          id="instagram"
          name="instagram"
          label="Ваш Instagram"
          placeholder="Instagram username"
          rules={{ maxLength: { value: 50, message: "Не более 50 символов" } }}
          form={form}
        />

        <FormField
          id="website"
          name="website"
          label="YouTube или сайт"
          type="url"
          placeholder="Website URL"
          rules={{ maxLength: { value: 50, message: "Не более 50 символов" } }}
          form={form}
        />

        <div className={styles.form_button}>
          <button type="submit">Сохранить</button>
          <button type="button" onClick={() => router.back()}>
            Вернуться без сохранения
          </button>
        </div>
      </form>
    </div>
  );
}
