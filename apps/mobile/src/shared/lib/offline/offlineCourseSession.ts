/** Local course-file ownership, separate from the server-verified mutation epoch.
 * A cached credential may reopen only its own files, never authorize a new download
 * or a queued server mutation. No ownerless legacy data is adopted. */
const validPrincipal = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value) && value !== "anonymous";
let principal: string | null = null;
let writable = false;
let generation = 0;
const listeners = new Set<() => void>();

export interface OfflineCourseScope {
  principalId: string;
  isCurrent(): boolean;
  canWrite(): boolean;
}

export function setOfflineCoursePrincipal(value: string | null, verified = false): void {
  const next = value && validPrincipal(value) ? value : null;
  if (next === principal && next !== null && writable === verified) return;
  if (next !== principal || next === null) generation++;
  principal = next;
  writable = next !== null && verified;
  for (const listener of listeners) listener();
}

export function captureOfflineCourseScope(): OfflineCourseScope | null {
  const owner = principal;
  const epoch = generation;
  if (!owner) return null;
  const isCurrent = () => generation === epoch && principal === owner;
  return { principalId: owner, isCurrent, canWrite: () => isCurrent() && writable };
}

export function getOfflineCourseScopeVersion(): number {
  return generation;
}

export function subscribeOfflineCourseSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Only compare the subject of a credential already read from encrypted local
 * storage. This is NOT JWT signature verification and never grants API access. */
export function cachedCredentialOwnsCourses(token: string, cachedId: string): boolean {
  if (!validPrincipal(cachedId)) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1] || parts[1].length > 16_384) return false;
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload: unknown = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    return !!payload && typeof payload === "object" && "sub" in payload && payload.sub === cachedId;
  } catch { /* diagnostic: expected Malformed credentials fail closed and are never copied into diagnostics. */
    // Do not log malformed credentials.
    return false;
  }
}
