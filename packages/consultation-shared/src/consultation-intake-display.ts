import type { ConsultationPetGender } from "./types.js";

export function formatConsultationPetGenderRu(
  gender: ConsultationPetGender | null | undefined,
): string {
  if (!gender) {
    return "—";
  }
  return gender === "MALE" ? "Мальчик" : "Девочка";
}
