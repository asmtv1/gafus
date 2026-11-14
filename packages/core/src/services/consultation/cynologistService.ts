import type { GafusUserRole as AuthRole } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";
import { ConsultationForbiddenError } from "./errors";
import { canAdminManageListed } from "./permissions";
import type { ListedCynologistCardDto } from "./types";

const logger = createWebLogger("core-consultation-cynologist");

type TrainerProfile = {
  fullName: string | null;
  avatarUrl: string | null;
  about: string | null;
};

export interface CynologistCatalogPort {
  readListedCynologistRows(): Promise<{
    id: string;
    userId: string;
    slotDurationMin: number;
    user: { username: string; profile: TrainerProfile | null };
  }[]>;
  readAllTrainerCatalogRows(): Promise<{
    id: string;
    username: string;
    profile: TrainerProfile | null;
    consultationCynologist: { id: string; isListed: boolean } | null;
  }[]>;
  isCurrentConsultationTrainer(userId: string): Promise<boolean>;
  setListedCynologistsAtomic(
    adminId: string,
    trainerIds: readonly string[],
  ): Promise<"OK" | "ADMIN_REVOKED" | "INVALID_TRAINERS">;
  ensureCurrentTrainerCynologistRow(trainerId: string): Promise<string | null>;
}

export function createCynologistService(port: CynologistCatalogPort) {
  /**
   * Список кинологов, отображаемых на публичной странице консультаций.
   */
  async function listListedCynologists(): Promise<ListedCynologistCardDto[]> {
    const rows = await port.readListedCynologistRows();

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      username: r.user.username,
      displayName: r.user.profile?.fullName ?? null,
      avatarUrl: r.user.profile?.avatarUrl ?? null,
      about: r.user.profile?.about ?? null,
      slotDurationMin: r.slotDurationMin,
    }));
  }

  /**
   * Админ: какие тренеры показываются в каталоге консультаций.
   */
  async function adminSetListedCynologists(
    adminUserId: string,
    role: AuthRole,
    cynologistUserIds: string[],
  ): Promise<void> {
    if (!canAdminManageListed(role)) {
      throw new ConsultationForbiddenError();
    }

    const result = await port.setListedCynologistsAtomic(adminUserId, cynologistUserIds);
    if (result === "ADMIN_REVOKED") throw new ConsultationForbiddenError();
    if (result !== "OK")
      throw new ConsultationForbiddenError("Указаны не только тренеры или неверные ID");

    logger.success("adminSetListedCynologists", { adminUserId, count: cynologistUserIds.length });
  }

  /**
   * Все тренеры с флагом записи на консультации (для админки).
   */
  async function listAllTrainersForAdmin(): Promise<
    {
      userId: string;
      username: string;
      fullName: string | null;
      avatarUrl: string | null;
      about: string | null;
      isListed: boolean;
      cynologistId: string | null;
    }[]
  > {
    const trainers = await port.readAllTrainerCatalogRows();

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
   * Кто может править расписание: тренер — только себя; ADMIN — любого тренера (нужен `requestedTrainerUserId`).
   */
  async function resolveTargetTrainerUserIdForStaff(
    actor: { id: string; role: AuthRole },
    requestedTrainerUserId: string | undefined,
  ): Promise<string> {
    if (actor.role === "TRAINER") {
      if (requestedTrainerUserId && requestedTrainerUserId !== actor.id) {
        throw new ConsultationForbiddenError();
      }
      return actor.id;
    }
    if (actor.role === "ADMIN") {
      if (!requestedTrainerUserId?.trim()) {
        throw new ConsultationForbiddenError("Укажите тренера (параметр trainerUserId)");
      }
      if (!(await port.isCurrentConsultationTrainer(requestedTrainerUserId))) {
        throw new ConsultationForbiddenError("Указанный пользователь не тренер");
      }
      return requestedTrainerUserId;
    }
    throw new ConsultationForbiddenError();
  }

  /**
   * Убедиться, что у тренера есть строка ConsultationCynologist (создать с дефолтами).
   */
  async function ensureConsultationCynologistRow(trainerUserId: string): Promise<string> {
    const id = await port.ensureCurrentTrainerCynologistRow(trainerUserId);
    if (!id) throw new ConsultationForbiddenError("Пользователь не тренер");
    return id;
  }

  return {
    listListedCynologists,
    adminSetListedCynologists,
    listAllTrainersForAdmin,
    resolveTargetTrainerUserIdForStaff,
    ensureConsultationCynologistRow,
  };
}
