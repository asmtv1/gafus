/**
 * Утилиты для работы с социальными ссылками в профилях пользователей
 *
 * Функции нормализации обрабатывают различные форматы ввода:
 * - username (просто ник)
 * - @username (с символом @)
 * - Полный URL (https://t.me/username, instagram.com/username)
 *
 * Все функции валидируют данные по правилам соответствующих платформ
 */

/**
 * Нормализует ввод Telegram username
 *
 * Правила Telegram:
 * - Минимум 5 символов
 * - Максимум 32 символа
 * - Только латинские буквы (a-z), цифры (0-9) и подчеркивание (_)
 * - Case-insensitive (приводится к нижнему регистру)
 *
 * Обрабатывает форматы:
 * - username
 * - @username
 * - https://t.me/username
 * - telegram.me/username
 *
 * @param input - Входная строка (username, @username или URL)
 * @returns Нормализованный username (без @, без URL, в нижнем регистре)
 * @throws Error если username не соответствует правилам Telegram
 */
export function normalizeTelegramInput(input: string): string {
  if (!input) return "";

  const trimmed = input.trim();
  if (!trimmed) return "";

  // Извлечь username из URL (t.me/username или telegram.me/username)
  const urlMatch = trimmed.match(/(?:t\.me|telegram\.me)\/([a-z0-9_]+)/i);
  if (urlMatch) {
    const username = urlMatch[1].toLowerCase();
    // Валидация извлеченного username
    if (!/^[a-z0-9_]{5,32}$/.test(username)) {
      throw new Error(
        "Telegram username должен содержать минимум 5 символов, только латинские буквы, цифры и подчеркивание",
      );
    }
    return username;
  }

  // Убрать @ в начале и привести к нижнему регистру
  const clean = trimmed.replace(/^@/, "").toLowerCase();

  // Валидация по правилам Telegram
  if (!/^[a-z0-9_]{5,32}$/.test(clean)) {
    throw new Error(
      "Telegram username должен содержать минимум 5 символов, только латинские буквы, цифры и подчеркивание",
    );
  }

  return clean;
}

/**
 * Нормализует ввод Instagram username
 *
 * Правила Instagram:
 * - Минимум 1 символ
 * - Максимум 30 символов
 * - Только латинские буквы (a-z), цифры (0-9), точки (.) и подчеркивание (_)
 * - Не может заканчиваться точкой
 * - Case-insensitive (приводится к нижнему регистру)
 *
 * Обрабатывает форматы:
 * - username
 * - @username
 * - https://instagram.com/username/
 * - instagram.com/username
 *
 * @param input - Входная строка (username, @username или URL)
 * @returns Нормализованный username (без @, без URL, в нижнем регистре)
 * @throws Error если username не соответствует правилам Instagram
 */
export function normalizeInstagramInput(input: string): string {
  if (!input) return "";

  const trimmed = input.trim();
  if (!trimmed) return "";

  // Извлечь username из URL
  const urlMatch = trimmed.match(/(?:instagram\.com|instagr\.am)\/([a-z0-9._]+)/i);
  if (urlMatch) {
    const username = urlMatch[1].toLowerCase().replace(/\/$/, "");
    // Валидация извлеченного username
    if (!/^[a-z0-9._]{1,30}$/.test(username) || username.endsWith(".")) {
      throw new Error(
        "Instagram username должен содержать до 30 символов, только латинские буквы, цифры, точки и подчеркивание, не может заканчиваться точкой",
      );
    }
    return username;
  }

  // Убрать @ и trailing slash
  const clean = trimmed.replace(/^@/, "").replace(/\/$/, "").toLowerCase();

  // Валидация по правилам Instagram
  if (!/^[a-z0-9._]{1,30}$/.test(clean) || clean.endsWith(".")) {
    throw new Error(
      "Instagram username должен содержать до 30 символов, только латинские буквы, цифры, точки и подчеркивание, не может заканчиваться точкой",
    );
  }

  return clean;
}

/**
 * Формирует URL для Telegram из нормализованного username
 *
 * @param username - Нормализованный Telegram username (без @, без URL)
 * @returns Полный URL для Telegram профиля
 */
export function getTelegramUrl(username: string): string {
  if (!username) return "";
  return `https://t.me/${encodeURIComponent(username)}`;
}

/**
 * Формирует URL для Instagram из нормализованного username
 *
 * @param username - Нормализованный Instagram username (без @, без URL)
 * @returns Полный URL для Instagram профиля
 */
export function getInstagramUrl(username: string): string {
  if (!username) return "";
  return `https://www.instagram.com/${encodeURIComponent(username)}/`;
}
