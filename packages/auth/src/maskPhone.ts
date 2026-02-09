/**
 * Маскирует номер телефона: оставляет последние 2 цифры.
 * Пример: +79001234567 → "+7 *** *** ** 67"
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 2) return "***";
  const tail = digits.slice(-2);
  const len = digits.length;
  if (len <= 4) return "*".repeat(Math.max(0, len - 2)) + tail;
  const maskLen = len - 2;
  const masked = "*".repeat(maskLen);
  if (len <= 6) return masked + " " + tail;
  const p1 = masked.slice(0, 3);
  const p2 = masked.slice(3, 6);
  const p3 = masked.slice(6);
  const prefix = digits.startsWith("7") ? "+7 " : "+" + (digits[0] || "") + " ";
  return prefix + [p1, p2, p3].filter(Boolean).join(" ") + " " + tail;
}
