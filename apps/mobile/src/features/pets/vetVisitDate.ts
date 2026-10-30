/** Convert a vet visit form date into the API's YYYY-MM-DD calendar day. */
export function parseVetVisitDate(day: string, now: Date = new Date()): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(day);
  if (!match) return null;

  const dayOfMonth = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1) return null;

  // JavaScript Date normalizes impossible days (31 February -> March).
  // Re-check the exact calendar components before accepting the visit date.
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, dayOfMonth);
  parsed.setUTCHours(0, 0, 0, 0);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== dayOfMonth
  ) {
    return null;
  }

  const visitedOn = `${match[3]}-${match[2]}-${match[1]}`;
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = `${String(now.getFullYear()).padStart(4, "0")}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  return visitedOn <= today ? visitedOn : null;
}
