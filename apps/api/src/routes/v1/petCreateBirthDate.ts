/**
 * AG4 G05 create-only contract: an exact Gregorian date-only wire value.
 * Compare with the server UTC calendar date. No host timezone conversion or
 * Date(y,m,d) rollover (including zones with skipped civil dates).
 */
export function isValidCreatePetBirthDate(value: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value && value <= now.toISOString().slice(0, 10);
}

/** Shared edit wire for pet/user birth dates: date-only or existing ISO timestamp. */
export function isValidBirthDateEditWire(value: string): boolean {
  const day = value.slice(0, 10);
  if (!isValidCreatePetBirthDate(day)) return false;
  if (value === day) return true;
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
