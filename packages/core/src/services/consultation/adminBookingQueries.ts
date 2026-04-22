import { prisma } from "@gafus/prisma";

import type { ConsultationBookingDto } from "./types";

/**
 * Список броней для админки (без зависимостей от очередей — безопасно для Next bundle).
 */
export async function listAdminBookings(): Promise<ConsultationBookingDto[]> {
  const rows = await prisma.consultationBooking.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      slot: true,
      cynologist: {
        include: {
          user: { include: { profile: { select: { fullName: true } } } },
        },
      },
    },
  });

  return rows.map((b) => ({
    id: b.id,
    status: b.status,
    slot: {
      id: b.slot.id,
      startAtUtc: b.slot.startAt.toISOString(),
      endAtUtc: b.slot.endAt.toISOString(),
      status: b.slot.status,
    },
    cynologistUserId: b.cynologist.userId,
    cynologistDisplayName: b.cynologist.user.profile?.fullName ?? null,
    clientProblem: b.clientProblem,
    cancelReason: b.cancelReason,
    joinUrl: b.telemostJoinUrl,
    watchUrl: b.telemostWatchUrl,
    confirmationDeadlineAt: b.confirmationDeadlineAt.toISOString(),
    createdAt: b.createdAt.toISOString(),
  }));
}
