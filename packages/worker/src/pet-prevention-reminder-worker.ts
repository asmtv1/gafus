import { prisma } from "@gafus/prisma";
import { connection } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import { createImmediatePushNotification } from "@gafus/core/services/notifications";
import { Worker } from "bullmq";
import type { Job } from "bullmq";

const logger = createWorkerLogger("pet-prevention-reminder");

/** Тексты push по типу профилактики (рус.). */
const PUSH_BODY: Record<string, string> = {
  VACCINATION: "Пора сделать прививки",
  DEWORMING: "Пора провести глистогонку",
  TICKS_FLEAS: "Пора обработать от клещей и блох",
};

interface DueRow {
  id: string;
  ownerId: string;
  petId: string;
  petName: string;
  type: string;
  productName: string | null;
  remindAt: Date;
}

/**
 * Записи с наступившим remindAt, по которым ещё не отправляли для текущего цикла
 * (lastNotifiedForRemindAt отличается от remindAt или null).
 */
async function findDueEntries(): Promise<DueRow[]> {
  return prisma.$queryRaw<DueRow[]>`
    SELECT
      ppe.id,
      ppe."ownerId",
      ppe."petId",
      p.name AS "petName",
      ppe.type::text AS "type",
      ppe."productName",
      ppe."remindAt"
    FROM "PetPreventionEntry" ppe
    INNER JOIN "Pet" p ON p.id = ppe."petId"
    WHERE ppe."reminderEnabled" = true
      AND ppe."remindAt" IS NOT NULL
      AND ppe."remindAt" <= (timezone('utc', now()))::date
      AND (
        ppe."lastNotifiedForRemindAt" IS NULL
        OR ppe."lastNotifiedForRemindAt" IS DISTINCT FROM ppe."remindAt"
      )
  `;
}

function buildPushBody(row: DueRow): string {
  const base = PUSH_BODY[row.type] ?? "Пора обновить профилактику";
  let body = `${base} для ${row.petName}`;
  if (row.productName?.trim()) {
    body = `${body} (${row.productName.trim()})`;
  }
  return body;
}

async function checkAndSendReminders(): Promise<{ sent: number; errors: number }> {
  let sent = 0;
  let errors = 0;

  const due = await findDueEntries();

  for (const row of due) {
    try {
      const result = await createImmediatePushNotification({
        userId: row.ownerId,
        title: "Записи о процедурах",
        body: buildPushBody(row),
        url: `/profile/pets/${row.petId}/prevention`,
      });

      if (result.queued) {
        await prisma.petPreventionEntry.update({
          where: { id: row.id },
          data: { lastNotifiedForRemindAt: row.remindAt },
        });
        sent += 1;
      }
    } catch (error) {
      logger.error("Ошибка отправки push-напоминания", error as Error, {
        entryId: row.id,
        petId: row.petId,
        ownerId: row.ownerId,
        type: row.type,
      });
      errors += 1;
    }
  }

  return { sent, errors };
}

export function startPetPreventionReminderWorker() {
  const worker = new Worker(
    "pet-prevention-reminder",
    async (job: Job) => {
      if (job.name !== "check-reminders") return;

      logger.info("🐕 Запуск проверки напоминаний о профилактике");

      const { sent, errors } = await checkAndSendReminders();

      logger.success("✅ Проверка напоминаний завершена", { sent, errors });
    },
    {
      connection,
      concurrency: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  );

  worker.on("completed", (job) => {
    logger.info("Задача завершена", { jobId: job.id });
  });

  worker.on("failed", (job, err) => {
    logger.error("Задача провалилась", err as Error, { jobId: job?.id });
  });

  logger.success("🚀 Pet prevention reminder worker запущен");
  return worker;
}
