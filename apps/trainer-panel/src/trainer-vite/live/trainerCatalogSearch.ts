/** Search after full actor-authorized GET and BEFORE pagination. No fuzzy guesses,
 * no network request per keystroke, and no hidden first-page-only results. */
export function normalizeCatalogText(input: string): string {
  return input.normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/ё/g, "е")
    .replace(/[«»„“”‘’]/g, " ")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
export function matchesCatalogSearch(query: string, fields: (string | null | undefined)[]): boolean {
  const tokens = normalizeCatalogText(query).split(" ").filter(Boolean);
  if (!tokens.length) return true;
  const haystack = normalizeCatalogText(fields.filter(Boolean).join(" "));
  return tokens.every(token => haystack.includes(token));
}
/** Compact plain-text preview for markdown training copy. Never render untrusted HTML. */
export function catalogPlainPreview(input: string, max = 120): string {
  const text = input.replace(/<[^>]*>/g, " ")
    .replace(/!?\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_#>~|]/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}
export type CatalogSort = "newest" | "oldest" | "title" | "recentlyEdited" | "relations";
export function sortCatalogRows<T extends {
  id: string; title: string; createdAt: string; updatedAt: string;
}>(rows: readonly T[], sort: CatalogSort, relations: (row: T) => number): T[] {
  return [...rows].sort((a, b) => {
    const tie = a.title.localeCompare(b.title, "ru") || a.id.localeCompare(b.id);
    if (sort === "title") return tie;
    if (sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
    if (sort === "recentlyEdited") return b.updatedAt.localeCompare(a.updatedAt);
    if (sort === "relations") return relations(b) - relations(a) || tie;
    // Keep the server's confirmed order when timestamps are tied (stable Array.sort).
    return b.createdAt.localeCompare(a.createdAt);
  });
}
export const CATALOG_PAGE_SIZES = [10, 25, 50] as const;
export function clampCatalogPage(page: number, count: number, perPage: number): number {
  const pages = Math.max(1, Math.ceil(count / perPage));
  return Math.max(0, Math.min(Number.isSafeInteger(page) ? page : 0, pages - 1));
}
