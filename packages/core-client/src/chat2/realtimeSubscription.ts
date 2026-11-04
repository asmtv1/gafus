/**
 * Shared Web + Mobile Chat2 subscription handshake during opt-in cutover.
 * Missing/legacy mode preserves existing /:id/realtime JWT contract exactly.
 * Proxy-only mode MUST send no room JWT and MUST NOT fetch one, including
 * reconnect. Never infer proxy mode from a local browser/mobile env flag.
 */
export type Chat2ConnectionGrant = {
  token: string;
  wsUrl: string;
  subscriptionMode?: "proxy" | "token";
};
export type Chat2SubscriptionGrant =
  | { channel: string; mode: "proxy"; token?: never }
  | { channel: string; mode: "token"; token: string };
const roomIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;

export async function chat2SubscriptionForConnection(
  connection: Chat2ConnectionGrant,
  roomId: string,
  legacyGrant: () => Promise<{ channel: string; token: string }>,
): Promise<Chat2SubscriptionGrant> {
  if (!roomIdPattern.test(roomId)) throw Error("CHAT2_ROOM_ID_INVALID");
  const channel = `chat2:${roomId}`;
  if (connection.subscriptionMode === "proxy") {
    return { mode: "proxy", channel };
  }
  // Only an absent field or explicit token mode is legacy. An unknown mode
  // must not silently downgrade an attempted broker-security cutover to JWTs.
  if (connection.subscriptionMode !== undefined && connection.subscriptionMode !== "token") {
    throw Error("CHAT2_SUBSCRIPTION_MODE_INVALID");
  }
  const result = await legacyGrant();
  if (result.channel !== channel || !result.token) throw Error("CHAT2_LEGACY_GRANT_MISMATCH");
  return { mode: "token", channel, token: result.token };
}

/** Realtime transport options shared by Web and Mobile. The proxy branch is
 * deliberately empty: even getToken would bypass the live broker readGate. */
export function chat2SubscriptionTransportOptions(
  grant: Chat2SubscriptionGrant,
  refreshLegacyRoomToken: () => Promise<string>,
): Record<string, never> | { token: string; getToken: () => Promise<string> } {
  if (grant.mode === "proxy") return {};
  if (grant.mode !== "token" || !grant.token) throw Error("CHAT2_LEGACY_TOKEN_MISSING");
  return { token: grant.token, getToken: refreshLegacyRoomToken };
}
