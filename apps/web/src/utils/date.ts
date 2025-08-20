// Вспомогательная функция для форматирования времени
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString();
  const secs = (seconds % 60).toString().padStart(2, "0");
  return secs === "00" ? minutes : `${minutes}:${secs}`;
}

/**
 * Стабильное форматирование даты для SSR/CSR совместимости
 * Формат: DD.MM.YYYY
 */
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}
