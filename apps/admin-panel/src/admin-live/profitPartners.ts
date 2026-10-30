/** Partners from the same authorized financial dashboard: never invent creator IDs. */
export type ProfitPartner = { id: string; name: string; active: boolean };

export function profitTodayFromReport(source: unknown): string | null {
  if (!source || typeof source !== "object" || !("today" in source)) return null;
  const day = source.today;
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < "2026-09-01") return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === day ? day : null;
}

export function profitPartnersFromReport(source: unknown): ProfitPartner[] | null {
  if (!source || typeof source !== "object" || !("partners" in source)) return null;
  const partners = source.partners;
  if (!Array.isArray(partners)) return null;
  if (!partners.every((p) => p && typeof p === "object" &&
      typeof p.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(p.id) &&
      typeof p.name === "string" && typeof p.active === "boolean")) return null;
  return partners as ProfitPartner[];
}
