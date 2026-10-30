/**
 * Fail-closed birthday parsing for direct Core writers, independent of HTTP.
 * Existing owner-edit clients send YYYY-MM-DD or ISO timestamps with offset.
 * Do not accept Date.parse Gregorian rollovers or dates after UTC today.
 */
export function parseBirthDateEditWire(value: string, now = new Date()): Date {
  const invalid = (): never => {
    throw new Error("Неверная дата");
  };
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return invalid();
  const civil = new Date(`${day}T00:00:00.000Z`);
  if (
    Number.isNaN(civil.getTime()) ||
    civil.toISOString().slice(0, 10) !== day ||
    day > now.toISOString().slice(0, 10)
  ) {
    return invalid();
  }
  if (
    value !== day &&
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    return invalid();
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return invalid();
  return parsed;
}

/** The existing create/first-pet intent accepts date-only, unlike edit ISO. */
export function parseBirthDateCreateWire(value: string, now = new Date()): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Неверная дата");
  return parseBirthDateEditWire(value, now);
}
