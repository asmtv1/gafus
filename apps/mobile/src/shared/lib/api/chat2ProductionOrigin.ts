/** Allow Chat2 on production only when both API destinations are explicitly production.
 * A local/refactor API cannot silently send chat requests to live user data. */
export function isPairedProductionChat2Origin(
  chat2Origin: string, mobileApiBaseUrl: string,
): boolean {
  return chat2Origin === "https://api.gafus.ru" && mobileApiBaseUrl === "https://api.gafus.ru";
}
