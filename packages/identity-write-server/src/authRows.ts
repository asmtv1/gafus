/**
 * Auth SQL repository; Core owns validation, credential verification and
 * public errors. Refresh rotation and password updates use same-tx CAS, with
 * session revocation before commit.
 */
import { prisma } from "@gafus/prisma";

export const RegistrationChannel = {
  WEB: "WEB",
  IOS: "IOS",
  ANDROID: "ANDROID",
  UNKNOWN: "UNKNOWN",
} as const;
export type RegistrationChannel = (typeof RegistrationChannel)[keyof typeof RegistrationChannel];
export type AuthRefreshMetadata = {
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
};

export function readAuthUsernameChangeActor(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true },
  });
}
export function readAuthUsernameCandidate(username: string) {
  return prisma.user.findUnique({ where: { username } });
}
export function updateAuthUsername(userId: string, username: string) {
  return prisma.user.update({ where: { id: userId }, data: { username } });
}
export function readAuthCurrentUsername(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
}
export function readAuthUsernameOwner(username: string) {
  return prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
}
export function readAuthUserSummary(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, role: true, phone: true },
  });
}
export function readLoginCredentials(username: string) {
  return prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, role: true, password: true, registrationPending: true },
  });
}
export function readAuthRegistrationPending(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { registrationPending: true },
  });
}
export function createAuthRefreshToken(
  userId: string,
  id: string,
  tokenHash: string,
  metadata: AuthRefreshMetadata,
) {
  return prisma.refreshToken.create({
    data: {
      id,
      userId,
      tokenHash,
      deviceId: metadata.deviceId ?? null,
      userAgent: metadata.userAgent ?? null,
      ipAddress: metadata.ipAddress ?? null,
      expiresAt: metadata.expiresAt,
    },
  });
}
export function readAuthRefreshToken(tokenHash: string) {
  return prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      user: { select: { id: true, username: true, role: true, registrationPending: true } },
    },
  });
}
export type RefreshRotationOutcome = "ROTATED" | "REGISTRATION_PENDING" | "CONFLICT";
export function rotateAuthRefreshToken(
  oldTokenHash: string,
  userId: string,
  newTokenHash: string,
  newTokenId: string,
  metadata: AuthRefreshMetadata,
): Promise<RefreshRotationOutcome> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { registrationPending: true },
    });
    if (!user || user.registrationPending) return "REGISTRATION_PENDING";
    const consumed = await tx.refreshToken.updateMany({
      where: { tokenHash: oldTokenHash, userId, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    if (consumed.count !== 1) return "CONFLICT";
    await tx.refreshToken.create({
      data: {
        id: newTokenId,
        userId,
        tokenHash: newTokenHash,
        deviceId: metadata.deviceId ?? null,
        userAgent: metadata.userAgent ?? null,
        ipAddress: metadata.ipAddress ?? null,
        expiresAt: metadata.expiresAt,
      },
    });
    return "ROTATED";
  });
}
export async function revokeAuthRefreshToken(tokenHash: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash },
    data: { revokedAt: new Date() },
  });
}
export function revokeAllAuthSessions(userId: string): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const at = new Date();
    await tx.user.update({ where: { id: userId }, data: { sessionsRevokedAt: at } });
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: at },
    });
  });
}
export function readAuthVkPhone(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
}
export function readAuthPhoneOwnerExcluding(userId: string, phone: string) {
  return prisma.user.findFirst({ where: { phone, NOT: { id: userId } } });
}
export function updateAuthVkPhone(userId: string, phone: string) {
  return prisma.user.update({ where: { id: userId }, data: { phone } });
}
export function readAuthPasswordSetAt(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { passwordSetAt: true },
  });
}
export function setAuthPasswordOnce(userId: string, hash: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const at = new Date();
    const updated = await tx.user.updateMany({
      where: { id: userId, passwordSetAt: null },
      data: { password: hash, passwordSetAt: at, sessionsRevokedAt: at },
    });
    if (updated.count !== 1) return false;
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: at },
    });
    return true;
  });
}
export function readAuthNotificationEmail(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
}
export function readAuthPasswordForChange(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { password: true, passwordSetAt: true },
  });
}
export function changeAuthPasswordCAS(
  userId: string,
  oldHash: string,
  newHash: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const at = new Date();
    const updated = await tx.user.updateMany({
      where: { id: userId, password: oldHash, passwordSetAt: { not: null } },
      data: { password: newHash, passwordSetAt: at, sessionsRevokedAt: at },
    });
    if (updated.count !== 1) return false;
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: at },
    });
    return true;
  });
}
