import { connection } from "@gafus/queues";
import {
  getAdminMediaDashboard, getMediaAlertAdminEmails, MEDIA_MONITOR_HEARTBEAT_KEY,
} from "@gafus/core/services/systemHealth";
import { sendTransactionalMail } from "@gafus/mailer";
import { createWorkerLogger } from "@gafus/logger";

const logger = createWorkerLogger("media-processing-alerts");
const DEDUP_SECONDS = 3600;
const key = (kind: string) => "gafus:media:alert:v1:" + kind;

/** Email only on backed-up queues; Redis lock prevents duplicates across Workers. */
export async function monitorMediaProcessing() {
  if (process.env.CLOUDRU_MEDIA_JOBS_ENABLED !== "true")
    return { disabled: true, alerted: 0 };
  const snapshot = await getAdminMediaDashboard();
  // A page can detect a silent/stopped Worker independently of delivery errors.
  await connection.set(MEDIA_MONITOR_HEARTBEAT_KEY, String(Date.now()), "EX", 20 * 60);
  if (!snapshot.attention.length) {
    for (const kind of ["gallery", "feed-photo", "feed-video", "questions"])
      await connection.del(key(kind));
    return { alerted: 0 };
  }
  const addresses = await getMediaAlertAdminEmails();
  if (!addresses.length) {
    logger.warn("Media alert recipients unavailable");
    return { alerted: 0 };
  }
  let alerted = 0;
  for (const kind of snapshot.attention) {
    const row = snapshot.rows.find(item => item.kind === kind);
    if (!row) continue;
    const acquired = await connection.set(key(kind), "1", "EX", DEDUP_SECONDS, "NX");
    if (acquired !== "OK") continue;
    try {
      await sendTransactionalMail({
        to: addresses, category: "notice", deliveryMode: "deferred",
        deliveryKey: "media-health-" + kind + "-" +
          Math.floor(Date.now() / (DEDUP_SECONDS * 1000)),
        subject: "GAFUS: проверка обработки медиа — " + kind,
        text: [
          "Обработка медиа GAFUS требует внимания.",
          "Очередь: " + kind, "Ожидают: " + row.pending,
          "Зависшие: " + row.stuck,
          "Самое старое ожидание (мин): " + (row.oldestPendingMinutes ?? "нет данных"),
          "Cloud.ru 499 (24 ч): " + (row.errors?.["499"] ?? "нет телеметрии"),
          "Таймауты (24 ч): " + (row.errors?.timeout ?? "нет телеметрии"),
          "Админ-панель: /main-panel/media",
          "Повторное предупреждение не чаще одного раза в час.",
        ].join("\n"), maxQueueAgeMs: 6 * 3600_000,
      });
      alerted++;
      logger.warn("Media processing alert queued", { kind });
    } catch (error) {
      await connection.del(key(kind)).catch(() => {});
      logger.error("Media processing alert delivery failed", error as Error);
    }
  }
  for (const kind of ["gallery", "feed-photo", "feed-video", "questions"])
    if (!snapshot.attention.includes(kind as typeof snapshot.attention[number]))
      await connection.del(key(kind));
  return { alerted };
}
