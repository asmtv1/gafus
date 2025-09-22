"use client";

import { ValidationError } from "./ValidationError";

import type { FormFieldComponentProps } from "@gafus/types";
import type { FieldValues, Path } from "react-hook-form";

export function FormField<T extends FieldValues>({
  id,
  label,
  name,
  type = "text",
  placeholder,
  as = "input",
  rules,
  form,
  options = [],
  className = "",
  disabled = false,
  autoComplete,
  ariaLabel,
  visuallyHiddenLabel = false,
  errorClassName,
}: FormFieldComponentProps<T>) {
  const {
    register,
    formState: { errors },
  } = form;

  const error = errors[name]?.message as string | undefined;

  const hasLabel = typeof label === "string" && label.trim().length > 0;

  const baseInputProps = {
    id,
    placeholder,
    disabled,
    autoComplete,
    "aria-invalid": !!error,
    ...(hasLabel ? {} : { "aria-label": ariaLabel ?? placeholder ?? id }),
    className: [
      "w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500",
      error ? "border-red-500" : "border-gray-300",
      className,
    ]
      .filter(Boolean)
      .join(" "),
  };

  return (
    <div className="flex flex-col">
      {hasLabel && (
        <label
          htmlFor={id}
          className={[
            "mb-1 block text-sm font-medium text-gray-700",
            visuallyHiddenLabel ? "sr-only" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {label}
        </label>
      )}

      {as === "textarea" ? (
        <textarea {...baseInputProps} rows={4} {...register(name as Path<T>, rules)} />
      ) : as === "select" ? (
        <select {...baseInputProps} {...register(name as Path<T>, rules)}>
          <option value="">Выберите...</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input {...baseInputProps} type={type} {...register(name as Path<T>, rules)} />
      )}

      <ValidationError error={error} className={errorClassName} />
    </div>
  );
}

// Специализированные компоненты для разных типов полей
export function TextField<T extends FieldValues>(
  props: Omit<FormFieldComponentProps<T>, "as" | "type">,
) {
  return <FormField {...props} as="input" type="text" />;
}

export function EmailField<T extends FieldValues>(
  props: Omit<FormFieldComponentProps<T>, "as" | "type">,
) {
  return <FormField {...props} as="input" type="email" />;
}

export function PasswordField<T extends FieldValues>(
  props: Omit<FormFieldComponentProps<T>, "as" | "type">,
) {
  return <FormField {...props} as="input" type="password" />;
}

export function NumberField<T extends FieldValues>(
  props: Omit<FormFieldComponentProps<T>, "as" | "type">,
) {
  return <FormField {...props} as="input" type="number" />;
}

export function DateField<T extends FieldValues>(
  props: Omit<FormFieldComponentProps<T>, "as" | "type">,
) {
  return <FormField {...props} as="input" type="date" />;
}

export function TextAreaField<T extends FieldValues>(
  props: Omit<FormFieldComponentProps<T>, "as">,
) {
  return <FormField {...props} as="textarea" />;
}

export function SelectField<T extends FieldValues>(
  props: Omit<FormFieldComponentProps<T>, "as"> & { options: { value: string; label: string }[] },
) {
  return <FormField {...props} as="select" />;
}
