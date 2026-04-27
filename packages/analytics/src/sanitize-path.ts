/**
 * pathname + только allowlisted query-ключи (F6): paid, personalize, courseType.
 */
const ALLOWED_QUERY_KEYS = ["courseType", "paid", "personalize"] as const;

export function sanitizePath(
  pathname: string,
  searchParams: { get: (key: string) => string | null },
): string {
  const pairs: string[] = [];
  for (const key of ALLOWED_QUERY_KEYS) {
    const v = searchParams.get(key);
    if (v != null && v !== "") {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
    }
  }
  if (pairs.length === 0) {
    return pathname;
  }
  pairs.sort();
  return `${pathname}?${pairs.join("&")}`;
}
