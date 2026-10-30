/* eslint-disable @gafus/require-client-catch-tracer -- Native push/SDK errors may contain device endpoints; fail closed without logging raw exceptions. */
/**
 * Ephemeral process-local push registration coordination. No persisted endpoints,
 * no API calls, no UUID allocation, no owner identifiers in logs.
 */
export type PushActor = Readonly<{ ownerId: string; authEpoch: string }>;
export type PushProvider = "expo" | "rustore";

export function createPushRegistrationCoordinator() {
  const pending = new Map<string, Promise<boolean>>();
  const successful = new Map<string, Partial<Record<PushProvider, string>>>();
  const unregistering = new Map<string, Promise<boolean>>();
  const blocked = new Set<string>();
  let lastActorKey: string | null = null;
  const actorKey = (a: PushActor) => JSON.stringify([a.ownerId, a.authEpoch]);

  function run(
    actor: PushActor,
    getCurrentActor: () => PushActor | null,
    isLive: () => boolean,
    task: (captured: PushActor, isCurrent: () => boolean) => Promise<boolean>,
  ): Promise<boolean> {
    const key = actorKey(actor);
    const isCurrent = () => {
      try {
        const current = getCurrentActor();
        return (
          isLive() &&
          !blocked.has(key) &&
          current?.ownerId === actor.ownerId &&
          current.authEpoch === actor.authEpoch
        );
      } catch {
        return false;
      }
    };
    if (!actor.ownerId || !actor.authEpoch || !isCurrent()) return Promise.resolve(false);
    if (lastActorKey !== key) {
      // Never retain old owners' device endpoints in process memory indefinitely.
      successful.clear();
      lastActorKey = key;
    }
    const existing = pending.get(key);
    if (existing) return existing;
    const job = (async () => {
      try {
        const result = await task(actor, isCurrent);
        return isCurrent() && result;
      } catch {
        // SDK errors may embed private token values. Never log the error.
        return false;
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, job);
    return job;
  }

  async function registerToken(
    actor: PushActor,
    provider: PushProvider,
    token: string,
    isCurrent: () => boolean,
    save: (token: string, isCurrent: () => boolean) => Promise<boolean>,
  ): Promise<boolean> {
    if (!isCurrent() || !token.trim()) return false;
    const key = actorKey(actor);
    if (successful.get(key)?.[provider] === token) return true;
    let saved: boolean;
    try {
      saved = await save(token, isCurrent);
    } catch {
      return false;
    }
    if (!isCurrent() || !saved) return false;
    const current = successful.get(key) ?? {};
    current[provider] = token; // only the latest confirmed token; rotation is registered anew
    successful.set(key, current);
    return true;
  }

  /** A confirmed user-initiated DELETE must permit an explicit same-epoch re-enable. */
  function invalidateActor(actor: PushActor): void {
    successful.delete(actorKey(actor));
  }

  /**
   * Unregister waits for any already-started registration to settle before DELETE.
   * New register effects are blocked while deleting. Once sent, the server operation
   * is still subject to AG1's cross-owner ordering race (not solvable client-side).
   */
  function unregister(
    actor: PushActor,
    getCurrentActor: () => PushActor | null,
    isLive: () => boolean,
    task: (isCurrent: () => boolean) => Promise<boolean>,
  ): Promise<boolean> {
    const key = actorKey(actor);
    const currentActor = () => {
      try {
        const now = getCurrentActor();
        return now?.ownerId === actor.ownerId && now.authEpoch === actor.authEpoch;
      } catch {
        return false;
      }
    };
    const isCurrent = () => isLive() && currentActor();
    if (!actor.ownerId || !actor.authEpoch || !isCurrent()) return Promise.resolve(false);
    const existing = unregistering.get(key);
    if (existing) return existing;
    // An unknown or partially acknowledged DELETE invalidates any earlier local
    // registration receipt. Explicit re-enable MUST re-POST rather than skip by cache.
    blocked.add(key);
    invalidateActor(actor);
    const job = (async () => {
      try {
        const registration = pending.get(key);
        if (registration) await registration;
        if (!isCurrent()) return false;
        const ack = await task(isCurrent);
        if (ack && currentActor()) invalidateActor(actor);
        return ack && isCurrent();
      } catch {
        return false; // Network ambiguity is never evidence of revoked delivery.
      } finally {
        blocked.delete(key);
        unregistering.delete(key);
      }
    })();
    unregistering.set(key, job);
    return job;
  }

  return { run, registerToken, invalidateActor, unregister };
}
