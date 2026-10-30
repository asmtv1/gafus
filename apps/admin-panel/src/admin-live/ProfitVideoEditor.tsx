import { useState, type FormEvent } from "react";
import { requestAdmin } from "./api";
import type { ProfitPartner } from "./profitPartners";

export type VideoEdit = {
  id: string;
  version: number;
  partnerId: string;
  partnerName: string;
  paidDay: string;
  quantity: number;
  comment: string | null;
  canceled: boolean;
};
export function ProfitVideoEditor({
  row,
  partners,
  today,
  onSaved,
  onClose,
}: {
  row: VideoEdit;
  partners: ProfitPartner[];
  today: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [partnerId, setPartnerId] = useState(row.partnerId);
  const [day, setDay] = useState(row.paidDay);
  const [quantity, setQuantity] = useState(String(row.quantity));
  const [comment, setComment] = useState(row.comment || "");
  const [requestKey] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function edit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || row.canceled) return;
    const n = Number(quantity);
    if (!Number.isInteger(n) || n < 1 || n > 10000 ||
        day < "2026-09-01" || day > today) {
      setError("Количество должно быть целым от 1 до 10000");
      return;
    }
    if (!window.confirm(`Изменить расход ${row.id} версии ${row.version}?`)) return;
    setPending(true);
    setError(null);
    try {
      await requestAdmin("/api/v1/admin/profit/video-expenses", {
        method: "POST",
        body: {
          requestKey,
          id: row.id,
          version: row.version,
          input: { partnerId, paidDay: day, quantity: n, comment },
        },
      });
      onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Изменение не сохранено");
    } finally {
      setPending(false);
    }
  }
  async function cancel() {
    if (pending || row.canceled) return;
    if (!window.confirm(`Отменить расход ${row.id} версии ${row.version}?`)) return;
    setPending(true);
    setError(null);
    try {
      await requestAdmin("/api/v1/admin/profit/video-expenses/cancel", {
        method: "POST",
        body: { id: row.id, version: row.version },
      });
      onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Отмена не сохранена");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="content-card user-editor" aria-label="Редактирование видео-расхода">
      <h3>Расход {row.id}</h3>
      <p className="note">
        Партнёр: {row.partnerName}. Ревизия {row.version}. Ключ операции сохраняется до
        подтверждения сервера.
      </p>
      <form className="operation subscription-form" onSubmit={edit}>
        <label>
          Креатор
          <select
            required
            value={partnerId}
            disabled={pending || row.canceled}
            onChange={(e) => setPartnerId(e.target.value)}
          >
            {!partners.some((partner) => partner.id === row.partnerId) && (
              <option value={row.partnerId}>{row.partnerName} (текущий)</option>
            )}
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}{partner.active ? "" : " (неактивен)"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Дата оплаты
          <input
            required
            type="date"
            min="2026-09-01"
            max={today}
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        <label>
          Количество
          <input
            required
            type="number"
            min="1"
            max="10000"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label>
          Комментарий
          <textarea
            maxLength={512}
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
        <div className="action-row">
          <button type="submit" disabled={pending || row.canceled}>
            {pending ? "Сохраняем…" : "Сохранить изменение"}
          </button>
          <button
            type="button"
            className="danger"
            disabled={pending || row.canceled}
            onClick={() => void cancel()}
          >
            Отменить расход
          </button>
          <button className="secondary" type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
