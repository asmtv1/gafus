import { apiRequest } from "../api/client";

/** Uses Hono's existing anti-enumeration email flow. */
export async function requestPasswordReset(email: string): Promise<void> {
  await apiRequest<void>("/api/v1/auth/password-reset-request", {
    method: "POST",
    json: { email },
  });
}

/** The one-time token only lives in React state until submission. */
export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  await apiRequest<void>("/api/v1/auth/reset-password", {
    method: "POST",
    json: { token, password },
  });
}
