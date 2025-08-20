import { Controller } from "react-hook-form";

import { FieldError } from "./ValidationError";

import type { FieldPath, FieldValues, RegisterOptions, UseFormReturn } from "react-hook-form";

import { FormControl, InputLabel, MenuItem, Select, TextField } from "@/utils/muiImports";

interface FormFieldProps<T extends FieldValues> {
  id: string;
  label: string;
  name: FieldPath<T>;
  type?: string;
  placeholder?: string;
  as?: "input" | "textarea" | "select";
  rules?: RegisterOptions<T, FieldPath<T>>;
  form: UseFormReturn<T>;
  options?: { value: string; label: string }[];
  className?: string;
  disabled?: boolean;
  autoComplete?: string;
  multiline?: boolean;
  rows?: number;
  fullWidth?: boolean;
  margin?: "none" | "dense" | "normal";
  variant?: "outlined" | "filled" | "standard";
}

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
  multiline = false,
  rows = 4,
  fullWidth = true,
  margin = "normal",
  variant = "outlined",
}: FormFieldProps<T>) {
  const {
    register,
    formState: { errors },
  } = form;

  const error = errors[name]?.message as string | undefined;

  if (as === "select") {
    return (
      <FormControl fullWidth={fullWidth} margin={margin} error={!!error}>
        <InputLabel id={`${id}-label`}>{label}</InputLabel>
        <Controller
          name={name}
          rules={rules}
          control={form.control}
          render={({ field }) => (
            <Select
              labelId={`${id}-label`}
              id={id}
              label={label}
              disabled={disabled}
              value={field.value ?? ""}
              onChange={field.onChange}
              inputRef={field.ref}
            >
              {options.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          )}
        />
        <FieldError error={error} />
      </FormControl>
    );
  }

  return (
    <TextField
      id={id}
      label={label}
      type={type}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete={autoComplete}
      multiline={multiline}
      rows={multiline ? rows : undefined}
      fullWidth={fullWidth}
      margin={margin}
      variant={variant}
      error={!!error}
      helperText={error}
      className={className}
      {...register(name, rules)}
    />
  );
}

// Специализированные компоненты для разных типов полей
export function TextFieldComponent<T extends FieldValues>(
  props: Omit<FormFieldProps<T>, "as" | "type">,
) {
  return <FormField {...props} as="input" type="text" />;
}

export function EmailField<T extends FieldValues>(props: Omit<FormFieldProps<T>, "as" | "type">) {
  return <FormField {...props} as="input" type="email" />;
}

export function PasswordField<T extends FieldValues>(
  props: Omit<FormFieldProps<T>, "as" | "type">,
) {
  return <FormField {...props} as="input" type="password" />;
}

export function NumberField<T extends FieldValues>(props: Omit<FormFieldProps<T>, "as" | "type">) {
  return <FormField {...props} as="input" type="number" />;
}

export function DateField<T extends FieldValues>(props: Omit<FormFieldProps<T>, "as" | "type">) {
  return <FormField {...props} as="input" type="date" />;
}

export function TextAreaField<T extends FieldValues>(props: Omit<FormFieldProps<T>, "as">) {
  return <FormField {...props} as="input" multiline={true} />;
}

export function SelectField<T extends FieldValues>(
  props: Omit<FormFieldProps<T>, "as"> & { options: { value: string; label: string }[] },
) {
  return <FormField {...props} as="select" />;
}
