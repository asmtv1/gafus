import { useEffect, useState } from "react";
import { requestAdmin, type AuthActor } from "./api";

/** Next sidebar shows a privacy-safe count of mail incidents for ADMIN only. */
export function MailAlertBadge({ actor }: { actor: AuthActor }) {
  const [alerts, setAlerts] = useState<number | null>(null);
  useEffect(() => {
    if (actor.role !== "ADMIN") {
      setAlerts(null);
      return;
    }
    const controller = new AbortController();
    requestAdmin<unknown>("/api/v1/admin/mail/alerts", { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data && typeof data === "object" && "count" in data &&
          Number.isSafeInteger(data.count) && (data.count as number) >= 0) {
          setAlerts(data.count as number);
        } else {
          setAlerts(null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setAlerts(null);
      });
    return () => controller.abort();
  }, [actor.id, actor.role]);
  if (alerts === null || alerts === 0) return null;
  return (
    <span className="mail-alert-count" aria-label={`Почтовых проблем: ${alerts}`}>
      {alerts > 99 ? "99+" : alerts}
    </span>
  );
}
