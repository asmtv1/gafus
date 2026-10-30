import type { AuthRegisterBody } from "@gafus/core-client/validation/auth-register";
import { apiRequest } from "../api/client";
import type { AuthUser } from "./authApi";

export type RegisterBody = AuthRegisterBody;

export function registerAccount(body: RegisterBody): Promise<{ user: AuthUser }> {
  // Server validates the shared Core schema and stores consent in a transaction.
  // HttpOnly cookie transport is opt-in; JWTs never reach browser JavaScript.
  return apiRequest("/api/v1/auth/register", {
    method: "POST", json: body, browserAuth: true,
  });
}

export function previewRegistrationPromoCode(promoCode: string): Promise<{ code: string }> {
  return apiRequest("/api/v1/auth/registration-promo-preview", {
    method: "POST", json: { promoCode },
  });
}
