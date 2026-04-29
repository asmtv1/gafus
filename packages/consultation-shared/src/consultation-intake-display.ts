import type { ConsultationPetGender } from "./types";

export function formatConsultationPetGenderRu(
  gender: ConsultationPetGender | null | undefined,
): string {
  if (!gender) {
    return "—";
  }
  return gender === "MALE" ? "Мальчик" : "Девочка";
}
