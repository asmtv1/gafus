/**
 * In-memory store для one-time токенов VK ID (web callback → CredentialsProvider).
 * TTL 60s, consumed once.
 */

interface VkIdUser {
  userId: string;
  username: string;
  role: string;
}

const store = new Map<string, { user: VkIdUser; expiresAt: number }>();

export function storeVkIdOneTimeUser(token: string, user: VkIdUser): void {
  store.set(token, { user, expiresAt: Date.now() + 60_000 });
  const timer = setTimeout(() => store.delete(token), 60_000);
  if (typeof timer === "object" && "unref" in timer) (timer as NodeJS.Timeout).unref();
}

export function consumeVkIdOneTimeUser(token: string): VkIdUser | null {
  const entry = store.get(token);
  if (!entry) return null;
  store.delete(token);
  if (Date.now() > entry.expiresAt) return null;
  return entry.user;
}
