"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

import {
  TextField,
  NumberField,
  DateField,
  TextAreaField,
  SelectField,
} from "@shared/components/ui/FormField";
import { usePetZodForm } from "@shared/hooks/usePetZodForm";
import { savePet } from "@shared/lib/pets/savePet";
import { clearProfilePageCache } from "@shared/utils/clearProfileCache";

import type { PetFormSchema } from "@shared/lib/validation/petSchemas";
import styles from "./AddPetForm.module.css";

export default function AddPetForm() {
  const [caughtError, setCaughtError] = useState<Error | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Предотвращаем проблемы с гидратацией
  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (caughtError) throw caughtError;

  const router = useRouter();
  const { data: session } = useSession();

  const { form, handleSubmit } = usePetZodForm();

  // Показываем загрузку до завершения гидратации
  if (!isMounted) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Добавить питомца</h1>
        <div className={styles.form_container}>
          <p className={styles.form_loading}>Загрузка формы...</p>
        </div>
      </div>
    );
  }

  const onSubmit = async (data: PetFormSchema) => {
    setIsSubmitting(true);
    try {
      const { photoUrl: _photoUrl, ...petData } = data;
      await savePet({
        ...petData,
        id: "",
        // ownerId убираем - он будет получен внутри savePet из сессии
      });
      const username = session?.user?.username ?? null;
      await clearProfilePageCache(username);
      // Возвращаемся на страницу профиля с правильным username
      if (username) {
        router.push(`/profile?username=${username}`);
      } else {
        // Fallback на предыдущую страницу если username недоступен
        router.back();
      }
    } catch (err) {
      setCaughtError(err as Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Добавить питомца</h1>

      <div className={styles.form_container}>
        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
          {/* Основная информация */}
          <div className={styles.pet_info_section}>
            <h3>Основная информация</h3>
            <TextField
              id="name"
              label="Имя питомца"
              name="name"
              placeholder="Введите имя питомца"
              form={form}
              // Валидация теперь через Zod схему
            />

            <SelectField
              id="type"
              label="Тип питомца"
              name="type"
              form={form}
              options={[
                { value: "DOG", label: "Собака" },
                { value: "CAT", label: "Кошка" },
              ]}
              // Валидация теперь через Zod схему
            />

            <TextField
              id="breed"
              label="Порода"
              name="breed"
              placeholder="Введите породу"
              form={form}
              // Валидация теперь через Zod схему
            />

            <DateField
              id="birthDate"
              label="Дата рождения"
              name="birthDate"
              form={form}
              // Валидация теперь через Zod схему
            />
          </div>

          {/* Физические характеристики */}
          <div className={styles.pet_info_section}>
            <h3>Физические характеристики</h3>
            <NumberField
              id="heightCm"
              label="Рост (см)"
              name="heightCm"
              placeholder="Введите рост"
              form={form}
              // Валидация теперь через Zod схему
            />

            <NumberField
              id="weightKg"
              label="Вес (кг)"
              name="weightKg"
              placeholder="Введите вес"
              form={form}
              // Валидация теперь через Zod схему
            />
          </div>

          {/* Дополнительная информация */}
          <div className={styles.pet_info_section}>
            <h3>Дополнительная информация</h3>
            <TextAreaField
              id="notes"
              label="Заметки"
              name="notes"
              placeholder="Дополнительная информация о питомце"
              form={form}
              // Валидация теперь через Zod схему
            />
          </div>

          <div className={`${styles.form_buttons} ${isSubmitting ? styles.loading : ""}`}>
            <button
              type="submit"
              disabled={isSubmitting || !form.formState.isValid}
              className={styles.form_button}
            >
              {isSubmitting ? "Добавление..." : "Добавить питомца"}
            </button>

            <button
              type="button"
              onClick={() => router.back()}
              className={`${styles.form_button} ${styles.form_button_cancel}`}
            >
              Отмена
            </button>
          </div>

          {form.formState.errors && Object.keys(form.formState.errors).length > 0 && (
            <div className="mt-4 rounded border border-red-200 bg-red-50 p-3">
              <h4 className="mb-2 font-semibold text-red-800">Ошибки в форме:</h4>
              <ul className="space-y-1 text-sm text-red-700">
                {Object.entries(form.formState.errors).map(([field, error]) => (
                  <li key={field}>
                    <strong>{field}:</strong> {(error as { message?: string })?.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
