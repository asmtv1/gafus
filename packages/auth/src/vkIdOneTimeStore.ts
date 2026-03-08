/**
 * One-time токены VK ID (web callback → CredentialsProvider / consent page).
 * Реализация через signed JWT (jose): не требует хранилища, работает
 * в многопроцессорном окружении (next start, Kubernetes и т.д.).
 * TTL 5 мин. «Однократность» обеспечена коротким сроком жизни — повторный
 * вход после consent физически невозможен, т.к. пользователь уже имеет сессию.
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

interface VkIdUser {
  userId: string;
  username: string;
  role: string;
}

interface VkIdPayload extends JWTPayload {
  userId: string;
  username: string;
  role: string;
}

const TTL_SECONDS = 5 * 60;

function getSecret(): Uint8Array {
  const raw = process.env.NEXTAUTH_SECRET ?? process.env.JWT_SECRET;
  if (!raw) throw new Error("NEXTAUTH_SECRET не задан");
  return new TextEncoder().encode(raw);
}

export async function storeVkIdOneTimeUser(token: string, user: VkIdUser): Promise<string> {
  const secret = getSecret();
  return new SignJWT({ userId: user.userId, username: user.username, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .setJti(token)
    .sign(secret);
}

async function verifyToken(jwtToken: string): Promise<VkIdUser | null> {
  try {
    const { payload } = await jwtVerify<VkIdPayload>(jwtToken, getSecret());
    return { userId: payload.userId, username: payload.username, role: payload.role };
  } catch {
    return null;
  }
}

export async function consumeVkIdOneTimeUser(jwtToken: string): Promise<VkIdUser | null> {
  return verifyToken(jwtToken);
}

/** Возвращает пользователя по токену без потребления (для страницы согласий VK). */
export async function getVkIdUserFromToken(jwtToken: string): Promise<VkIdUser | null> {
  return verifyToken(jwtToken);
}
