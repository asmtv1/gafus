import type { ConsultationPetGender } from "@gafus/prisma";

export function formatConsultationPetGenderRu(
  g: ConsultationPetGender | null | undefined,
): string {
  if (!g) {
    return "—";
  }
  return g === "MALE" ? "Мальчик" : "Девочка";
}
