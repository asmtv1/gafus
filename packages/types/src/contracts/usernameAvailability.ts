import { normalizeUsernameAvailabilityInput } from "../utils/validation";

/** GET /api/v1/auth/username-available is an owner-scoped advisory check, not reservation. */
export interface UsernameAvailabilityQuery { username: string }
export interface UsernameAvailabilityData { available: boolean }
export interface UsernameAvailabilitySuccess { success: true; data: UsernameAvailabilityData }
export interface UsernameAvailabilityServiceError {
  success: false;
  code: "USERNAME_UNAVAILABLE";
  error: string;
}
export type UsernameAvailabilityServiceResponse =
  | UsernameAvailabilitySuccess
  | UsernameAvailabilityServiceError;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Fail closed: do not accept truthy strings or an absent boolean. */
export function parseUsernameAvailabilityData(value: unknown): UsernameAvailabilityData | null {
  if (!record(value) || typeof value.available !== "boolean") return null;
  return { available: value.available };
}

export function parseUsernameAvailabilitySuccess(
  value: unknown,
): UsernameAvailabilitySuccess | null {
  if (!record(value) || value.success !== true || value.error !== undefined) return null;
  const data = parseUsernameAvailabilityData(value.data);
  return data ? { success: true, data } : null;
}

/**
 * The single browser-safe syntax gate for the normalized username value.
 * Hono query parsing and Web candidate planning use one public normalization
 * function (already exported from utils/validation), preserving each caller's
 * prior case policy. Mobile retains the existing server-trimmed wire path.
 * This does not reserve a username or change the independent POST constraint.
 */
export function isValidUsernameAvailabilityQuery(value: unknown): value is string {
  // Predicate accepts only already-normalized values. Wire parsing may trim
  // first, but a consumer cannot mistake an untrimmed string for canonical.
  return typeof value === "string" &&
    normalizeUsernameAvailabilityInput(value) === value;
}
