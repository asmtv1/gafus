import { prisma } from "@gafus/prisma";
import { connection } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import { createImmediatePushNotification } from "@gafus/core/services/notifications";
import { Worker } from "bullmq";
import type { Job } from "bullmq";

const logger = createWorkerLogger("pet-prevention-reminder");

/** Названия типов профилактики для push-уведомлений. */
const TYPE_LABEL: Record<string, string> = {
  VACCINATION: "Прививка",
  DEWORMING: "Глистогонка",
  TICKS_FLEAS: "Обработка от клещей и блох",
};

interface DueRow {
  id: string;
  ownerId: string;
  petId: string;
  petName: string;
  type: string;
  productName: string | null;
  notes: string | null;
  remindAt: Date;
  reminderTimes: unknown;
  sentTimesForRemindAt: unknown;
}

/**
 * Записи с наступившим remindAt, для которых есть неотправленные времена.
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
      ppe.notes,
      ppe."remindAt",
      ppe."reminderTimes",
      ppe."sentTimesForRemindAt"
    FROM "PetPreventionEntry" ppe
    INNER JOIN "Pet" p ON p.id = ppe."petId"
    WHERE ppe."reminderEnabled" = true
      AND ppe."remindAt" IS NOT NULL
      AND ppe."remindAt" <= (timezone('utc', now()))::date
  `;
}

const MAX_BODY_LENGTH = 200;

function buildPushBody(row: DueRow): string {
  const label = TYPE_LABEL[row.type] ?? "Профилактика";
  let body = `${label} — ${row.petName}`;
  if (row.productName?.trim()) {
    body += `: ${row.productName.trim()}`;
  }
  if (row.notes?.trim()) {
    const note = row.notes.trim();
    const remaining = MAX_BODY_LENGTH - body.length - 2;
    if (remaining > 10) {
      body += `\n${note.length > remaining ? note.slice(0, remaining - 1) + "…" : note}`;
    }
  }
  return body;
}

function parseReminderTimes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string");
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { /* fallback */ }
  }
  return ["09:00"];
}

function parseSentTimes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string");
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { /* fallback */ }
  }
  return [];
}

function getCurrentMoscowHHMM(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

async function checkAndSendReminders(): Promise<{ sent: number; errors: number }> {
  let sent = 0;
  let errors = 0;

  const due = await findDueEntries();
  const nowHHMM = getCurrentMoscowHHMM();

  for (const row of due) {
    try {
      const times = parseReminderTimes(row.reminderTimes);
      const alreadySent = parseSentTimes(row.sentTimesForRemindAt);
      const timesToSend = times.filter((t) => t <= nowHHMM && !alreadySent.includes(t));

      if (timesToSend.length === 0) continue;

      for (const t of timesToSend) {
        const result = await createImmediatePushNotification({
          userId: row.ownerId,
          title: "Процедуры",
          body: buildPushBody(row),
          url: `/profile/pets/${row.petId}/prevention`,
        });

        if (result.queued) {
          alreadySent.push(t);
          sent += 1;
        }
      }

      const allSent = times.every((t) => alreadySent.includes(t));
      await prisma.petPreventionEntry.update({
        where: { id: row.id },
        data: {
          sentTimesForRemindAt: alreadySent,
          ...(allSent ? { lastNotifiedForRemindAt: row.remindAt } : {}),
        },
      });
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
