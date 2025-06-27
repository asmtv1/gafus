import { useForm } from "react-hook-form";
import { PetFormData } from "@/types/Pet";

export function usePetForm(initialValues: Partial<PetFormData>) {
  return useForm<PetFormData>({
    mode: "onBlur",
    defaultValues: {
      id: "",
      name: "",
      type: "",
      breed: "",
      birthDate: "",
      heightCm: undefined,
      weightKg: undefined,
      photoUrl: "",
      notes: "",
      ...initialValues,
    },
  });
}
