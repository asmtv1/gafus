import { UseFormReturn } from "react-hook-form";
import { PetFormData } from "@/types/Pet";
import { FormField } from "./FormField"; // замените путь при необходимости

type Props = {
  form: UseFormReturn<PetFormData>;
};

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
          validate: (value) => {
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
          valueAsNumber: true,
          min: { value: 1, message: "Рост должен быть не менее 1 см" },
        }}
      />

      <FormField
        id="weightKg"
        name="weightKg"
        label="Вес (кг)"
        type="number"
        form={form}
        rules={{
          valueAsNumber: true,
          min: { value: 0.1, message: "Вес должен быть не менее 0.1 кг" },
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
