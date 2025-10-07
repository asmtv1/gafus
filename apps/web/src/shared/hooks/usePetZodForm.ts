import type { z } from "zod";
import { useZodForm } from "./useZodForm";
import { petFormSchema } from "@shared/lib/validation/petSchemas";

/**
 * Хук для формы питомца с Zod валидацией
 */
export function usePetZodForm(defaultValues?: z.infer<typeof petFormSchema>) {
  return useZodForm(petFormSchema, defaultValues);
}

/**
 * Хук для создания питомца с Zod валидацией
 */
export function useCreatePetZodForm() {
  return useZodForm(petFormSchema, {
    name: "",
    type: "DOG",
    breed: "",
    birthDate: "",
    heightCm: undefined,
    weightKg: undefined,
    photoUrl: "",
    notes: "",
  });
}
