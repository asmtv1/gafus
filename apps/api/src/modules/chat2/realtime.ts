import { SignJWT } from "jose";
import { Chat2Error, readGate } from "./service.js";
/** Short-lived JWTs, issued only after Hono actor/room authorization. */
const secret = () => {
  const s = process.env.CHAT2_CENTRIFUGO_TOKEN_SECRET;
  if (!s || s.length < 32)
    throw new Chat2Error("REALTIME_UNAVAILABLE", 503, "Сервис сообщений временно недоступен");
  return new TextEncoder().encode(s);
};
const wsAddress = () => {
  const raw = process.env.CHAT2_PUBLIC_WS_URL ?? "";
  try {
    const u = new URL(raw);
    // The signed connection JWT must never be handed to an arbitrary WSS
    // origin, an alternative handler path or a URL with query credentials.
    // Production Chat2 is served exclusively behind the canonical GAFUS edge;
    // localhost ws:// remains available only outside production for QA.
    if (u.username || u.password || u.search || u.hash ||
        u.pathname !== "/connection/websocket" ||
        (process.env.NODE_ENV === "production" &&
          !["https://gafus.ru", "https://www.gafus.ru"].includes(
            `https://${u.host}`)))
      throw Error("bad");
    if (
      u.protocol !== "wss:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        u.protocol === "ws:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname)
      )
    )
      throw Error("bad");
    return u.toString();
  } catch {
    throw new Chat2Error("REALTIME_UNAVAILABLE", 503, "Realtime не настроен");
  }
};
/**
 * Cutover remains off by default. Advertise proxy-only subscription mode
 * ONLY when the internal broker->Hono secret is configured, otherwise fail
 * closed instead of silently telling clients to send old room JWTs.
 */
export function chat2SubscriptionMode(): "token" | "proxy" {
  if (process.env.CHAT2_SUBSCRIBE_PROXY_ENABLED !== "true") return "token";
  if ((process.env.CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET?.length ?? 0) < 32)
    throw new Chat2Error("REALTIME_UNAVAILABLE", 503, "Realtime не настроен");
  return "proxy";
}

export async function connectToken(userId: string) {
  const token = await new SignJWT({})
    .setIssuer("gafus-chat2")
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret());
  const mode = chat2SubscriptionMode();
  return { token, wsUrl: wsAddress(), ...(mode === "proxy" ? { subscriptionMode: mode } : {}) };
}
export async function subscriptionToken(userId: string, id: string) {
  await readGate(userId, id);
  const channel = `chat2:${id}`;
  const token = await new SignJWT({ channel })
    .setIssuer("gafus-chat2")
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(secret());
  return { token, channel };
}
