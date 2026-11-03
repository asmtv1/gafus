import { useState, type FormEvent } from "react";
import { toAdminBrowserHref, toAdminInternalPath } from "./adminBrowserRoutes";
import { requestAdmin } from "./api";
import { ProfitVideoEditor, type VideoEdit } from "./ProfitVideoEditor";
import { profitPartnersFromReport } from "./profitPartners";

type Payment = {
  id: string;
  date: string | null;
  amountKopecks: number | null;
  method: string | null;
  feeKopecks: number | null;
  npdKopecks: number | null;
  complete: boolean;
};
type Video = {
  id: string;
  partnerId: string;
  partnerName: string;
  paidDay: string;
  quantity: number;
  amountKopecks: number;
  comment: string | null;
  canceled: boolean;
  version: number;
};
type Profit = {
  from: string;
  to: string;
  today: string;
  totals: Record<string, number>;
  profitKopecks: number | null;
  incompletePayments: number;
  missingFees: number;
  undatedPayments: number;
  payments: Payment[];
  paymentCount: number;
  paymentPage: number;
  videos: Video[];
  videoCount: number;
  videoPage: number;
  pageSize: number;
  partners: { id: string; name: string; active: boolean }[];
};
const money = (n: number | null) =>
  n == null
    ? "Нет данных"
    : new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(n / 100);
const labels: Record<string, string> = {
  payments: "Оплаты подписок",
  refunds: "Возвраты",
  yookassa: "ЮKassa (включая НДС комиссии)",
  npd: "НПД, расчёт 4%",
  partners: "Начислено креаторам",
  videos: "Оплаты видео",
  server: "Сервер",
};
const methods: Record<string, string> = {
  bank_card: "Банковская карта",
  sbp: "СБП",
  sberbank: "SberPay",
  tinkoff_bank: "T-Pay",
  yoo_money: "ЮMoney",
  b2b_sberbank: "СберБанк Бизнес Онлайн",
};
function isProfit(data: unknown): data is Profit {
  return (
    data != null &&
    typeof data === "object" &&
    "totals" in data &&
    "payments" in data &&
    Array.isArray(data.payments) &&
    "videos" in data &&
    Array.isArray(data.videos)
  );
}
export function ProfitReport({ source }: { source: unknown }) {
  const [data, setData] = useState(source);
  const [from, setFrom] = useState(isProfit(source) ? source.from : "");
  const [to, setTo] = useState(isProfit(source) ? source.to : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingVideo, setEditingVideo] = useState<VideoEdit | null>(null);
  if (!isProfit(data)) return <p role="alert">Некорректный финансовый отчёт</p>;
  const report = data;
  const fetchReport = async (a: string, b: string, paymentPage = 1, videoPage = 1) => {
    if (busy) return;
    if (a > b || a < "2026-09-01" || b > report.today) {
      setError("Некорректные даты: отчёт начинается 1 сентября 2026 года");
      return;
    }
    setBusy(true);
    setError(null);
    const params = new URLSearchParams({
      from: a,
      to: b,
      paymentPage: String(paymentPage),
      videoPage: String(videoPage),
    });
    try {
      const next = await requestAdmin<Profit>(`/api/v1/admin/profit?${params}`);
      if (!isProfit(next)) throw Error("Некорректный финансовый отчёт");
      setData(next);
      if (toAdminInternalPath(window.location.pathname) === "/main-panel/profit") {
        window.history.replaceState(null, "", toAdminBrowserHref(`/main-panel/profit?${params}`));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить отчёт");
    } finally {
      setBusy(false);
    }
  };
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void fetchReport(from, to);
  }
  const page = (what: "payments" | "videos", nextPage: number) => {
    if (nextPage < 1) return;
    void fetchReport(
      report.from,
      report.to,
      what === "payments" ? nextPage : report.paymentPage,
      what === "videos" ? nextPage : report.videoPage,
    );
  };
  return (
    <section className="content-card profit-report">
      <h2>Прибыль GAFUS</h2>
      <form onSubmit={filter} className="inline-form">
        <label>
          От
          <input
            type="date"
            required
            value={from}
            min="2026-09-01"
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          До
          <input
            type="date"
            required
            value={to}
            min={from}
            max={report.today}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button disabled={busy}>Показать период</button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => {
            const first = report.today.slice(0, 7) + "-01";
            setFrom(first);
            setTo(report.today);
            void fetchReport(first, report.today);
          }}
        >
          Текущий месяц
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => {
            setFrom("2026-09-01");
            setTo(report.today);
            void fetchReport("2026-09-01", report.today);
          }}
        >
          С начала учёта
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <h3>
        Итог за {report.from} — {report.to}
      </h3>
      <p className={report.profitKopecks === null ? "note" : "success"}>
        {report.profitKopecks === null
          ? "Требуется финансовая сверка"
          : `Прибыль: ${money(report.profitKopecks)}`}
      </p>
      {report.profitKopecks === null && (
        <p className="note">
          Неполных платежей: {report.incompletePayments} · без комиссии: {report.missingFees}· без
          даты: {report.undatedPayments}
        </p>
      )}
      <div className="metric-grid">
        {Object.entries(labels).map(([key, title]) => (
          <div className="metric" key={key}>
            <span>{title}</span>
            <strong>{money(report.totals[key] ?? null)}</strong>
          </div>
        ))}
      </div>
      <section className="nested-section">
        <h3>Расходы на видео · {report.videoCount}</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Партнёр</th>
                <th>Дата</th>
                <th>Количество</th>
                <th>Сумма</th>
                <th>Комментарий</th>
                <th>Статус</th>
                <th>Версия</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {report.videos.map((row) => (
                <tr key={row.id}>
                  <td>{row.partnerName}</td>
                  <td>{row.paidDay}</td>
                  <td>{row.quantity}</td>
                  <td>{money(row.amountKopecks)}</td>
                  <td>{row.comment || "—"}</td>
                  <td>{row.canceled ? "Отменено" : "Учтено"}</td>
                  <td>
                    {row.version}
                    <small>ID: {row.id}</small>
                  </td>
                  <td>
                    <button
                      className="secondary"
                      disabled={row.canceled}
                      onClick={() => setEditingVideo(row)}
                    >
                      Изменить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!report.videos.length && <p className="empty">Нет расходов</p>}
        {editingVideo && (
          <ProfitVideoEditor
            key={editingVideo.id}
            row={editingVideo}
            partners={profitPartnersFromReport(data) ?? []}
            today={report.today}
            onSaved={() => {
              void fetchReport(report.from, report.to, report.paymentPage, report.videoPage);
            }}
            onClose={() => setEditingVideo(null)}
          />
        )}
        <div className="pagination">
          <button
            className="secondary"
            disabled={busy || report.videoPage <= 1}
            onClick={() => page("videos", report.videoPage - 1)}
          >
            Назад
          </button>
          <span>
            Страница {report.videoPage} · всего {report.videoCount}
          </span>
          <button
            className="secondary"
            disabled={busy || report.videoPage * report.pageSize >= report.videoCount}
            onClick={() => page("videos", report.videoPage + 1)}
          >
            Дальше
          </button>
        </div>
      </section>
      <section className="nested-section">
        <h3>Оплаты подписок · {report.paymentCount}</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Дата</th>
                <th>Сумма</th>
                <th>Способ</th>
                <th>Комиссия</th>
                <th>НПД</th>
                <th>Сверка</th>
              </tr>
            </thead>
            <tbody>
              {report.payments.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.date ? new Date(row.date).toLocaleString("ru-RU") : "Без даты"}</td>
                  <td>{money(row.amountKopecks)}</td>
                  <td>{methods[row.method ?? ""] || row.method || "—"}</td>
                  <td>{money(row.feeKopecks)}</td>
                  <td>{money(row.npdKopecks)}</td>
                  <td>{row.complete ? "Готово" : "Требуется"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!report.payments.length && <p className="empty">Нет оплат</p>}
        <div className="pagination">
          <button
            className="secondary"
            disabled={busy || report.paymentPage <= 1}
            onClick={() => page("payments", report.paymentPage - 1)}
          >
            Назад
          </button>
          <span>
            Страница {report.paymentPage} · всего {report.paymentCount}
          </span>
          <button
            className="secondary"
            disabled={busy || report.paymentPage * report.pageSize >= report.paymentCount}
            onClick={() => page("payments", report.paymentPage + 1)}
          >
            Дальше
          </button>
        </div>
      </section>
    </section>
  );
}
