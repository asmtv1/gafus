import { useState, type FormEvent } from "react";
import { toAdminBrowserHref, toAdminInternalPath } from "./adminBrowserRoutes";
import { requestAdmin } from "./api";
import { SubscriptionOverview } from "./SubscriptionOverview";

export type PaymentRow = {
  id: string;
  user: { username: string; fullName: string | null; email: string | null; phone: string | null };
  provider: string;
  kind: string;
  status: string;
  planCode: string;
  promoCodeSnapshot: string | null;
  promoDiscountPercent: number | null;
  amountRub: number | null;
  currency: string | null;
  yookassaPaymentId: string | null;
  failureReason: string | null;
  succeededAt: string | null;
  createdAt: string;
};
export type PaymentPage = {
  items: PaymentRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
const statuses = ["SUCCEEDED", "PENDING", "CANCELED", "FAILED", "REFUNDED"] as const;
const valid = (page: unknown): page is PaymentPage =>
  page !== null &&
  typeof page === "object" &&
  "items" in page &&
  Array.isArray(page.items) &&
  "total" in page &&
  "pageSize" in page;
const money = (amount: number | null, currency: string | null) =>
  amount == null
    ? "—"
    : `${amount.toLocaleString("ru-RU", { minimumFractionDigits: 2 })} ${currency ?? "RUB"}`;
const stamp = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ru-RU") : "—");

export function PaymentHistory({ dashboard, source, initialSearch = "" }: {
  dashboard: unknown; source: unknown; initialSearch?: string;
}) {
  const paramsAtMount = new URLSearchParams(initialSearch);
  const [payments, setPayments] = useState(source);
  const [search, setSearch] = useState(paramsAtMount.get("paymentSearch") ?? "");
  const [status, setStatus] = useState(paramsAtMount.get("paymentStatus") ?? "");
  const [pageSize, setPageSize] = useState(Number(paramsAtMount.get("paymentPageSize")) || 25);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!valid(payments)) return <p role="alert">Неверный ответ истории оплат</p>;
  const page = payments;
  async function load(nextPage: number) {
    if (busy || nextPage < 1 || nextPage > 10000) return;
    setBusy(true);
    setError(null);
    const params = new URLSearchParams({
      tab: "payments",
      paymentPage: String(nextPage),
      paymentPageSize: String(pageSize),
    });
    if (search.trim()) params.set("paymentSearch", search.trim().slice(0, 128));
    if (status) params.set("paymentStatus", status);
    try {
      const result = await requestAdmin<{ paymentHistory: PaymentPage }>(
        `/api/v1/admin/app-subscriptions?${params}`,
      );
      if (!valid(result.paymentHistory)) throw new Error("Неверный формат истории оплат");
      setPayments(result.paymentHistory);
      // Next keeps payment filters and the actual loaded page in the URL.
      // Only change the address after the server confirmed this GET.
      if (toAdminInternalPath(window.location.pathname) === "/main-panel/app-subscriptions" &&
          new URLSearchParams(window.location.search).get("tab") === "payments") {
        window.history.replaceState(null, "", toAdminBrowserHref(`/main-panel/app-subscriptions?${params}`));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "История оплат недоступна");
    } finally {
      setBusy(false);
    }
  }
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(1);
  }
  return (
    <div className="panel-stack">
      <section className="content-card">
        <h2>Подписки</h2>
        <SubscriptionOverview source={dashboard} />
      </section>
      <section className="content-card">
        <h2>История оплат · {page.total}</h2>
        <form onSubmit={filter} className="inline-form">
          <label>
            Поиск
            <input
              value={search}
              maxLength={128}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пользователь, промокод, ID"
            />
          </label>
          <label>
            Статус
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Все</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            На странице
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {[10, 25, 50, 100].map((num) => (
                <option key={num} value={num}>
                  {num}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy} type="submit">
            Найти
          </button>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Покупатель</th>
                <th>Статус</th>
                <th>Тариф</th>
                <th>Сумма</th>
                <th>Промокод</th>
                <th>Платёж</th>
                <th>Ошибка</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((row) => (
                <tr key={row.id}>
                  <td>{stamp(row.succeededAt ?? row.createdAt)}</td>
                  <td>
                    {row.user.fullName ?? row.user.username}
                    <small>
                      @{row.user.username} · {row.user.email ?? "Без email"}
                    </small>
                  </td>
                  <td>{row.status}</td>
                  <td>{row.planCode}</td>
                  <td>{money(row.amountRub, row.currency)}</td>
                  <td>
                    {row.promoCodeSnapshot ?? "—"}
                    {row.promoDiscountPercent != null && ` · ${row.promoDiscountPercent}%`}
                  </td>
                  <td>
                    {row.provider}
                    <small>{row.yookassaPaymentId ?? row.id}</small>
                  </td>
                  <td>{row.failureReason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!page.items.length && <p className="empty">Платежей по фильтрам нет</p>}
        <div className="pagination">
          <button
            className="secondary"
            disabled={busy || page.page <= 1}
            onClick={() => void load(page.page - 1)}
          >
            Назад
          </button>
          <span>
            Страница {page.page} из {page.totalPages}
          </span>
          <button
            className="secondary"
            disabled={busy || page.page >= page.totalPages}
            onClick={() => void load(page.page + 1)}
          >
            Дальше
          </button>
        </div>
      </section>
    </div>
  );
}
