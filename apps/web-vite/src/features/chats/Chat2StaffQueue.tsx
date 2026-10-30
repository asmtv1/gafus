import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { chat2Api } from "./chat2Api";
import css from "./Chat2Messenger.module.css";

/** Global GAFUS staff moderation, including personal and cynologist chats.
 * No general API for ordinary users; the server verifies the current DB role.
 */
export function Chat2StaffQueue({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const reports = useQuery({
    queryKey: ["chat2", "staff-reports"],
    queryFn: chat2Api.staffReports,
    enabled,
    retry: false,
    refetchInterval: enabled ? 30000 : false,
  });
  async function resolve(id: string, status: "RESOLVED" | "REJECTED") {
    if (
      busy ||
      !window.confirm(status === "RESOLVED" ? "Пометить жалобу обработанной?" : "Отклонить жалобу?")
    )
      return;
    setBusy(id);
    setError("");
    setNotice("");
    try {
      await chat2Api.resolveStaffReport(id, status);
      await reports.refetch();
      setNotice("Решение сохранено");
    } catch {
      setError("Не удалось обработать жалобу");
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className={css.staffQueue} aria-label="Очередь жалоб GAFUS">
      <h2>Модерация GAFUS</h2>
      <p>
        Жалобы из личных, общих и групповых чатов. Только для сотрудников с действующими правами.
      </p>
      {reports.isLoading && <p role="status">Получаем жалобы…</p>}
      {reports.isError && (
        <div role="alert">
          Очередь временно недоступна.
          <button type="button" onClick={() => void reports.refetch()}>
            Повторить
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {reports.isSuccess && reports.data.length === 0 && <p>Новых жалоб нет.</p>}
      {(reports.data ?? []).map((item) => (
        <article key={item.id} className={css.reportQueueItem}>
          <strong>
            {item.conversation.name ||
              ({ DIRECT: "Личный чат", CYNOLOGIST: "Чат с кинологом" } as Record<string, string>)[
                item.conversation.kind
              ] ||
              "Сообщество"}
          </strong>
          <span>
            {item.reason === "SPAM" ? "Спам" : item.reason === "ABUSE" ? "Оскорбления" : "Другое"}
          </span>
          <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("ru-RU")}</time>
          {item.comment && <p>{item.comment}</p>}
          <blockquote>
            {item.message.deletedAt ? "Сообщение удалено" : item.message.text.slice(0, 1000)}
          </blockquote>
          <div className={css.reportQueueActions}>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void resolve(item.id, "RESOLVED")}
            >
              Обработано
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void resolve(item.id, "REJECTED")}
            >
              Отклонить
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
