import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z, type ZodSchema, type ZodType } from "zod";

/**
 * Хук для создания формы с Zod валидацией
 * Интегрирует React Hook Form с Zod схемами
 */
export function useZodForm<T extends ZodType>(schema: T, defaultValues?: z.infer<T>) {
  const form = useForm<z.infer<T>>({
    // @ts-expect-error - временное решение для совместимости типов zodResolver
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues,
  });

  return {
    form: form as UseFormReturn<z.infer<T>>, // Приведение типа для совместимости
    register: form.register,
    handleSubmit: form.handleSubmit as (
      onSubmit: (data: z.infer<T>) => void | Promise<void>,
    ) => (e?: React.BaseSyntheticEvent) => Promise<void>,
    formState: form.formState,
    setValue: form.setValue,
    getValues: form.getValues,
    reset: form.reset,
    setError: form.setError,
    clearErrors: form.clearErrors,
    watch: form.watch,
  };
}

/**
 * Хук для форм с Zod валидацией и типизацией
 */
export function useTypedZodForm<T extends ZodSchema>(
  schema: T,
  defaultValues?: Partial<z.infer<T>>,
) {
  return useZodForm(schema, defaultValues);
}
