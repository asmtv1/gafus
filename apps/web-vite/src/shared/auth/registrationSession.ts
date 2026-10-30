/**
 * The UUID is an idempotency key, NOT an auth secret.
 * Only this UUID may be kept in sessionStorage; credentials, consent or
 * registration payload must never be persisted in browser storage.
 */
const KEY = "gafus.registration.temp-session-id.v1";
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function registrationAttemptId(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  generate: () => string = () => crypto.randomUUID(),
): string {
  try {
    const existing = storage?.getItem(KEY);
    if (existing && UUID_V4.test(existing)) return existing;
  } catch {
    // Browsers can disable sessionStorage. Registration remains usable.
  }
  const fresh = generate();
  if (!UUID_V4.test(fresh)) throw new Error("Secure UUID generator unavailable");
  try {
    storage?.setItem(KEY, fresh);
  } catch {
    // Cannot persist idempotency key; it remains stable within this form.
  }
  return fresh;
}

export function clearRegistrationAttempt(storage: Pick<Storage, "removeItem"> | null): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Nothing sensitive is stored here.
  }
}
