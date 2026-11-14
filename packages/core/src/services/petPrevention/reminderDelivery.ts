/** Business selection, messaging and durable state for pet-prevention reminders. */
/** SQL-free Core projection contract; the Worker supplies owner-fenced rows. */
export interface DuePetPreventionReminder {
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
import { createWebLogger } from "@gafus/logger";
/** Injected queued-only receipt; Core never imports the transport/provider.
 * A false queued result is NOT an acknowledgement and will retry later.
 */
export interface PetPreventionPushPort {
  enqueue(input: {
    userId: string;
    title: string;
    body: string;
    url: string;
  }): Promise<{ queued: boolean }>;
}
export interface PetPreventionReminderPorts extends PetPreventionPushPort {
  readDue(): Promise<DuePetPreventionReminder[]>;
  acknowledge(
    row: Pick<DuePetPreventionReminder, "id" | "ownerId" | "petId" | "remindAt">,
    sentTimes: string[],
    allSent: boolean,
  ): Promise<unknown>;
}
const logger = createWebLogger("pet-prevention-delivery");

/** Названия типов профилактики для push-уведомлений. */
const TYPE_LABEL: Record<string, string> = {
  VACCINATION: "Прививка",
  DEWORMING: "Глистогонка",
  TICKS_FLEAS: "Обработка от клещей и блох",
};

const MAX_BODY_LENGTH = 200;

function buildPushBody(row: DuePetPreventionReminder): string {
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
    try {
      return JSON.parse(raw);
    } catch {
      /* fallback */
    }
  }
  return ["09:00"];
}

function parseSentTimes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string");
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      /* fallback */
    }
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

export async function checkAndSendPetPreventionReminders(
  ports: PetPreventionReminderPorts,
): Promise<{ sent: number; errors: number }> {
  let sent = 0;
  let errors = 0;

  const due = await ports.readDue();
  const nowHHMM = getCurrentMoscowHHMM();

  for (const row of due) {
    try {
      const times = parseReminderTimes(row.reminderTimes);
      const alreadySent = parseSentTimes(row.sentTimesForRemindAt);
      const timesToSend = times.filter((t) => t <= nowHHMM && !alreadySent.includes(t));

      if (timesToSend.length === 0) continue;

      for (const t of timesToSend) {
        const result = await ports.enqueue({
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
      await ports.acknowledge(row, alreadySent, allSent);
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
