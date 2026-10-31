/**
 * Test-only fake server: expired access cookie and an invalid refresh cookie.
 * This supplies the additional /auth/refresh request from the real API client
 * while keeping the domain-endpoint spy observable. We do not mock a successful
 * refresh or replay protected data. Successful rotation and failures have
 * separate tests in shared/api/client.refresh.test.ts.
 */
export function withRejectedRefreshCookie(
  endpointFetch: unknown,
): (path: string, init?: RequestInit) => unknown {
  if (typeof endpointFetch !== "function") throw new TypeError("Expected a test fetch handler");
  const handler = endpointFetch as (path: string, init?: RequestInit) => unknown;
  return (path, init) => path === "/api/v1/auth/refresh"
    ? Promise.resolve(new Response(
      JSON.stringify({ success: false, error: "Refresh cookie expired" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    ))
    : handler(path, init);
}
