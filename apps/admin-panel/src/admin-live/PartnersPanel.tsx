import { useEffect, useRef, useState } from "react";
import { AdminHttpError, requestAdmin } from "./api";

type PartnerSummary = {
  id: string;
  username: string;
  fullName: string | null;
  email: string | null;
  referralCode: string;
  referrals: number;
  availableRub: number;
  earnedRub: number;
  reservedRub: number;
  availableKopecks: number;
  isActive: boolean;
};
type PartnerDetail = Omit<PartnerSummary, "referrals"> & {
  referrals: { id: string; buyerId: string; createdAt: string }[];
  commissions: { id: string; amountKopecks: number; createdAt: string; status?: string }[];
  payouts: { id: string; requestedAt: string; amountKopecks: number; status: string }[];
};
const fmtRub = (n: number) => `${n.toLocaleString("ru-RU", { minimumFractionDigits: 2 })} ₽`;
export function formatPartnerDate(date: string): string {
  const parsed = new Date(date);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(parsed)
    : "—";
}
const safeId = (id: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(id);
function isList(source: unknown): source is PartnerSummary[] {
  return (
    Array.isArray(source) &&
    source.every((row) => row && typeof row.id === "string" && typeof row.availableRub === "number")
  );
}
export function PartnersPanel({
  source,
  onSaved,
  initialPartnerId,
  onNavigate,
}: {
  source: unknown;
  onSaved: () => void;
  initialPartnerId: string | null;
  onNavigate: (path: string) => void;
}) {
  const [detail, setDetail] = useState<PartnerDetail | null>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [needsReadback, setNeedsReadback] = useState(false);
  const writeLock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!initialPartnerId || !safeId(initialPartnerId)) return;
    const controller = new AbortController();
    requestAdmin<PartnerDetail>(`/api/v1/admin/partners/${initialPartnerId}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setDetail(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Не удалось загрузить партнёра");
      });
    return () => controller.abort();
  }, [initialPartnerId]);
  if (!isList(source)) return <p role="alert">Некорректный ответ партнёрского отчёта</p>;
  const partners = source.filter((item) =>
    `${item.username} ${item.fullName ?? ""} ${item.email ?? ""} ${item.referralCode}`
      .toLocaleLowerCase("ru-RU")
      .includes(query.toLocaleLowerCase("ru-RU")),
  );
  async function pay() {
    // A payment-ledger write cannot be retried after a lost response: a new
    // commission might appear between retries. Require fresh server readback.
    if (!detail || !safeId(detail.id) || pending || needsReadback ||
        writeLock.current || detail.availableKopecks <= 0) return;
    if (
      !window.confirm(`Отметить весь доступный баланс ${fmtRub(detail.availableRub)} выплаченным?`)
    )
      return;
    writeLock.current = true;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await requestAdmin(`/api/v1/admin/partners/${detail.id}/mark-paid`, { method: "POST" });
      // Keep the stale amount blocked until the parent's authorized GET
      // remounts this page. Never offer a second payment from old data.
      setNeedsReadback(true);
      setMessage("Выплата отмечена в учёте. Проверяем новый баланс.");
      onSaved(); // Route-scoped component remount reloads partner detail via its URL.
    } catch (cause) {
      const definiteRejection = cause instanceof AdminHttpError &&
        [400, 401, 403, 404, 409, 422, 429].includes(cause.status) &&
        !["INVALID_RESPONSE", "STATUS_MISMATCH"].includes(cause.code);
      if (!definiteRejection) setNeedsReadback(true);
      setError(definiteRejection && cause instanceof Error
        ? cause.message
        : "Результат выплаты неизвестен. Перечитайте баланс с сервера перед повторной операцией.");
    } finally {
      writeLock.current = false;
      setPending(false);
    }
  }
  async function verifyPayout() {
    if (!detail || !safeId(detail.id) || writeLock.current) return;
    writeLock.current = true;
    setPending(true);
    setError(null);
    try {
      const latest = await requestAdmin<PartnerDetail>(`/api/v1/admin/partners/${detail.id}`);
      if (!latest || latest.id !== detail.id || !Number.isSafeInteger(latest.availableKopecks))
        throw new Error("Некорректный ответ баланса партнёра");
      setDetail(latest);
      setNeedsReadback(false);
      setMessage("Баланс получен с сервера. Проверьте его перед новой выплатой.");
    } catch {
      setNeedsReadback(true);
      setError("Не удалось подтвердить баланс. Повторите чтение с сервера.");
    } finally {
      writeLock.current = false;
      setPending(false);
    }
  }
  return (
    <section className="content-card">
      <h2>Партнёрская программа</h2>
      <p className="note">Привлечённые пользователи, начисления и история выплат.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
      {detail ? (
        <>
          <div className="action-row">
            <button className="secondary" onClick={() => onNavigate("/main-panel/partners")}>
              К списку
            </button>
            <strong>{detail.fullName || detail.username}</strong>
            <span className="status-pill">{detail.referrals.length} рефералов</span>
          </div>
          <div className="metric-grid">
            {[
              ["Доступно", detail.availableRub],
              ["Начислено", detail.earnedRub],
              ["Зарезервировано", detail.reservedRub],
            ].map(([key, val]) => (
              <article className="metric" key={key}>
                <span>{key}</span>
                <strong>{fmtRub(Number(val))}</strong>
              </article>
            ))}
          </div>
          <p className="note">
            Код приглашения: {detail.referralCode} · {detail.email || "Email не указан"}
          </p>
          <button
            disabled={pending || needsReadback || detail.availableKopecks <= 0}
            onClick={() => void pay()}
          >
            {pending ? "Сохраняем…" : "Отметить весь баланс выплаченным"}
          </button>
          {needsReadback && (
            <button className="secondary" disabled={pending} onClick={() => void verifyPayout()}>
              Перечитать баланс перед выплатой
            </button>
          )}
          <section className="nested-section">
            <h3>История выплат</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Сумма</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.payouts.map((p) => (
                    <tr key={p.id}>
                      <td>{formatPartnerDate(p.requestedAt)}</td>
                      <td>{fmtRub(p.amountKopecks / 100)}</td>
                      <td>
                        {p.status === "PAID"
                          ? "Выплачено"
                          : p.status === "PENDING"
                            ? "Ожидает"
                            : "Отклонено"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="nested-section">
            <h3>Привлечённые пользователи</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ID пользователя</th>
                    <th>Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.referrals.map((item) => (
                    <tr key={item.id}>
                      <td>{item.buyerId}</td>
                      <td>{formatPartnerDate(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <>
          <label>
            Найти партнёра
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Логин, имя, email, код"
            />
          </label>
          {!partners.length && <p className="empty">Партнёров пока нет</p>}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Партнёр</th>
                  <th>Код</th>
                  <th>Рефералы</th>
                  <th>Доступно</th>
                  <th>Всего</th>
                  <th>Статус</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.fullName || item.username}</strong>
                      <small>{item.email || "Email не указан"}</small>
                    </td>
                    <td>{item.referralCode}</td>
                    <td>{item.referrals}</td>
                    <td>{fmtRub(item.availableRub)}</td>
                    <td>{fmtRub(item.earnedRub)}</td>
                    <td>
                      <span className={`status-pill${item.isActive ? " active" : ""}`}>
                        {item.isActive ? "Активен" : "Выключен"}
                      </span>
                    </td>
                    <td>
                      <a
                        href={`/main-panel/partners/${item.id}`}
                        className="button-link"
                        onClick={(e) => {
                          e.preventDefault();
                          onNavigate(`/main-panel/partners/${item.id}`);
                        }}
                      >
                        Открыть
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
