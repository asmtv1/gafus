import { useState, type FormEvent } from "react";
import { requestAdmin } from "./api";
import { profitPartnersFromReport, profitTodayFromReport } from "./profitPartners";

/** Keep the same idempotency key until HTTP acknowledgement; retries never double-book. */
export function ProfitExpenses({ source, onSaved }: { source: unknown; onSaved: () => void }) {
  const partners = profitPartnersFromReport(source);
  const today = profitTodayFromReport(source);
  const [partnerId, setPartnerId] = useState("");
  const [paidDay, setPaidDay] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [comment, setComment] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [expenseId, setExpenseId] = useState("");
  const [version, setVersion] = useState("1");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setDone(null);
    if (
      !partners?.some((partner) => partner.id === partnerId) ||
      !today || paidDay < "2026-09-01" || paidDay > today ||
      !/^\d{4}-\d{2}-\d{2}$/.test(paidDay) ||
      !Number.isInteger(Number(quantity)) ||
      Number(quantity) < 1 ||
      Number(quantity) > 10000
    ) {
      setError("Некорректные параметры расхода");
      return;
    }
    if (!window.confirm("Записать расход по обработке видео?")) return;
    setPending(true);
    try {
      await requestAdmin("/api/v1/admin/profit/video-expenses", {
        method: "POST",
        body: {
          requestKey: key,
          input: {
            partnerId,
            paidDay,
            quantity: Number(quantity),
            comment,
          },
        },
      });
      setKey(crypto.randomUUID());
      setDone("Расход зарегистрирован. Данные отчёта перечитываются.");
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось подтвердить расход");
    } finally {
      setPending(false);
    }
  }
  async function cancel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const n = Number(version);
    if (!validId(expenseId) || !Number.isInteger(n) || n < 1) {
      setError("Некорректный ID или версия");
      return;
    }
    if (!window.confirm(`Отменить запись ${expenseId} версии ${n}?`)) return;
    setPending(true);
    setError(null);
    setDone(null);
    try {
      await requestAdmin("/api/v1/admin/profit/video-expenses/cancel", {
        method: "POST",
        body: { id: expenseId, version: n },
      });
      setDone("Отмена зарегистрирована. Данные отчёта перечитываются.");
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось отменить");
    } finally {
      setPending(false);
    }
  }
  return (
    <details className="action-panel">
      <summary>Расходы на обработку видео</summary>
      <div className="operation-grid">
        <form className="operation" onSubmit={save}>
          <h3>Добавить расход</h3>
          <label>
            Креатор
            <select
              required
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              disabled={pending || !partners?.length}
            >
              <option value="">Выберите креатора</option>
              {partners?.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}{partner.active ? "" : " (неактивен)"}
                </option>
              ))}
            </select>
          </label>
          {!partners && <p role="alert" className="error">Не удалось загрузить список креаторов из финансового отчёта</p>}
          <label>
            Дата выплаты
            <input
              type="date"
              required
              min="2026-09-01"
              max={today ?? undefined}
              value={paidDay}
              onChange={(e) => setPaidDay(e.target.value)}
            />
          </label>
          <label>
            Количество обработок
            <input
              type="number"
              min="1"
              max="10000"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label>
            Комментарий
            <textarea
              maxLength={512}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          <p className="note">
            Ключ операции сохраняется при сетевой ошибке до подтверждения ответа.
          </p>
          <button disabled={pending || !partners?.length || !today} type="submit">
            {pending ? "Отправляем…" : "Записать расход"}
          </button>
        </form>
        <form className="operation" onSubmit={cancel}>
          <h3>Отменить запись</h3>
          <label>
            ID записи
            <input
              required
              maxLength={128}
              value={expenseId}
              onChange={(e) => setExpenseId(e.target.value)}
            />
          </label>
          <label>
            Текущая версия
            <input
              required
              type="number"
              min="1"
              step="1"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </label>
          <p className="note">
            При несовпадении версии сервер вернёт конфликт 409, запись останется нетронутой.
          </p>
          <button disabled={pending} type="submit">
            {pending ? "Отправляем…" : "Отменить расход"}
          </button>
        </form>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="success">
          {done}
        </p>
      )}
    </details>
  );
}
