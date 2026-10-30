/** Pure auth limiter classification. Only session refresh/revocation may use
 * the independent maintenance budget; credential guessing remains strict. */
export function authRateLimitScope(path: string, method: string):
  "availability" | "identity" | "session" | "credential" {
  if (path === "/api/v1/auth/username-available" && method === "GET") return "availability";
  if (path === "/api/v1/auth/me" && method === "GET") return "identity";
  if (method === "POST" && (
    path === "/api/v1/auth/refresh" ||
    path === "/api/v1/auth/logout" ||
    path === "/api/v1/auth/logout-all"
  )) return "session";
  return "credential";
}
