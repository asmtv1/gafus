import { declOfNum } from "./pluralize";

/**
 * Возвращает локализованное название типа питомца
 */
export function getPetTypeLabel(type: string): string {
  switch (type) {
    case "DOG":
      return "Собака";
    case "CAT":
      return "Кошка";
    default:
      return type; // Возвращаем как есть, если неизвестный тип
  }
}

/** Shared public-profile age label for Web and Mobile. */
export function formatPetAge(birthDate: Date | string | null): string | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const now = new Date();
  if (!Number.isFinite(birth.getTime()) || birth > now) return null;
  let totalMonths = (now.getUTCFullYear() - birth.getUTCFullYear()) * 12
    + now.getUTCMonth() - birth.getUTCMonth();
  if (now.getUTCDate() < birth.getUTCDate()) totalMonths--;
  if (totalMonths < 1) return "Меньше месяца";
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return [
    years ? `${years} ${declOfNum(years, ["год", "года", "лет"])}` : "",
    months ? `${months} ${declOfNum(months, ["месяц", "месяца", "месяцев"])}` : "",
  ].filter(Boolean).join(" ");
}
