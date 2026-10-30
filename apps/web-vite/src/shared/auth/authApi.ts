import { ApiError, apiRequest } from "../api/client";

export type AuthUser = {
  id: string;
  username: string;
  role: "USER" | "PARTNER" | "MODERATOR" | "TRAINER" | "ADMIN";
};

export type Credentials = { username: string; password: string };

export function login(credentials: Credentials): Promise<{ user: AuthUser }> {
  return apiRequest("/api/v1/auth/login", {
    method: "POST",
    json: credentials,
    browserAuth: true,
  });
}

/**
 * Initial /me can return 401 when a valid refresh cookie outlives access cookie.
 * Try exactly one rotation, then retry /me. A network/5xx failure is not logout.
 * Only Web cookies are sent; Expo continues to use its own Bearer flow.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    return await apiRequest<AuthUser>("/api/v1/auth/me");
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
  }

  try {
    await refreshSession();
  } catch (error) {
    if (error instanceof ApiError && [400, 401, 403].includes(error.status)) return null;
    if (error instanceof ApiError && error.status === 409) {
      // Another browser tab may have rotated the shared cookie. Verify the
      // resulting server identity; never retry a refresh with the old cookie.
      try {
        return await apiRequest<AuthUser>("/api/v1/auth/me");
      } catch {
        // A 409 is ambiguous until the competing tab commits its cookie.
        // Keep the session UNKNOWN rather than incorrectly signing out.
        throw error;
      }
    }
    throw error;
  }
  try {
    return await apiRequest<AuthUser>("/api/v1/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function refreshSession(): Promise<void> {
  await apiRequest("/api/v1/auth/refresh", { method: "POST", json: {}, browserAuth: true });
}

export async function logout(): Promise<void> {
  await apiRequest("/api/v1/auth/logout", { method: "POST", json: {}, browserAuth: true });
}
