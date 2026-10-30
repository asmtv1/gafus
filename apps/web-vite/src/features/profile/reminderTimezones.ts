/** IANA time zones for the reminder selector, kept as their API identifiers.
 * Browser Intl data supplies the complete list; fallback covers typical zones
 * if an older runtime does not implement Intl.supportedValuesOf. */
export const commonReminderTimeZones = [
  ["Europe/Kaliningrad", "Калининград"],
  ["Europe/Moscow", "Москва"],
  ["Europe/Samara", "Самара"],
  ["Europe/Saratov", "Саратов"],
  ["Europe/Ulyanovsk", "Ульяновск"],
  ["Asia/Yekaterinburg", "Екатеринбург"],
  ["Asia/Omsk", "Омск"],
  ["Asia/Novosibirsk", "Новосибирск"],
  ["Asia/Krasnoyarsk", "Красноярск"],
  ["Asia/Irkutsk", "Иркутск"],
  ["Asia/Yakutsk", "Якутск"],
  ["Asia/Vladivostok", "Владивосток"],
  ["Asia/Magadan", "Магадан"],
  ["Asia/Kamchatka", "Камчатка"],
  ["Europe/Minsk", "Минск"],
  ["Europe/Paris", "Париж"],
  ["Europe/London", "Лондон"],
  ["Asia/Almaty", "Алматы"],
  ["Asia/Tbilisi", "Тбилиси"],
  ["Asia/Dubai", "Дубай"],
  ["Asia/Tokyo", "Токио"],
  ["America/New_York", "Нью-Йорк"],
  ["UTC", "UTC"],
] as const;

const preferred = new Set<string>(commonReminderTimeZones.map(([zone]) => zone));
let available: string[] = [];
try {
  available = Intl.supportedValuesOf?.("timeZone") ?? [];
} catch { /* Older browsers use the curated list. */ }
export const otherReminderTimeZones = [...new Set(available)]
  .filter(zone => !preferred.has(zone)).sort((a, b) => a.localeCompare(b));

/** Keep pre-existing valid zone identifiers even if omitted by browser Intl,
 * e.g. backward-compatible IANA aliases or UTC. Never overwrite on edit. */
export function missingReminderTimeZone(zone: string): string | null {
  return zone && !preferred.has(zone) && !otherReminderTimeZones.includes(zone)
    ? zone : null;
}
