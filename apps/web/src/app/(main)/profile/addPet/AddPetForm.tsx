"use client";

import {
  TextField,
  NumberField,
  DateField,
  TextAreaField,
  SelectField,
} from "@shared/components/ui/FormField";
import { usePetFormWithValidation, getPetValidationRules } from "@shared/hooks/usePetForm";
import { savePet } from "@shared/lib/pet/savePet";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { PetFormData } from "@gafus/types";

export default function AddPetForm() {
  const [caughtError, setCaughtError] = useState<Error | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (caughtError) throw caughtError;

  const router = useRouter();

  const form = usePetFormWithValidation({});
  const validationRules = getPetValidationRules();

  const onSubmit = async (data: PetFormData) => {
    setIsSubmitting(true);
    try {
      const { photoUrl: _photoUrl, ...petData } = data;
      await savePet({
        ...petData,
        id: "",
        // ownerId убираем - он будет получен внутри savePet из сессии
      });
      // Используем router.push вместо window.history.back() для надежности
      router.push("/profile");
    } catch (err) {
      setCaughtError(err as Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-lg bg-white p-6 shadow-md">
      <h2 className="mb-6 text-center text-2xl font-bold">Добавить питомца</h2>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <TextField
          id="name"
          label="Имя питомца *"
          name="name"
          placeholder="Введите имя питомца"
          form={form}
          rules={validationRules.name}
        />

        <SelectField
          id="type"
          label="Тип питомца *"
          name="type"
          form={form}
          options={[
            { value: "DOG", label: "Собака" },
            { value: "CAT", label: "Кошка" },
          ]}
          rules={validationRules.type}
        />

        <TextField
          id="breed"
          label="Порода *"
          name="breed"
          placeholder="Введите породу"
          form={form}
          rules={validationRules.breed}
        />

        <DateField
          id="birthDate"
          label="Дата рождения *"
          name="birthDate"
          form={form}
          rules={validationRules.birthDate}
        />

        <NumberField
          id="heightCm"
          label="Рост (см)"
          name="heightCm"
          placeholder="Введите рост"
          form={form}
          rules={validationRules.heightCm}
        />

        <NumberField
          id="weightKg"
          label="Вес (кг)"
          name="weightKg"
          placeholder="Введите вес"
          form={form}
          rules={validationRules.weightKg}
        />

        <TextAreaField
          id="notes"
          label="Заметки"
          name="notes"
          placeholder="Дополнительная информация о питомце"
          form={form}
          rules={validationRules.notes}
        />

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={isSubmitting || !form.formState.isValid}
            className="flex-1 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Добавление..." : "Добавить питомца"}
          </button>

          <button
            type="button"
            onClick={() => router.back()}
            className="rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
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
                  <strong>{field}:</strong> {error?.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </div>
  );
}
