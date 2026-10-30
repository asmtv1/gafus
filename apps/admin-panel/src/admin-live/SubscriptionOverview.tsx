import { useMemo, useState } from "react";
import { DataPanel } from "./DataPanel";

type SubscriptionMetrics = {
  totalSubscriptions: number;
  activeNow: number;
  notRenewed: number;
  cancelAtPeriodEnd: number;
  pastDue: number;
  lifetime: number;
  totalSucceededPayments: number;
  totalRevenueRub: number;
  todayCheckoutStarted: number;
  todayCheckoutPaid: number;
  todayCheckoutNotPaid: number;
};
type Subscriber = {
  id: string;
  username: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
};
type Subscription = {
  id: string;
  user: Subscriber;
  planCode: string;
  planTitle: string | null;
  provider: string;
  status: string;
  isActiveNow: boolean;
  isLifetime: boolean;
  boughtAt: string | null;
  activeUntil: string | null;
  cancelAtPeriodEnd: boolean;
  totalPaidRub: number;
  paymentsCount: number;
  manualReason: string | null;
  attention: string | null;
  lastPaymentAt: string | null;
};
type Checkout = {
  id: string;
  user: Subscriber;
  status: string;
  attemptedAt: string;
  amountRub: number;
  promoCodeSnapshot: string | null;
};
type Overview = { metrics: SubscriptionMetrics; rows: Subscription[]; todayNotPaid: Checkout[] };
const labels: [keyof SubscriptionMetrics, string][] = [
  ["totalSubscriptions", "Всего подписок"],
  ["activeNow", "Активно сейчас"],
  ["notRenewed", "Не продлено"],
  ["cancelAtPeriodEnd", "Автоотмена"],
  ["pastDue", "Просроченные"],
  ["lifetime", "Бессрочные"],
  ["totalSucceededPayments", "Успешных оплат"],
  ["totalRevenueRub", "Получено, ₽"],
  ["todayCheckoutStarted", "Начали покупку сегодня"],
  ["todayCheckoutPaid", "Оплатили сегодня"],
  ["todayCheckoutNotPaid", "Не оплатили сегодня"],
];
function isOverview(value: unknown): value is Overview {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  if (
    !Array.isArray(source.rows) ||
    !Array.isArray(source.todayNotPaid) ||
    typeof source.metrics !== "object" ||
    source.metrics === null
  )
    return false;
  const metrics = source.metrics as Record<string, unknown>;
  return labels.every(([key]) => typeof metrics[key] === "number");
}
const fmt = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const when = (value: string | null) => (value ? new Date(value).toLocaleDateString("ru-RU") : "—");

export function SubscriptionOverview({ source }: { source: unknown }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [showCheckout, setShowCheckout] = useState(false);
  const overview = isOverview(source) ? source : null;
  const rows = useMemo(
    () =>
      (overview?.rows ?? []).filter((row) => {
        if (status === "ACTIVE" && !row.isActiveNow) return false;
        if (status === "INACTIVE" && row.isActiveNow) return false;
        if (status === "PAST_DUE" && row.status !== "PAST_DUE") return false;
        const text =
          `${row.user.username} ${row.user.fullName ?? ""} ${row.user.email ?? ""} ` +
          `${row.planCode} ${row.status} ${row.id}`;
        return text.toLocaleLowerCase("ru-RU").includes(search.toLocaleLowerCase("ru-RU"));
      }),
    [overview, search, status],
  );
  if (!overview) return <DataPanel data={source} title="Текущее состояние подписок" />;
  const totalPages = Math.max(1, Math.ceil(rows.length / 25));
  const current = Math.min(page, totalPages);
  const visible = rows.slice((current - 1) * 25, current * 25);
  return (
    <div className="subscription-overview">
      <h3>Сводка подписок</h3>
      <div className="metric-grid">
        {labels.map(([key, title]) => (
          <article key={key} className="metric">
            <span>{title}</span>
            <strong>{fmt(overview.metrics[key])}</strong>
          </article>
        ))}
      </div>
      <section className="nested-section">
        <h3>Покупки, не завершённые сегодня</h3>
        <button className="secondary" onClick={() => setShowCheckout(!showCheckout)}>
          {showCheckout ? "Скрыть" : "Показать"} ({overview.todayNotPaid.length})
        </button>
        {showCheckout && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Кто</th>
                  <th>Дата</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Промокод</th>
                </tr>
              </thead>
              <tbody>
                {overview.todayNotPaid.map((attempt) => (
                  <tr key={attempt.id}>
                    <td>{attempt.user.fullName || attempt.user.username}</td>
                    <td>{when(attempt.attemptedAt)}</td>
                    <td>{fmt(attempt.amountRub)} ₽</td>
                    <td>{attempt.status}</td>
                    <td>{attempt.promoCodeSnapshot || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="nested-section">
        <h3>Все подписки · {rows.length}</h3>
        <div className="data-head">
          <label>
            Поиск в подписках
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Пользователь, email, тариф, ID"
            />
          </label>
          <label>
            Фильтр
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">Все</option>
              <option value="ACTIVE">Активные</option>
              <option value="INACTIVE">Неактивные</option>
              <option value="PAST_DUE">Просроченные</option>
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>План</th>
                <th>Провайдер</th>
                <th>Статус</th>
                <th>Активна до</th>
                <th>Оплачено</th>
                <th>Внимание</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.user.fullName || row.user.username}
                    <small>
                      @{row.user.username} · {row.user.email || "—"}
                    </small>
                  </td>
                  <td>{row.planTitle || row.planCode}</td>
                  <td>{row.provider}</td>
                  <td>
                    {row.isActiveNow ? "Активна" : row.status}
                    {row.isLifetime && <small>Бессрочная</small>}
                    {row.cancelAtPeriodEnd && <small>Отмена в конце периода</small>}
                  </td>
                  <td>{row.isLifetime ? "Без срока" : when(row.activeUntil)}</td>
                  <td>
                    {fmt(row.totalPaidRub)} ₽<small>{row.paymentsCount} оплат</small>
                  </td>
                  <td>
                    {row.attention || "—"}
                    {row.manualReason && <small>{row.manualReason}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="empty">Подписки не найдены</p>}
        <div className="pagination">
          <button
            className="secondary"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
          >
            Назад
          </button>
          <span>
            Страница {current} из {totalPages}
          </span>
          <button
            className="secondary"
            disabled={current >= totalPages}
            onClick={() => setPage(current + 1)}
          >
            Дальше
          </button>
        </div>
      </section>
    </div>
  );
}
