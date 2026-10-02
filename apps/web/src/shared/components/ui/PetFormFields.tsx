import styles from "./PetTypeSelector.module.css";
import Image from "next/image";
import { parsePetBirthDateInput } from "@shared/lib/validation/petSchemas";

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

      <fieldset className={styles.group}>
        <legend>Тип питомца</legend>
        <div className={styles.choices}>
          {petTypes.map(({ label, value }) => (
            <label key={value} className={styles.choice}>
              <input
                type="radio"
                value={value}
                {...form.register("type", { required: "Обязательное поле" })}
                aria-invalid={!!form.formState.errors.type}
              />
              <Image
                src={`/images/pet-type-${value.toLowerCase()}.webp`}
                alt=""
                width={48}
                height={48}
              />
              {label}
            </label>
          ))}
        </div>
        {form.formState.errors.type && (
          <p role="alert" style={{ color: "#a32424" }}>
            {form.formState.errors.type.message}
          </p>
        )}
      </fieldset>

      <FormField id="breed" name="breed" label="Порода" form={form} />

      <FormField
        id="birthDate"
        name="birthDate"
        label="Дата рождения (ДД.ММ.ГГГГ)"
        type="text"
        placeholder="15.03.2020"
        form={form}
        rules={{
          required: "Введите дату рождения",
          validate: (value: string) => {
            if (typeof value !== "string" || !value.trim()) return true;
            const d = parsePetBirthDateInput(value);
            if (!d) return "Формат: ДД.ММ.ГГГГ";
            const now = new Date();
            return d <= now || "Дата рождения не может быть в будущем";
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
        id="neckGirthCm"
        name="neckGirthCm"
        label="Обхват шеи (см)"
        type="number"
        form={form}
      />

      <FormField
        id="muzzleGirthCm"
        name="muzzleGirthCm"
        label="Обхват морды (см)"
        type="number"
        form={form}
      />

      <FormField
        id="bellyGirthCm"
        name="bellyGirthCm"
        label="Обхват живота (см)"
        type="number"
        form={form}
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
