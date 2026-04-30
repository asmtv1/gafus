export function formatRuDate(date: Date | string | null | undefined): string {
  if (!date) {
    return "";
  }

  return new Date(date).toLocaleDateString("ru-RU");
}

export function formatRuDateTime(date: Date | string | null | undefined): string {
  if (!date) {
    return "";
  }

  return new Date(date).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
