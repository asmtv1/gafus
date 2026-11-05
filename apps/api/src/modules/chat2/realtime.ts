import { SignJWT } from "jose";
import { Chat2Error } from "./service.js";
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
/** No legacy fallback: a missing broker proxy configuration blocks realtime. */
export function requireChat2ProxyOnly(): void {
  const configured = process.env.CHAT2_SUBSCRIBE_PROXY_ENABLED === "true";
  const shared = process.env.CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET ?? "";
  const signing = process.env.CHAT2_CENTRIFUGO_TOKEN_SECRET ?? "";
  const brokerKey = process.env.CHAT2_CENTRIFUGO_API_KEY ?? "";
  if (!configured || shared.length < 32 || signing.length < 32 ||
      shared === signing || shared === brokerKey || (brokerKey && signing === brokerKey)) {
    throw new Chat2Error("REALTIME_UNAVAILABLE", 503, "Realtime не настроен");
  }
}

export async function connectToken(userId: string) {
  requireChat2ProxyOnly();
  const wsUrl = wsAddress();
  const token = await new SignJWT({})
    .setIssuer("gafus-chat2")
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret());
  return { token, wsUrl, subscriptionMode: "proxy" as const };
}
