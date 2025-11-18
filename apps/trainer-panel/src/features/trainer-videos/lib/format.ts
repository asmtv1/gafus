const FILE_SIZE_UNITS = ["Б", "КБ", "МБ", "ГБ"] as const;

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 Б";
  }

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), FILE_SIZE_UNITS.length - 1);
  const value = bytes / Math.pow(1024, exponent);

  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${FILE_SIZE_UNITS[exponent]}`;
}

export function formatRuDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

