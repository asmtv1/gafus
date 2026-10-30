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
    if (u.username || u.password || u.hash || !u.pathname.endsWith("/connection/websocket"))
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
export async function connectToken(userId: string) {
  const token = await new SignJWT({})
    .setIssuer("gafus-chat2")
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret());
  return { token, wsUrl: wsAddress() };
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
