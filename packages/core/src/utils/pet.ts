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
