/**
 * Pure Centrifugo v6 private channel authorization adapter. It never reads
 * process.env, imports Prisma, or trusts the provided user/channel itself.
 * A private, authenticated broker-to-API transport MUST precede this call;
 * the injected check is the actor-scoped live Chat2 readGate (DB/course/blocks).
 * Stateless room JWTs are unsafe after a BAN until they expire; use a separate
 * subscription signing key and proxy-only client subscriptions together.
 */
export type Chat2ProxyDecision =
  | { result: Record<string, never> }
  | { error: { code: 403; message: "permission denied" } };

const refused = (): Chat2ProxyDecision => ({
  error: { code: 403, message: "permission denied" },
});

export async function authorizeChat2SubscriptionProxy(
  raw: unknown,
  checkCurrentMembership: (userId: string, roomId: string) => Promise<unknown>,
): Promise<Chat2ProxyDecision> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return refused();
  const input = raw as Record<string, unknown>;
  if (typeof input.user !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(input.user) ||
      typeof input.channel !== "string" ||
      !/^chat2:[A-Za-z0-9_-]{1,128}$/.test(input.channel)) return refused();
  try {
    await checkCurrentMembership(input.user, input.channel.slice("chat2:".length));
    return { result: {} };
  } catch {
    // Never disclose whether the room or user exists, or error trace/text.
    return refused();
  }
}
