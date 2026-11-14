/**
 * VK OAuth persistence port. Core continues to own OAuth network exchange,
 * user-info sanitization, username/email collision policy and public errors.
 * SQL writes and the cross-process VK identity lock stay atomic here.
 */
import { prisma } from "@gafus/prisma";
import type { RegistrationChannel } from "./authRows";

export type SanitizedVkFields = {
  fullName: string | null;
  birthDate: Date | null;
  avatarUrl: string | null;
};
export function readVkUserEmail(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
}
export function readVkEmailOwner(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
}
export function updateVkUserEmail(userId: string, email: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { email },
  });
}
export function readDetailedVkAccount(providerAccountId: string) {
  return prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: "vk", providerAccountId } },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          role: true,
          phone: true,
          registrationPending: true,
          profile: { select: { fullName: true, birthDate: true, avatarUrl: true } },
        },
      },
    },
  });
}
export function readVkUsernameCollision(username: string) {
  return prisma.user.findFirst({ where: { username } });
}
export function upsertLinkedVkProfile(
  userId: string,
  fields: SanitizedVkFields,
  updateData: Record<string, unknown>,
) {
  return prisma.userProfile.upsert({
    where: { userId },
    create: { userId, ...fields },
    update: updateData,
  });
}
export function createPendingVkAccount(
  username: string,
  phone: string,
  password: string,
  registrationChannel: RegistrationChannel,
  emailForCreate: string | undefined,
  providerAccountId: string,
  fields: SanitizedVkFields,
) {
  return prisma.$transaction(async (tx) => {
    // Stable PostgreSQL identity lock across web/mobile concurrent callbacks.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`vk:${providerAccountId}`}, 0))`;
    const linked = await tx.account.findUnique({
      where: { provider_providerAccountId: { provider: "vk", providerAccountId } },
      include: {
        user: {
          select: { id: true, username: true, role: true, phone: true, registrationPending: true },
        },
      },
    });
    if (linked) return { user: linked.user, created: false };
    const user = await tx.user.create({
      data: {
        username,
        phone,
        password,
        passwordSetAt: null,
        registrationChannel,
        registrationPending: true,
        ...(emailForCreate ? { email: emailForCreate } : {}),
      },
    });
    await tx.userProfile.create({ data: { userId: user.id, ...fields } });
    await tx.account.create({
      data: { userId: user.id, type: "oauth", provider: "vk", providerAccountId },
    });
    return { user, created: true };
  });
}
export function readVkLinkedAccountOwner(providerAccountId: string) {
  return prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: "vk", providerAccountId } },
    select: { userId: true },
  });
}
export function linkVkAccountAndMergeProfile(
  userId: string,
  providerAccountId: string,
  fields: SanitizedVkFields,
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    await tx.account.create({
      data: { userId, type: "oauth", provider: "vk", providerAccountId },
    });
    const existing = await tx.userProfile.findUnique({
      where: { userId },
      select: { fullName: true, birthDate: true, avatarUrl: true },
    });
    const updateData: Record<string, unknown> = {};
    if (!existing?.fullName && fields.fullName) updateData.fullName = fields.fullName;
    if (!existing?.birthDate && fields.birthDate) updateData.birthDate = fields.birthDate;
    if (!existing?.avatarUrl && fields.avatarUrl) updateData.avatarUrl = fields.avatarUrl;
    if (Object.keys(updateData).length > 0 || !existing) {
      await tx.userProfile.upsert({
        where: { userId },
        create: { userId, ...fields },
        update: updateData,
      });
    }
  });
}
