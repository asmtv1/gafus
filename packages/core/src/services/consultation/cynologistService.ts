import type { AuthRole } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";
import { prisma, type UserRole } from "@gafus/prisma";

import { ConsultationForbiddenError } from "./errors";
import { canAdminManageListed } from "./permissions";
import type { ListedCynologistCardDto } from "./types";

/** Рантайм-значение enum без реэкспорта из `@gafus/prisma` (в Next-бандле оно могло быть undefined). */
const TRAINER_ROLE: UserRole = "TRAINER";

const logger = createWebLogger("core-consultation-cynologist");

/**
 * Список кинологов, отображаемых на публичной странице консультаций.
 */
export async function listListedCynologists(): Promise<ListedCynologistCardDto[]> {
  const rows = await prisma.consultationCynologist.findMany({
    where: { isListed: true },
    select: {
      id: true,
      userId: true,
      slotDurationMin: true,
      user: {
        select: {
          profile: { select: { fullName: true, avatarUrl: true, about: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    displayName: r.user.profile?.fullName ?? null,
    avatarUrl: r.user.profile?.avatarUrl ?? null,
    about: r.user.profile?.about ?? null,
    slotDurationMin: r.slotDurationMin,
  }));
}

/**
 * Админ: какие тренеры показываются в каталоге консультаций.
 */
export async function adminSetListedCynologists(
  adminUserId: string,
  role: AuthRole,
  cynologistUserIds: string[],
): Promise<void> {
  if (!canAdminManageListed(role)) {
    throw new ConsultationForbiddenError();
  }

  const trainers = await prisma.user.findMany({
    where: {
      id: { in: cynologistUserIds },
      role: TRAINER_ROLE,
    },
    select: { id: true },
  });

  if (trainers.length !== cynologistUserIds.length) {
    throw new ConsultationForbiddenError("Указаны не только тренеры или неверные ID");
  }

  await prisma.$transaction(async (tx) => {
    await tx.consultationCynologist.updateMany({
      data: { isListed: false },
    });

    for (const uid of cynologistUserIds) {
      await tx.consultationCynologist.upsert({
        where: { userId: uid },
        create: {
          userId: uid,
          isListed: true,
        },
        update: { isListed: true },
      });
    }
  });

  logger.success("adminSetListedCynologists", { adminUserId, count: cynologistUserIds.length });
}

/**
 * Все тренеры с флагом записи на консультации (для админки).
 */
export async function listAllTrainersForAdmin(): Promise<
  Array<{
    userId: string;
    username: string;
    fullName: string | null;
    avatarUrl: string | null;
    about: string | null;
    isListed: boolean;
    cynologistId: string | null;
  }>
> {
  const trainers = await prisma.user.findMany({
    where: { role: TRAINER_ROLE },
    select: {
      id: true,
      username: true,
      profile: { select: { fullName: true, avatarUrl: true, about: true } },
      consultationCynologist: {
        select: { id: true, isListed: true },
      },
    },
    orderBy: { username: "asc" },
  });

  return trainers.map((t) => ({
    userId: t.id,
    username: t.username,
    fullName: t.profile?.fullName ?? null,
    avatarUrl: t.profile?.avatarUrl ?? null,
    about: t.profile?.about ?? null,
    isListed: t.consultationCynologist?.isListed ?? false,
    cynologistId: t.consultationCynologist?.id ?? null,
  }));
}

/**
 * Убедиться, что у тренера есть строка ConsultationCynologist (создать с дефолтами).
 */
export async function ensureConsultationCynologistRow(trainerUserId: string): Promise<string> {
  const existing = await prisma.consultationCynologist.findUnique({
    where: { userId: trainerUserId },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  const user = await prisma.user.findUnique({
    where: { id: trainerUserId },
    select: { role: true },
  });
  if (!user || user.role !== TRAINER_ROLE) {
    throw new ConsultationForbiddenError("Пользователь не тренер");
  }

  const created = await prisma.consultationCynologist.create({
    data: { userId: trainerUserId },
    select: { id: true },
  });
  return created.id;
}
