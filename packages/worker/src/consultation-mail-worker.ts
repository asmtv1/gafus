import { ConsultationEmailStatus, ConsultationEmailType } from "@gafus/prisma";
import { prisma } from "@gafus/prisma";
import { connection } from "@gafus/queues";
import { sendTransactionalMail } from "@gafus/mailer";
import { createWorkerLogger } from "@gafus/logger";
import { DateTime } from "luxon";
import type { Job } from "bullmq";
import { Worker } from "bullmq";

const logger = createWorkerLogger("consultation-mail-worker");
const CONSULTATION_TIMEZONE = "Europe/Moscow";

interface MailJobData {
  emailLogId: string;
}

function subjectForType(t: ConsultationEmailType): string {
  switch (t) {
    case ConsultationEmailType.TRAINER_CONFIRM_REQUEST:
      return "Новая заявка на консультацию — требуется подтверждение";
    case ConsultationEmailType.CLIENT_BOOKING_RECEIVED:
      return "Заявка на консультацию получена";
    case ConsultationEmailType.CLIENT_BOOKING_CONFIRMED:
      return "Консультация подтверждена";
    case ConsultationEmailType.TRAINER_BOOKING_CONFIRMED:
      return "Вы подтвердили консультацию";
    case ConsultationEmailType.CLIENT_BOOKING_CANCELLED_BY_TRAINER:
      return "Консультация отменена тренером";
    case ConsultationEmailType.TRAINER_BOOKING_CANCELLED_BY_USER:
      return "Клиент отменил консультацию";
    case ConsultationEmailType.CLIENT_BOOKING_CANCELLED_BY_SLA:
      return "Консультация отменена (истекло время подтверждения)";
    default:
      return "Уведомление о консультации";
  }
}

async function buildBody(logId: string, type: ConsultationEmailType): Promise<{
  to: string;
  text: string;
  subject: string;
}> {
  const log = await prisma.consultationEmailLog.findUnique({
    where: { id: logId },
    include: {
      booking: {
        include: {
          client: { select: { email: true, username: true } },
          cynologist: {
            include: {
              user: { select: { email: true, username: true, profile: { select: { fullName: true } } } },
            },
          },
          slot: true,
        },
      },
    },
  });
  if (!log?.booking) {
    throw new Error("booking not found for email log");
  }

  const b = log.booking;
  const slotStartMsk = DateTime.fromJSDate(b.slot.startAt, { zone: "utc" })
    .setZone(CONSULTATION_TIMEZONE)
    .toFormat("dd.LL.yyyy HH:mm");
  const slotEndMsk = DateTime.fromJSDate(b.slot.endAt, { zone: "utc" })
    .setZone(CONSULTATION_TIMEZONE)
    .toFormat("HH:mm");
  const base =
    `Бронирование ${b.id}. Слот: ${slotStartMsk} — ${slotEndMsk} (МСК, UTC+3).\n` +
    "Все времена консультаций рассчитываются по МСК.";
  const problem = b.clientProblem?.trim()
    ? `\n\nКраткое изложение проблемы от клиента:\n${b.clientProblem.trim()}`
    : "";

  let to = b.client.email ?? "";
  if (
    type === ConsultationEmailType.TRAINER_CONFIRM_REQUEST ||
    type === ConsultationEmailType.TRAINER_BOOKING_CONFIRMED ||
    type === ConsultationEmailType.TRAINER_BOOKING_CANCELLED_BY_USER
  ) {
    to = b.cynologist.user.email ?? "";
  }
  if (type === ConsultationEmailType.CLIENT_BOOKING_RECEIVED || type === ConsultationEmailType.CLIENT_BOOKING_CONFIRMED || type === ConsultationEmailType.CLIENT_BOOKING_CANCELLED_BY_TRAINER || type === ConsultationEmailType.CLIENT_BOOKING_CANCELLED_BY_SLA) {
    to = b.client.email ?? "";
  }

  if (!to) {
    throw new Error("Получатель без email");
  }

  const subject = subjectForType(type);
  const text = `${subject}\n\n${base}${problem}\n\nСсылка на видео: ${b.telemostJoinUrl ?? "—"}`;

  return { to, text, subject };
}

export function startConsultationMailWorker(): void {
  const worker = new Worker<MailJobData>(
    "consultation-mail",
    async (job: Job<MailJobData>) => {
      const { emailLogId } = job.data;
      const log = await prisma.consultationEmailLog.findUnique({
        where: { id: emailLogId },
      });
      if (!log) {
        logger.warn("email log missing", { emailLogId });
        return;
      }
      if (log.status === ConsultationEmailStatus.SENT) {
        return;
      }

      try {
        const { to, text, subject } = await buildBody(emailLogId, log.type);
        await sendTransactionalMail({ to, subject, text });
        await prisma.consultationEmailLog.update({
          where: { id: emailLogId },
          data: {
            status: ConsultationEmailStatus.SENT,
            sentAt: new Date(),
            attempts: { increment: 1 },
          },
        });
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        await prisma.consultationEmailLog.update({
          where: { id: emailLogId },
          data: {
            status: ConsultationEmailStatus.FAILED,
            attempts: { increment: 1 },
            lastError: err.message.slice(0, 2000),
          },
        });
        throw err;
      }
    },
    {
      connection,
      concurrency: 2,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  );
  worker.on("error", (err) => {
    logger.error("consultation-mail worker error", err);
  });
  logger.success("consultation-mail worker запущен");
}
