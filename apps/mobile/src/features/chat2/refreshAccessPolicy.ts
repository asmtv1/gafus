/** Return an empty Centrifugo refresh token only when access is definitively gone.
 * A temporary network/5xx failure must be retryable after connectivity returns.
 */
const terminalCodes = new Set([
  "COURSE_ACCESS_REQUIRED",
  "NOT_FOUND",
  "FORBIDDEN",
  "BLOCKED",
  "G05_SESSION_CHANGED",
  "NO_REFRESH_TOKEN",
  "REFRESH_REJECTED",
  "REGISTRATION_PENDING",
]);
export function isTerminalChat2RefreshFailure(code: string | undefined): boolean {
  return code !== undefined && terminalCodes.has(code);
}
