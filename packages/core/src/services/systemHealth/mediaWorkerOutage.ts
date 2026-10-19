import { prisma } from "@gafus/prisma";
import { connection } from "@gafus/queues";
import { sendTransactionalMail } from "@gafus/mailer";
import { MEDIA_MONITOR_HEARTBEAT_KEY } from "./mediaMonitoring";

const ALERT_KEY = "gafus:media:alert:v1:worker-unavailable";
const MAX_HEARTBEAT_AGE_MS = 12 * 60_000;

/** Independent API-side watcher: unlike gafus-worker this can notify admins
 * when the entire Worker process has stopped. No user files/IDs are accessed.
 * Dedup is shared between API replicas. Disabled with the media Jobs switch.
 */
export async function notifyStoppedMediaWorker(
  now = new Date(), enabled = process.env.CLOUDRU_MEDIA_JOBS_ENABLED === "true",
) {
  if (!enabled) return { disabled: true, alerted: false };
  // Redis errors must NOT be reported as a stopped worker.
  const last = await connection.get(MEDIA_MONITOR_HEARTBEAT_KEY);
  const lastMs = last ? Number(last) : NaN;
  if (Number.isFinite(lastMs) && now.getTime() - lastMs <= MAX_HEARTBEAT_AGE_MS) {
    await connection.del(ALERT_KEY);
    return { stopped: false, alerted: false };
  }
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" }, select: { email: true }, take: 20,
  });
  const addresses = [...new Set(admins.map(user => user.email)
    .filter((email): email is string => Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))))];
  if (!addresses.length) return { stopped: true, alerted: false };
  const reserved = await connection.set(ALERT_KEY, "1", "EX", 3600, "NX");
  if (reserved !== "OK") return { stopped: true, alerted: false };
  try {
    await sendTransactionalMail({
      // Worker is DOWN, so its transactional outbox sender cannot run.
      // API must send directly rather than enqueue an undeliverable notice.
      to: addresses, category: "notice", deliveryMode: "immediate",
      deliveryKey: "media-worker-unavailable-" + Math.floor(now.getTime() / 3_600_000),
      maxQueueAgeMs: 6 * 3600_000,
      subject: "GAFUS: остановился монитор обработки фото и видео",
      text: [
        "Монитор Cloud.ru media processing не сообщал об активности более 12 минут.",
        "Проверьте доступность gafus-worker и обработку Gallery, Feed Photo, Feed Video, Questions.",
        "Проверьте состояние очередей: /main-panel/media",
        "Предупреждение повторяется не чаще одного раза в час, пока проблема сохраняется.",
      ].join("\n"),
    });
    return { stopped: true, alerted: true };
  } catch {
    await connection.del(ALERT_KEY).catch(() => {});
    return { stopped: true, alerted: false };
  }
}
