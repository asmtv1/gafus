import { Loading } from "../../shared/ui";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { chat2Api } from "./chat2Api";
import css from "./Chat2Messenger.module.css";

type Decision = "RESOLVED" | "REJECTED";
/** Only a group owner/admin can fetch this queue; Hono rechecks every request. */
export function Chat2ReportQueue({ id, visible }: { id: string; visible: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [show, setShow] = useState(false);
  const reports = useQuery({
    queryKey: ["chat2", "reports", id],
    queryFn: () => chat2Api.reports(id),
    enabled: visible && show,
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function decide(reportId: string, decision: Decision) {
    if (busy) return;
    const action = decision === "RESOLVED" ? "Подтвердить обработку жалобы?" : "Отклонить жалобу?";
    if (!window.confirm(action)) return;
    setBusy(reportId);
    setError("");
    setNotice("");
    try {
      await chat2Api.resolveReport(id, reportId, decision);
      await reports.refetch();
      setNotice("Решение сохранено.");
    } catch {
      setError("Не удалось обработать жалобу. Повторите.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className={css.reportQueue} aria-label="Модерация жалоб">
      <h4>Жалобы участников</h4>
      <button type="button" onClick={() => setShow((x) => !x)}>
        {show ? "Скрыть жалобы" : "Посмотреть жалобы"}
      </button>
      {show && (
        <>
          {reports.isLoading && <Loading message="Загружаем жалобы…" />}
          {reports.isError && (
            <p role="alert">
              Не удалось загрузить жалобы.
              <button type="button" onClick={() => void reports.refetch()}>
                Повторить
              </button>
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          {reports.isSuccess && reports.data.length === 0 && <p>Новых жалоб нет.</p>}
          {(reports.data ?? []).map((report) => (
            <article className={css.reportQueueItem} key={report.id}>
              <strong>
                {report.reason === "SPAM"
                  ? "Спам"
                  : report.reason === "ABUSE"
                    ? "Оскорбления"
                    : "Другое"}
              </strong>
              <time dateTime={report.createdAt}>
                {new Date(report.createdAt).toLocaleString("ru-RU")}
              </time>
              {report.comment && <p>{report.comment}</p>}
              <blockquote>
                {report.message.deletedAt
                  ? "Сообщение удалено"
                  : report.message.text.slice(0, 1000)}
              </blockquote>
              <div className={css.reportQueueActions}>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void decide(report.id, "RESOLVED")}
                >
                  Обработано
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void decide(report.id, "REJECTED")}
                >
                  Отклонить
                </button>
              </div>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
