import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";

export async function authenticatePasswordCredentials(username: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase().trim() },
    select: { id: true, username: true, role: true, password: true, passwordSetAt: true, registrationPending: true },
  });
  if (!user) throw new Error("Неверный логин или пароль");
  if (user.registrationPending) throw new Error("Завершите регистрацию через VK ID");
  if (user.passwordSetAt === null) throw new Error("Войдите через VK ID или установите пароль в профиле");
  if (!await bcrypt.compare(password, user.password)) throw new Error("Неверный логин или пароль");
  return { id: user.id, username: user.username, role: user.role };
}

export async function getActiveSessionUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, passwordSetAt: true, sessionsRevokedAt: true,
      phone: true, email: true, registrationPending: true },
  });
}

export async function getSessionProfileAvatar(userId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId }, select: { avatarUrl: true },
  });
  return profile?.avatarUrl ?? null;
}

export async function assertCompletedUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId }, select: { registrationPending: true },
  });
  if (!user || user.registrationPending) throw new Error("Registration is not completed");
}

export async function sessionIsCurrent(payload: { sub?: string; iat?: number; authenticatedAt?: unknown }) {
  if (!payload.sub) return false;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { sessionsRevokedAt: true, registrationPending: true },
  });
  if (!user || user.registrationPending) return false;
  const issuedAt = typeof payload.authenticatedAt === "number"
    ? payload.authenticatedAt : (payload.iat ?? 0) * 1000;
  return !user.sessionsRevokedAt || issuedAt > user.sessionsRevokedAt.getTime();
}
