/**
 * Chat2 is proxy-only. Every room subscription (including reconnect) must be
 * authorized by the broker -> Hono readGate. No client-side room JWT exists.
 * Missing/old `subscriptionMode` is a hard failure, never a legacy fallback.
 */
export type Chat2ConnectionGrant = {
  token: string;
  wsUrl: string;
  subscriptionMode: "proxy";
};
export type Chat2SubscriptionGrant = { channel: string; mode: "proxy" };
const roomIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;

export async function chat2SubscriptionForConnection(
  connection: Chat2ConnectionGrant,
  roomId: string,
): Promise<Chat2SubscriptionGrant> {
  if (!roomIdPattern.test(roomId)) throw Error("CHAT2_ROOM_ID_INVALID");
  if (connection.subscriptionMode !== "proxy") {
    throw Error("CHAT2_PROXY_ONLY_REQUIRED");
  }
  return { mode: "proxy", channel: `chat2:${roomId}` };
}

/** Never pass `token` or `getToken` to Centrifugo newSubscription(). */
export function chat2SubscriptionTransportOptions(
  grant: Chat2SubscriptionGrant,
): Record<string, never> {
  if (grant.mode !== "proxy" || !/^chat2:[a-zA-Z0-9_-]{1,128}$/.test(grant.channel)) {
    throw Error("CHAT2_PROXY_ONLY_REQUIRED");
  }
  return {};
}
