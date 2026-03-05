/**
 * VK ID — создание/поиск пользователей по профилю (id.vk.ru).
 * findOrCreateVkUser — для web callback и mobile API.
 */

import bcrypt from "bcryptjs";
import crypto from "crypto";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { transliterate } from "../../utils/transliterate";

const logger = createWebLogger("vk-auth");

export interface VkProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  avatar?: string;
}

export interface FindOrCreateVkResult {
  user: { id: string; username: string; role: string };
  needsPhone: boolean;
}

/**
 * Генерирует уникальный username из данных VK ID.
 */
export function generateUniqueVkUsername(
  firstName: string | undefined,
  lastName: string | undefined,
  providerAccountId: string,
): string {
  let base = "";
  if (firstName || lastName) {
    const parts = [firstName, lastName]
      .filter((s): s is string => Boolean(s))
      .map((s) => transliterate(s));
    base = parts.join("_");
  }
  if (!base || base.length < 3) {
    base = `vk_${providerAccountId}`;
  }
  return base;
}

/**
 * Create-or-find пользователь по VK ID профилю.
 */
export async function findOrCreateVkUser(
  vkProfile: VkProfile,
  providerAccountId: string,
): Promise<FindOrCreateVkResult> {
  const account = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: { provider: "vk", providerAccountId },
    },
    include: { user: { select: { id: true, username: true, role: true, phone: true } } },
  });

  if (account) {
    await prisma.userProfile.upsert({
      where: { userId: account.userId },
      create: {
        userId: account.userId,
        avatarUrl: vkProfile.avatar ?? null,
      },
      update: { avatarUrl: vkProfile.avatar ?? null },
    });
    return {
      user: {
        id: account.user.id,
        username: account.user.username,
        role: account.user.role,
      },
      needsPhone: account.user.phone.startsWith("vk_"),
    };
  }

  let username = generateUniqueVkUsername(
    vkProfile.first_name,
    vkProfile.last_name,
    providerAccountId,
  );
  let suffix = 0;
  let existing = await prisma.user.findFirst({ where: { username } });
  while (existing) {
    suffix += 1;
    username = `${username.replace(/_?\d+$/, "")}_${suffix}`;
    existing = await prisma.user.findFirst({ where: { username } });
  }

  const password = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
  const phone = `vk_${providerAccountId}`;

  const { user } = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        username,
        phone,
        password,
        isConfirmed: true,
        passwordSetAt: null,
      },
    });
    await tx.userProfile.create({
      data: {
        userId: u.id,
        avatarUrl: vkProfile.avatar ?? null,
      },
    });
    await tx.account.create({
      data: {
        userId: u.id,
        type: "oauth",
        provider: "vk",
        providerAccountId,
      },
    });
    return { user: u };
  });

  logger.success("findOrCreateVkUser: user created", { userId: user.id, username });

  return {
    user: { id: user.id, username: user.username, role: user.role },
    needsPhone: true,
  };
}
