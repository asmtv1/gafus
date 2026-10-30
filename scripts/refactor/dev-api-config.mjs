/**
 * MIG-SEC-003 -- fail closed configuration for development.
 * Vite must call assertSafeDevApiBaseUrl before starting its dev server.
 */
export const DEV_API_URL = "http://127.0.0.1:4174";

export function assertSafeDevApiBaseUrl(candidate = DEV_API_URL) {
  if (typeof candidate !== "string") {
    throw new TypeError("Development API URL must be a string");
  }
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Development API URL is invalid");
  }
  if (
    parsed.href !== DEV_API_URL + "/" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Refactor dev API MUST be local mock " + DEV_API_URL);
  }
  return DEV_API_URL;
}
