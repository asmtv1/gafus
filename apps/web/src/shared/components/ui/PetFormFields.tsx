import { FormField } from "./FormField"; // замените путь при необходимости

import type { PetFormData } from "@gafus/types";
import type { UseFormReturn } from "react-hook-form";

interface Props {
  form: UseFormReturn<PetFormData>;
}

const petTypes = [
  { label: "Собака", value: "DOG" },
  { label: "Кошка", value: "CAT" },
] as const;

export function PetFormFields({ form }: Props) {
  return (
    <>
      <FormField
        id="name"
        name="name"
        label="Имя питомца"
        form={form}
        rules={{ required: "Обязательное поле" }}
      />

      <div>
        <label htmlFor="type">Тип питомца</label>
        <select
          id="type"
          {...form.register("type", { required: "Обязательное поле" })}
          defaultValue=""
          aria-invalid={!!form.formState.errors.type}
        >
          <option value="" disabled>
            -- выберите тип --
          </option>
          {petTypes.map(({ label, value }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {form.formState.errors.type && (
          <p style={{ color: "red" }}>{form.formState.errors.type.message}</p>
        )}
      </div>

      <FormField id="breed" name="breed" label="Порода" form={form} />

      <FormField
        id="birthDate"
        name="birthDate"
        label="Дата рождения"
        type="date"
        form={form}
        rules={{
          required: "Введите дату рождения",
          validate: (value: string) => {
            if (typeof value !== "string") return true;
            const selected = new Date(value);
            const now = new Date();
            return selected <= now || "Дата рождения не может быть в будущем";
          },
        }}
      />

      <FormField
        id="heightCm"
        name="heightCm"
        label="Рост (см)"
        type="number"
        form={form}
        rules={{
          validate: (value: string | number) => {
            if (value === "" || value === undefined || value === null) return true;
            const num = Number(value);
            if (isNaN(num)) return "Рост должен быть числом";
            if (num < 1) return "Рост должен быть не менее 1 см";
            if (num > 200) return "Рост не может быть больше 200 см";
            return true;
          },
          setValueAs: (value: string | number) => {
            if (value === "" || value === undefined || value === null) return undefined;
            return Number(value);
          },
        }}
      />

      <FormField
        id="weightKg"
        name="weightKg"
        label="Вес (кг)"
        type="number"
        form={form}
        rules={{
          validate: (value: string | number) => {
            if (value === "" || value === undefined || value === null) return true;
            const num = Number(value);
            if (isNaN(num)) return "Вес должен быть числом";
            if (num < 0.1) return "Вес должен быть не менее 0.1 кг";
            if (num > 200) return "Вес не может быть больше 200 кг";
            return true;
          },
          setValueAs: (value: string | number) => {
            if (value === "" || value === undefined || value === null) return undefined;
            return Number(value);
          },
        }}
      />

      <FormField
        id="notes"
        name="notes"
        label="Заметки"
        as="textarea"
        form={form}
        rules={{
          maxLength: { value: 500, message: "Не более 500 символов" },
        }}
      />
    </>
  );
}
