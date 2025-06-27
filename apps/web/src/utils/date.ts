// Вспомогательная функция для форматирования времени
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString();
  const secs = (seconds % 60).toString().padStart(2, "0");
  return secs === "00" ? minutes : `${minutes}:${secs}`;
}
