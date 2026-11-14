/**
 * Infrastructure-only mail projection for a consultation email outbox log.
 * Core determines the recipient, subject, mail layout and retry policy;
 * this read selects exactly one log and its booking, never enumerates users.
 */
import { prisma } from "@gafus/prisma";
export type { ConsultationEmailType, ConsultationPetGender } from "@gafus/prisma";

export function readConsultationBookingForMailLog(logId: string) {
  if (!logId) throw new Error("CONSULTATION_EMAIL_LOG_ID_REQUIRED");
  return prisma.consultationEmailLog.findUnique({
    where: { id: logId },
    include: {
      booking: {
        include: {
          client: { select: { email: true, username: true } },
          cynologist: {
            include: {
              user: {
                select: {
                  email: true,
                  username: true,
                  profile: { select: { fullName: true } },
                },
              },
            },
          },
          slot: true,
        },
      },
    },
  });
}
