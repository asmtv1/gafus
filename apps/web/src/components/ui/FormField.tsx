import React from "react";
import type {
  UseFormReturn,
  RegisterOptions,
  FieldValues,
  FieldPath,
} from "react-hook-form";

type FormFieldProps<T extends FieldValues> = {
  id: string;
  label: string;
  name: FieldPath<T>;
  type?: string;
  placeholder?: string;
  as?: "input" | "textarea";
  rules?: RegisterOptions<T, FieldPath<T>>;
  form: UseFormReturn<T>;
};

export function FormField<T extends FieldValues>({
  id,
  label,
  name,
  type = "text",
  placeholder,
  as = "input",
  rules,
  form,
}: FormFieldProps<T>) {
  const {
    register,
    formState: { errors },
  } = form;

  const error = errors[name]?.message as string | undefined;

  return (
    <div>
      <label htmlFor={id}>{label}</label>
      {as === "textarea" ? (
        <textarea
          id={id}
          placeholder={placeholder}
          rows={4}
          aria-invalid={!!error}
          {...register(name, rules)}
        />
      ) : (
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          aria-invalid={!!error}
          {...register(name, rules)}
        />
      )}
      {error && <p>{error}</p>}
    </div>
  );
}
