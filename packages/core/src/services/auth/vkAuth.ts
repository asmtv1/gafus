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

const MAX_FULLNAME_LENGTH = 120;
const MAX_AVATAR_URL_LENGTH = 2048;
const MAX_BIRTHDAY_LENGTH = 10; // DD.MM.YYYY

/** Безопасный парсинг даты рождения VK: DD.MM.YYYY. DD.MM без года — null. */
function parseVkBirthday(birthday: string | undefined): Date | null {
  if (!birthday || typeof birthday !== "string") return null;
  if (birthday.length > MAX_BIRTHDAY_LENGTH) return null;

  const parts = birthday.trim().split(".");
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null;

  const currentYear = new Date().getFullYear();
  if (year < 1900 || year > currentYear) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) return null;

  return date;
}

/** Валидация avatar URL: только https, без javascript:/data: и т.п. */
function sanitizeAvatarUrl(url: string | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (trimmed.length > MAX_AVATAR_URL_LENGTH) return null;
  if (!trimmed.toLowerCase().startsWith("https://")) return null;
  return trimmed;
}

/** Ограничение fullName по длине (как в updateUserProfile). */
function sanitizeFullName(firstName: unknown, lastName: unknown): string | null {
  const parts = [firstName, lastName]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map((s) => s.trim());
  const full = parts.join(" ").trim();
  if (!full) return null;
  return full.length > MAX_FULLNAME_LENGTH ? full.slice(0, MAX_FULLNAME_LENGTH) : full;
}

export interface VkProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  avatar?: string;
  birthday?: string;
}

/**
 * Получает профиль VK через users.get с lang=0 (русский).
 * user_info возвращает имена транслитерированными — users.get с lang=0 даёт кириллицу.
 * Fallback на user_info при ошибке users.get.
 */
export async function fetchVkProfile(params: {
  accessToken: string;
  vkUserId: string;
  clientId: string;
}): Promise<VkProfile> {
  const { accessToken, vkUserId, clientId } = params;

  // users.get с lang=0 — имена на русском (VK API транслитерирует при lang=3)
  if (vkUserId) {
    const usersGetUrl = `https://api.vk.com/method/users.get?user_ids=${encodeURIComponent(vkUserId)}&fields=photo_200,bdate&access_token=${encodeURIComponent(accessToken)}&v=5.199&lang=0`;

    try {
      const res = await fetch(usersGetUrl);
      type VkUser = { id: number; first_name?: string; last_name?: string; bdate?: string; photo_200?: string };
      const data = (await res.json()) as { response?: VkUser[]; error?: { error_code: number } };

      if (data.response && data.response.length > 0) {
        const u = data.response[0];
        return {
          id: String(u.id),
          first_name: u.first_name,
          last_name: u.last_name,
          avatar: u.photo_200,
          birthday: u.bdate?.includes(".") ? u.bdate : undefined, // DD.MM или DD.MM.YYYY
        };
      }
    } catch (err) {
      logger.warn("VK users.get failed, fallback to user_info", { err });
    }
  }

  // Fallback: user_info (может вернуть транслит)
  const userInfoRes = await fetch("https://id.vk.ru/oauth2/user_info", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      access_token: accessToken,
    }),
  });
  type VkUserInfo = { user_id: string; first_name?: string; last_name?: string; avatar?: string; birthday?: string };
  const userInfo = (await userInfoRes.json()) as { user?: VkUserInfo };
  if (!userInfo.user?.user_id) {
    throw new Error("VK profile fetch failed");
  }
  return {
    id: String(userInfo.user.user_id),
    first_name: userInfo.user.first_name,
    last_name: userInfo.user.last_name,
    avatar: userInfo.user.avatar,
    birthday: userInfo.user.birthday,
  };
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
  const fullName = sanitizeFullName(vkProfile.first_name, vkProfile.last_name);
  const birthDate = parseVkBirthday(vkProfile.birthday);
  const avatarUrl = sanitizeAvatarUrl(vkProfile.avatar);

  const account = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: { provider: "vk", providerAccountId },
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          role: true,
          phone: true,
          profile: { select: { fullName: true, birthDate: true } },
        },
      },
    },
  });

  if (account) {
    const profile = account.user.profile;
    const updateData: Record<string, unknown> = {
      avatarUrl,
    };
    if (!profile?.fullName && fullName) {
      updateData.fullName = fullName;
    }
    if (!profile?.birthDate && birthDate) {
      updateData.birthDate = birthDate;
    }

    await prisma.userProfile.upsert({
      where: { userId: account.userId },
      create: {
        userId: account.userId,
        avatarUrl,
        fullName,
        birthDate,
      },
      update: updateData,
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
        avatarUrl,
        fullName,
        birthDate,
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

/**
 * Привязка VK аккаунта к существующему пользователю (без VK).
 */
export async function linkVkToUser(
  userId: string,
  vkProfile: VkProfile,
): Promise<{ success: true } | { success: false; error: string }> {
  const providerAccountId = vkProfile.id;

  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: { provider: "vk", providerAccountId },
    },
    select: { userId: true },
  });

  if (existingAccount && existingAccount.userId !== userId) {
    return { success: false, error: "Этот аккаунт VK уже привязан к другому пользователю" };
  }

  if (existingAccount && existingAccount.userId === userId) {
    return { success: false, error: "VK уже подключён" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.account.create({
        data: {
          userId,
          type: "oauth",
          provider: "vk",
          providerAccountId,
        },
      });

      const fullName = sanitizeFullName(vkProfile.first_name, vkProfile.last_name);
      const birthDate = parseVkBirthday(vkProfile.birthday);
      const avatarUrl = sanitizeAvatarUrl(vkProfile.avatar);

      const existingProfile = await tx.userProfile.findUnique({
        where: { userId },
        select: { fullName: true, birthDate: true, avatarUrl: true },
      });

      const updateData: Record<string, unknown> = {};
      if (!existingProfile?.fullName && fullName) updateData.fullName = fullName;
      if (!existingProfile?.birthDate && birthDate) updateData.birthDate = birthDate;
      if (!existingProfile?.avatarUrl && avatarUrl) updateData.avatarUrl = avatarUrl;

      if (Object.keys(updateData).length > 0 || !existingProfile) {
        await tx.userProfile.upsert({
          where: { userId },
          create: { userId, fullName, birthDate, avatarUrl },
          update: updateData,
        });
      }
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return { success: false, error: "Этот аккаунт VK уже привязан к другому пользователю" };
    }
    throw error;
  }

  logger.success("linkVkToUser: VK linked", { userId, providerAccountId });
  return { success: true };
}
