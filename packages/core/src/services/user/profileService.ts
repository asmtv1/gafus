import { parseBirthDateEditWire } from "../common/birthDateValidation";
import { getChatDisplayRole } from "../cynologistChat/authorRole";
/**
 * Profile Service - бизнес-логика работы с профилем пользователя
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import type { Prisma } from "@gafus/prisma";
import type { PublicProfile, UserWithTrainings } from "@gafus/types";
import { TrainingStatus } from "@gafus/types";
import {
  uploadFileToCDN,
  deleteFileFromCDN,
  getRelativePathFromCDNUrl,
  getUserAvatarPath,
  getSignedDownloadUrl,
} from "@gafus/cdn-upload";
import { randomUUID } from "crypto";

const logger = createWebLogger("profile-service");

/** Existing avatarUrl wire stays a URL, but only local private test avatars are signed on read. */
async function avatarUrlForProfile(value: string | null): Promise<string | null> {
  if (!value || !value.startsWith("isodev-avatar:")) return value;
  return getSignedDownloadUrl(value, 600);
}

// ========== Get User Profile ==========

/**
 * Получает профиль пользователя по ID
 */
export async function getUserProfile(userId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
  });
  return profile;
}

// ========== Update User Profile ==========

interface NormalizedProfileData {
  fullName?: string;
  city?: string;
  about?: string;
  telegram?: string;
  instagram?: string;
  website?: string;
  birthDate?: string;
}

/**
 * Обновляет или создаёт профиль пользователя
 */
export async function updateUserProfile(userId: string, data: NormalizedProfileData) {
  // An omitted field means "leave it untouched", not "clear it". This is
  // critical for Mobile and the new Vite editor, which send PATCH-like updates
  // via this long-standing PUT API. Explicit empty strings still clear fields.
  const updateData: Prisma.UserProfileUpdateInput = {};
  const createData: Prisma.UserProfileCreateInput = {
    user: { connect: { id: userId } },
  };

  for (const field of ["fullName", "city", "about", "telegram", "instagram", "website"] as const) {
    const submitted = data[field];
    if (submitted === undefined) continue;
    const value = submitted.trim() || null;
    updateData[field] = value;
    createData[field] = value;
  }

  if (data.birthDate !== undefined) {
    const normalizedBirthDate = data.birthDate.trim();
    if (!normalizedBirthDate) {
      updateData.birthDate = null;
      createData.birthDate = null;
    } else {
      const parsed = parseBirthDateEditWire(normalizedBirthDate);
      updateData.birthDate = parsed;
      createData.birthDate = parsed;
    }
  }

  const result = await prisma.userProfile.upsert({
    where: { userId },
    update: updateData,
    create: createData,
  });

  return result;
}

/**
 * Проверяет существование пользователя по ID
 */
export async function existsUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  return !!user;
}

/**
 * Получает userId по username (для fallback при несоответствии session.id)
 */
export async function getUserIdByUsername(username: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  return user?.id ?? null;
}

// ========== Get Public Profile ==========

/**
 * Получает публичный профиль пользователя по username
 */
export async function getPublicProfile(username: string): Promise<PublicProfile | null> {
  if (!username) throw new Error("username is required");

  const user = await prisma.user.findFirst({
    // Old questions API only provides the stable author ID.
    where: { OR: [{ username }, { id: username }] },
    select: {
      id: true,
      username: true,
      role: true,
      profile: {
        select: {
          fullName: true,
          city: true,
          birthDate: true,
          about: true,
          telegram: true,
          instagram: true,
          website: true,
          avatarUrl: true,
        },
      },
      diplomas: {
        orderBy: { issuedAt: "desc" },
        select: {
          id: true,
          title: true,
          issuedBy: true,
          issuedAt: true,
          url: true,
        },
      },
      pets: {
        where: { showInProfile: true },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          breed: true,
          birthDate: true,
          photoUrl: true,
        },
      },
      authoredCourses: {
        where: {
          showInProfile: true,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          type: true,
          logoImg: true,
          shortDesc: true,
          duration: true,
          isPrivate: true,
          isPaid: true,
          avgRating: true,
          updatedAt: true,
          trainingLevel: true,
        },
      },
    },
  });

  if (!user) return null;

  const courses =
    user.role === "TRAINER" && user.authoredCourses
      ? user.authoredCourses.map((course) => ({
          id: String(course.id),
          name: course.name,
          type: course.type,
          logoImg: course.logoImg,
          shortDesc: course.shortDesc,
          duration: course.duration,
          isPrivate: course.isPrivate,
          isPaid: course.isPaid,
          avgRating: course.avgRating,
          updatedAt: course.updatedAt ? new Date(course.updatedAt) : new Date(),
          trainingLevel: course.trainingLevel,
        }))
      : undefined;

  // PublicProfile is an explicit projection: never spread Prisma user/profile
  // relations into a guest-visible DTO, even when their select changes.
  const publicProfile: PublicProfile = {
    username: user.username,
    role: user.role,
    profile: user.profile
      ? {
          fullName: user.profile.fullName,
          city: user.profile.city,
          birthDate: user.profile.birthDate,
          about: user.profile.about,
          telegram: user.profile.telegram,
          instagram: user.profile.instagram,
          website: user.profile.website,
          avatarUrl: await avatarUrlForProfile(user.profile.avatarUrl),
        }
      : null,
    chatRole: await getChatDisplayRole(user),
    courses,
    diplomas: user.diplomas
      .filter((d) => d.issuedAt !== null)
      .map((d) => ({
        id: String(d.id),
        title: d.title,
        issuedBy: d.issuedBy || "",
        issuedAt: d.issuedAt || new Date(),
        ...(d.url ? { url: d.url } : {}),
      })),
    pets: user.pets.map((pet) => ({
      id: String(pet.id),
      name: pet.name,
      type: String(pet.type),
      breed: pet.breed ?? "",
      birthDate: pet.birthDate ?? null,
      photoUrl: pet.photoUrl,
    })),
  };

  return publicProfile;
}

// ========== Update Avatar ==========

/**
 * Обновляет аватар пользователя
 */
export async function updateAvatar(userId: string, file: File): Promise<string> {
  const originalExt = file.name.split(".").pop();
  const ext = process.env.GAFUS_ISOLATED_NONPROD_S3 !== undefined ? originalExt?.toLowerCase() : originalExt;
  if (!ext) throw new Error("Не удалось определить расширение файла");

  const relativePath = getUserAvatarPath(userId, randomUUID(), ext);
  // Never hold a database row lock during unpredictable CDN/network I/O.
  const avatarUrl = await uploadFileToCDN(file, relativePath);
  let oldAvatarUrl: string | null = null;

  try {
    oldAvatarUrl = await prisma.$transaction(async (tx) => {
      const owners = await tx.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      if (!owners.length) throw new Error("Пользователь не найден");
      const previous = await tx.userProfile.findUnique({
        where: { userId },
        select: { avatarUrl: true },
      });
      await tx.userProfile.upsert({
        where: { userId },
        update: { avatarUrl },
        create: { userId, avatarUrl },
      });
      return previous?.avatarUrl ?? null;
    });
  } catch (error) {
    // Failed database commit: avoid leaking the newly uploaded object.
    try {
      await deleteFileFromCDN(relativePath);
    } catch {
      logger.error(
        "Не удалось удалить новый аватар после ошибки БД",
        new Error("USER_AVATAR_COMPENSATION_DELETE_FAILED"),
      );
    }
    throw error;
  }

  // Old content is removed only after the new URL is durably committed.
  if (oldAvatarUrl && oldAvatarUrl !== avatarUrl) {
    try {
      await deleteFileFromCDN(getRelativePathFromCDNUrl(oldAvatarUrl));
    } catch {
      logger.error("Не удалось удалить старый аватар", new Error("USER_AVATAR_OLD_DELETE_FAILED"));
    }
  }

  logger.info("Avatar URL saved to database");
  return (await avatarUrlForProfile(avatarUrl)) ?? avatarUrl;
}

// ========== Get User With Trainings ==========

/**
 * Получает пользователя с тренировками и курсами для API/веб.
 */
export async function getUserWithTrainings(userId: string): Promise<UserWithTrainings | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      phone: true,
      email: true,
      accounts: {
        where: { provider: "vk" },
        select: { id: true },
      },
      userTrainings: {
        orderBy: { dayOnCourse: { order: "asc" } },
        select: {
          status: true,
          dayOnCourse: {
            select: {
              order: true,
              day: {
                select: { id: true, title: true, type: true },
              },
              course: {
                select: { id: true, name: true },
              },
            },
          },
        },
      },
      userCourses: {
        select: {
          courseId: true,
          startedAt: true,
          completedAt: true,
          course: {
            select: {
              id: true,
              name: true,
              dayLinks: { select: { id: true } },
            },
          },
        },
      },
    },
  });

  if (!user) return null;

  const courses =
    user.userCourses?.map((uc) => {
      const trainingsForCourse =
        user.userTrainings?.filter((ut) => ut.dayOnCourse.course.id === uc.courseId) || [];
      const completedDays = trainingsForCourse
        .filter((t) => t.status === TrainingStatus.COMPLETED)
        .map((t) => t.dayOnCourse.order)
        .sort((a: number, b: number) => a - b);

      return {
        courseId: uc.courseId,
        courseName: uc.course.name,
        startedAt: uc.startedAt,
        completedAt: uc.completedAt,
        completedDays: uc.completedAt
          ? Array.from({ length: uc.course.dayLinks?.length || 0 }, (_, i) => i + 1)
          : completedDays,
        totalDays: uc.course.dayLinks?.length || 0,
      };
    }) || [];

  return {
    id: user.id,
    username: user.username,
    phone: user.phone,
    email: user.email,
    hasVkLinked: (user.accounts?.length ?? 0) > 0,
    courses,
  };
}

/** Профиль пользователя для API */
export interface UserProfileForApi {
  id: string;
  username: string;
  phone: string | null;
  email: string | null;
  role: string;
  /** true, если у пользователя установлен прикладной пароль (passwordSetAt !== null) */
  hasAppPassword: boolean;
  hasVkLinked: boolean;
  onboardingTourCompletedAt: string | null;
  profile: {
    fullName: string | null;
    city: string | null;
    about: string | null;
    telegram: string | null;
    instagram: string | null;
    website: string | null;
    birthDate: string | null;
    avatarUrl: string | null;
  };
}

/**
 * Получает профиль пользователя для API (GET /profile).
 */
export async function getUserProfileForApi(userId: string): Promise<UserProfileForApi | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      phone: true,
      email: true,
      role: true,
      passwordSetAt: true,
      onboardingTourCompletedAt: true,
      accounts: {
        where: { provider: "vk" },
        select: { id: true },
      },
      profile: {
        select: {
          fullName: true,
          city: true,
          about: true,
          telegram: true,
          instagram: true,
          website: true,
          birthDate: true,
          avatarUrl: true,
        },
      },
    },
  });
  if (!user) return null;
  const hasVkLinked = (user.accounts?.length ?? 0) > 0;
  const { passwordSetAt, onboardingTourCompletedAt, accounts: _accounts, ...userRest } = user;
  const p = user.profile;
  return {
    ...userRest,
    hasAppPassword: passwordSetAt !== null,
    hasVkLinked,
    onboardingTourCompletedAt: onboardingTourCompletedAt?.toISOString() ?? null,
    profile: {
      fullName: p?.fullName ?? null,
      city: p?.city ?? null,
      about: p?.about ?? null,
      telegram: p?.telegram ?? null,
      instagram: p?.instagram ?? null,
      website: p?.website ?? null,
      birthDate: p?.birthDate ? p.birthDate.toISOString().split("T")[0] : null,
      avatarUrl: await avatarUrlForProfile(p?.avatarUrl ?? null),
    },
  };
}

export interface OnboardingTourStatusDto {
  hasSeenV1: boolean;
  completedAt: string | null;
}

export async function getOnboardingTourStatus(userId: string): Promise<OnboardingTourStatusDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingTourCompletedAt: true },
  });
  const completedAt = user?.onboardingTourCompletedAt ?? null;
  return {
    hasSeenV1: completedAt !== null,
    completedAt: completedAt?.toISOString() ?? null,
  };
}

export async function markOnboardingTourSeen(userId: string): Promise<OnboardingTourStatusDto> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      onboardingTourCompletedAt: new Date(),
    },
    select: { onboardingTourCompletedAt: true },
  });

  return {
    hasSeenV1: true,
    completedAt: updated.onboardingTourCompletedAt?.toISOString() ?? null,
  };
}
