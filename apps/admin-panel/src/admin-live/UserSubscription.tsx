import { useEffect, useState, type FormEvent } from "react";
import { DataPanel } from "./DataPanel";
import { requestAdmin } from "./api";

const isUserId = (id: string) => /^[A-Za-z0-9_-]{1,128}$/.test(id);
type Action = "paid_until" | "lifetime" | "clear" | "cancel_yookassa_renewal";
export function UserSubscription({
  canChange,
  initialUserId,
  onNavigate,
}: {
  canChange: boolean;
  initialUserId?: string | null;
  onNavigate?: (path: string) => void;
}) {
  const [userId, setUserId] = useState(initialUserId ?? "");
  const [loaded, setLoaded] = useState<string | null>(initialUserId ?? null);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<Action>("paid_until");
  const [paidUntil, setPaidUntil] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (loaded === null) return;
    if (!isUserId(loaded)) {
      setError("Некорректный ID пользователя");
      return;
    }
    const abort = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    requestAdmin(`/api/v1/admin/users/${loaded}/app-subscription`, { signal: abort.signal })
      .then((value) => {
        if (!abort.signal.aborted) setData(value);
      })
      .catch((cause) => {
        if (!abort.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [loaded, reload]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving || !canChange || loaded === null || !isUserId(loaded)) return;
    setError(null);
    setNotice(null);
    const body: Record<string, unknown> = { action };
    if (action === "paid_until") {
      const expiry = new Date(paidUntil);
      if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) {
        setError("Укажите дату окончания подписки в будущем");
        return;
      }
      body.paidUntil = expiry.toISOString();
      if (reason.trim()) body.reason = reason.trim();
    } else if (action === "lifetime" && reason.trim()) body.reason = reason.trim();
    const description =
      action === "clear"
        ? "отозвать вручную выданную подписку"
        : action === "lifetime"
          ? "выдать бессрочную подписку"
          : action === "paid_until"
            ? "выдать подписку до выбранной даты"
            : "выключить автопродление YooKassa";
    if (!window.confirm(`Подтвердить действие: ${description} для ${loaded}?`)) return;
    setSaving(true);
    try {
      await requestAdmin(`/api/v1/admin/users/${loaded}/app-subscription`, {
        method: "POST",
        body,
      });
      setNotice("Сервер подтвердил операцию. Запрашиваем текущее состояние подписки.");
      setReload((x) => x + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка подписки");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="content-card">
      <h2>Подписка отдельного пользователя</h2>
      {initialUserId && (
        <a
          href="/users"
          className="button-link"
          onClick={(event) => {
            if (onNavigate) {
              event.preventDefault();
              onNavigate("/main-panel/users");
            }
          }}
        >
          К списку пользователей
        </a>
      )}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          setLoaded(userId);
        }}
      >
        <label>
          ID пользователя
          <input
            required
            maxLength={128}
            autoComplete="off"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
        </label>
        <button type="submit">Загрузить подписку</button>
      </form>
      {loading && <p role="status">Загружаем данные…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      {loaded && !loading && data != null && (
        <>
          <DataPanel data={data} title={`Подписка пользователя ${loaded}`} />
          {canChange && (
            <form className="operation subscription-form" onSubmit={submit}>
              <h3>Управление доступом</h3>
              <label>
                Действие
                <select value={action} onChange={(e) => setAction(e.target.value as Action)}>
                  <option value="paid_until">Выдать до даты</option>
                  <option value="lifetime">Бессрочная подписка</option>
                  <option value="clear">Отозвать ручную подписку</option>
                  <option value="cancel_yookassa_renewal">Отменить автопродление YooKassa</option>
                </select>
              </label>
              {action === "paid_until" && (
                <label>
                  Действует до
                  <input
                    type="datetime-local"
                    required
                    value={paidUntil}
                    onChange={(e) => setPaidUntil(e.target.value)}
                  />
                </label>
              )}
              {(action === "paid_until" || action === "lifetime") && (
                <label>
                  Причина
                  <textarea
                    maxLength={500}
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              )}
              <button type="submit" disabled={saving}>
                {saving ? "Применяем…" : "Применить к подписке"}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
