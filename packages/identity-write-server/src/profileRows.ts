/**
 * Owner-scoped profile persistence. Core validates input, filters public DTOs,
 * owns avatar upload and post-commit CDN cleanup/compensation. This adapter
 * only reads/writes exact DB rows and does not expose credentials in public
 * projections. The avatar transaction takes its row lock after CDN upload.
 */
import { prisma } from "@gafus/prisma";
import { hasPaidChatDisplaySubscription } from "@gafus/entitlements-server/policy-reads";

/** Profile-read infrastructure binding; use the existing single canonical
 * paid-subscription predicate (active, not expired, succeeded positive payment).
 */
export function readPaidChatDisplayEntitlement(userId: string, now: Date): Promise<boolean> {
  return hasPaidChatDisplaySubscription(userId, now);
}

export type ProfileEditFields = Partial<
  Record<"fullName" | "city" | "about" | "telegram" | "instagram" | "website", string | null>
> & { birthDate?: Date | null };
export type ProfileEditCreateFields = ProfileEditFields & { user: { connect: { id: string } } };

export function readUserProfileRow(userId: string) {
  return prisma.userProfile.findUnique({
    where: { userId },
  });
}

export function upsertProfileFields(
  userId: string,
  updateData: ProfileEditFields,
  createData: ProfileEditCreateFields,
) {
  if (!userId || createData.user.connect.id !== userId) throw new Error("PROFILE_OWNER_MISMATCH");
  return prisma.userProfile.upsert({
    where: { userId },
    update: updateData,
    create: createData,
  });
}

export function readProfileActorExists(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
}

export function readUserIdByUsernameRow(username: string) {
  return prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
}

export function readPublicProfileRow(username: string) {
  return prisma.user.findFirst({
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
}

export function replaceProfileAvatarRow(userId: string, avatarUrl: string) {
  return prisma.$transaction(async (tx) => {
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
}

export function readUserWithTrainingsRow(userId: string) {
  return prisma.user.findUnique({
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
}

export function readUserProfileForApiRow(userId: string) {
  return prisma.user.findUnique({
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
}

export function readOnboardingTourStatusRow(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingTourCompletedAt: true },
  });
}

export function markOnboardingTourSeenRow(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      onboardingTourCompletedAt: new Date(),
    },
    select: { onboardingTourCompletedAt: true },
  });
}
