/**
 * Profile Service - бизнес-логика работы с профилем пользователя
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import type { Prisma } from "@gafus/prisma";
import type { PublicProfile, UserWithTrainings } from "@gafus/types";
import { TrainingStatus } from "@gafus/types";

import { checkCourseAccessById } from "../course/courseService";
import {
  uploadFileToCDN,
  deleteFileFromCDN,
  getRelativePathFromCDNUrl,
  getUserAvatarPath,
} from "@gafus/cdn-upload";
import { randomUUID } from "crypto";

const logger = createWebLogger("profile-service");

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
  const normalizedFullName = data.fullName ?? "";
  const normalizedAbout = data.about ?? "";
  const normalizedTelegram = data.telegram ?? "";
  const normalizedInstagram = data.instagram ?? "";
  const normalizedWebsite = data.website ?? "";
  const normalizedBirthDate = data.birthDate ?? "";

  const updateData: Prisma.UserProfileUpdateInput = {
    fullName: normalizedFullName || null,
    about: normalizedAbout || null,
    telegram: normalizedTelegram || null,
    instagram: normalizedInstagram || null,
    website: normalizedWebsite || null,
  };

  const createData: Prisma.UserProfileCreateInput = {
    user: { connect: { id: userId } },
    fullName: normalizedFullName || null,
    about: normalizedAbout || null,
    telegram: normalizedTelegram || null,
    instagram: normalizedInstagram || null,
    website: normalizedWebsite || null,
  };

  if (normalizedBirthDate !== undefined) {
    if (normalizedBirthDate === "") {
      updateData.birthDate = null;
      createData.birthDate = null;
    } else {
      const parsed = new Date(normalizedBirthDate);
      if (isNaN(parsed.getTime())) throw new Error("Неверная дата");
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

export type GetPublicProfileOptions = {
  /** Если передан (JWT), в курсах будет hasAccess для платных/приватных */
  viewerUserId?: string;
};

/**
 * Получает публичный профиль пользователя по username
 */
export async function getPublicProfile(
  username: string,
  options?: GetPublicProfileOptions,
): Promise<PublicProfile | null> {
  if (!username) throw new Error("username is required");

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      role: true,
      profile: {
        select: {
          fullName: true,
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
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          breed: true,
          birthDate: true,
          heightCm: true,
          weightKg: true,
          photoUrl: true,
          notes: true,
          ownerId: true,
          awards: {
            orderBy: { date: "desc" },
            select: {
              id: true,
              title: true,
              event: true,
              date: true,
              rank: true,
            },
          },
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
          priceRub: true,
          avgRating: true,
          trainingLevel: true,
        },
      },
    },
  });

  if (!user) return null;

  let courses: PublicProfile["courses"] =
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
          priceRub: course.priceRub != null ? Number(course.priceRub) : null,
          avgRating: course.avgRating,
          trainingLevel: course.trainingLevel,
        }))
      : undefined;

  const viewerUserId = options?.viewerUserId;
  if (courses && courses.length > 0 && viewerUserId) {
    const isProfileOwner = viewerUserId === user.id;
    courses = await Promise.all(
      courses.map(async (course) => {
        if (isProfileOwner) {
          return { ...course, hasAccess: true };
        }
        const { hasAccess } = await checkCourseAccessById(course.id, viewerUserId);
        return { ...course, hasAccess };
      }),
    );
  }

  const { id: _ownerUserId, authoredCourses: _authored, ...userBase } = user;
  const publicProfile: PublicProfile = {
    ...userBase,
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
      heightCm: pet.heightCm,
      weightKg: pet.weightKg,
      photoUrl: pet.photoUrl,
      notes: pet.notes,
      ownerId: String(pet.ownerId),
      awards: pet.awards
        .filter((a): a is Required<typeof a> => a.date !== null)
        .map((a) => ({
          id: String(a.id),
          title: a.title,
          event: a.event || "",
          date: a.date || new Date(),
          rank: a.rank || "",
        })),
    })),
  };

  return publicProfile;
}

// ========== Update Avatar ==========

/**
 * Обновляет аватар пользователя
 */
export async function updateAvatar(userId: string, file: File): Promise<string> {
  // Определяем расширение и формируем путь
  const ext = file.name.split(".").pop();
  if (!ext) throw new Error("Не удалось определить расширение файла");

  const uuid = randomUUID();
  const relativePath = getUserAvatarPath(userId, uuid, ext);

  // Получаем старый avatarUrl для удаления
  const existingProfile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { avatarUrl: true },
  });

  // Загружаем новый файл в CDN
  const avatarUrl = await uploadFileToCDN(file, relativePath);

  // Удаляем старый файл из CDN (если есть)
  if (existingProfile?.avatarUrl) {
    const oldRelativePath = getRelativePathFromCDNUrl(existingProfile.avatarUrl);
    logger.info(
      `Найден старый аватар для удаления: ${existingProfile.avatarUrl} -> ${oldRelativePath}`,
    );
    try {
      await deleteFileFromCDN(oldRelativePath);
      logger.info(`Старый аватар удален из CDN: ${oldRelativePath}`);
    } catch (error) {
      logger.error("Не удалось удалить старый аватар", error as Error);
    }
  }

  // Сохраняем новый avatarUrl в базе
  await prisma.userProfile.upsert({
    where: { userId },
    update: { avatarUrl },
    create: {
      userId,
      avatarUrl,
    },
  });

  logger.info("Avatar URL saved to database", { avatarUrl });
  return avatarUrl;
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
        .toSorted((a, b) => a - b);

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
    hasVkLinked: (user.accounts?.length ?? 0) > 0,
    courses,
  };
}

/** Профиль пользователя для API */
export interface UserProfileForApi {
  id: string;
  username: string;
  phone: string;
  role: string;
  isConfirmed: boolean;
  /** true, если у пользователя установлен прикладной пароль (passwordSetAt !== null) */
  hasAppPassword: boolean;
  hasVkLinked: boolean;
  profile: {
    fullName: string | null;
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
export async function getUserProfileForApi(
  userId: string,
): Promise<UserProfileForApi | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      phone: true,
      role: true,
      isConfirmed: true,
      passwordSetAt: true,
      accounts: {
        where: { provider: "vk" },
        select: { id: true },
      },
      profile: {
        select: {
          fullName: true,
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
  const { passwordSetAt, accounts, ...userRest } = user;
  const p = user.profile;
  return {
    ...userRest,
    hasAppPassword: passwordSetAt !== null,
    hasVkLinked,
    profile: {
      fullName: p?.fullName ?? null,
      about: p?.about ?? null,
      telegram: p?.telegram ?? null,
      instagram: p?.instagram ?? null,
      website: p?.website ?? null,
      birthDate: p?.birthDate
        ? p.birthDate.toISOString().split("T")[0]
        : null,
      avatarUrl: p?.avatarUrl ?? null,
    },
  };
}
