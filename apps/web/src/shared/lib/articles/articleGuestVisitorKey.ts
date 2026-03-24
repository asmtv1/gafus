const STORAGE_KEY = "gafus:articleVisitorKey:v1";

/**
 * Стабильный идентификатор гостя для дедупликации просмотров статей (localStorage).
 */
export function getOrCreateArticleGuestVisitorKey(): string {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    let key = localStorage.getItem(STORAGE_KEY);
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, key);
    }
    return key;
  } catch {
    return "";
  }
}
