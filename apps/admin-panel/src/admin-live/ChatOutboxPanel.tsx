import { useCallback, useEffect, useState } from "react";
import { requestAdmin } from "./api";

type DeadLetter = {
  id: string;
  eventType: string;
  operationId: string | null;
  traceId: string | null;
  attempts: number;
  lastErrorCode: string | null;
  deadLetteredAt: string;
  createdAt: string;
};
const endpoint = "/api/v1/admin/media/chat-outbox/dead-letters";

/** Narrow recovery UI: no chat contents, user data, URLs or bulk resend action. */
export function ChatOutboxPanel() {
  const [items, setItems] = useState<DeadLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const next = await requestAdmin<DeadLetter[]>(endpoint, { signal });
    if (!Array.isArray(next)) throw Error("INVALID_DIAGNOSTICS");
    if (!signal?.aborted) { setItems(next); setError(""); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(() => {
      if (!controller.signal.aborted) setError("Не удалось загрузить состояние очереди");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  const retry = async (id: string) => {
    if (retrying || !/^[a-zA-Z0-9_-]{10,64}$/.test(id)) return;
    setRetrying(id);
    try {
      await requestAdmin<void>(endpoint + "/" + id + "/retry", { method: "POST" });
      await refresh();
    } catch {
      setError("Повтор не выполнен: состояние могло измениться, обновите список");
    } finally { setRetrying(null); }
  };
  return (
    <section className="content-card" aria-label="Надёжность фоновых операций">
      <h2>Фоновые операции Chat 2.0</h2>
      <p className="note">События с исчерпанными попытками. Повтор доступен только по одному событию и защищён проверкой состояния в БД.</p>
      <button type="button" onClick={() => void refresh().catch(() => setError("Не удалось обновить список"))}>Обновить</button>
      {error && <p role="alert" className="error">{error}</p>}
      {loading ? <p>Загружаем состояние очереди…</p> : items.length === 0 ? (
        <p className="success">Нет событий, требующих ручного восстановления.</p>
      ) : (
        <div className="nested-section">
          {items.map(item => (
            <div className="exception-row" key={item.id}>
              <span>
                <strong>{item.eventType}</strong> · операция {item.operationId ?? item.id} · попыток {item.attempts}
                <small> · код {item.lastErrorCode ?? "UNKNOWN"} · {new Date(item.deadLetteredAt).toLocaleString("ru-RU")}</small>
                {item.traceId && <small> · trace {item.traceId}</small>}
              </span>
              <button type="button" disabled={retrying !== null} onClick={() => void retry(item.id)}>
                {retrying === item.id ? "Повторяем…" : "Повторить"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
