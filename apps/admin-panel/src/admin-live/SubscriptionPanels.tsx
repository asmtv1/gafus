import { useRef, useState, type FormEvent } from "react";
import { toAdminBrowserHref, toAdminInternalPath } from "./adminBrowserRoutes";
import { AdminHttpError, requestAdmin } from "./api";
import { PaymentHistory } from "./PaymentHistory";

type Promo = {
  id: string;
  code: string;
  discountPercent: number;
  isActive: boolean;
  archivedAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  events: {
    id: string;
    type: string;
    actor: { username: string } | null;
    createdAt: string;
    discountPercent: number;
    isActive: boolean;
  }[];
};
type Receipt = {
  id: string;
  paymentId: string;
  user: { username: string; fullName: string | null };
  planCode: string;
  amountRub: number;
  currency: string;
  status: string;
  canRetry?: boolean;
  canReconcile?: boolean;
  lastErrorRedacted?: string | null;
  emailDelivery?: string | null;
  printUrl?: string | null;
  retryAt?: string | null;
  operationAt: string;
};
type NpdPage = {
  items: Receipt[];
  page: number;
  pageSize: number;
  total: number;
  backlog: number;
  connection: {
    status: string;
    lastErrorRedacted?: string | null;
    fiscalizationStartedAt?: string | null;
    lastSuccessfulOperationAt?: string | null;
  } | null;
};
type SubscriptionPage = {
  role: "ADMIN" | "MODERATOR";
  dashboard: unknown;
  paymentHistory: unknown;
  promoCodes: Promo[] | null;
  npd: NpdPage | null;
};
const idValid = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);
const money = (amount: number) => amount.toLocaleString("ru-RU", { minimumFractionDigits: 2 });
// A missing/5xx ACK does not prove that a write was rolled back.
// An explicit 4xx validation/authorization/conflict response is a rejection.
function explicitlyRejected(error: unknown): error is AdminHttpError {
  return error instanceof AdminHttpError &&
    [400, 401, 403, 404, 409, 422, 429].includes(error.status) &&
    !["INVALID_RESPONSE", "STATUS_MISMATCH"].includes(error.code);
}
const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("ru-RU") : "—";
function asPage(value: unknown): SubscriptionPage | null {
  if (!value || typeof value !== "object" || !("role" in value)) return null;
  return value as SubscriptionPage;
}
function PromoPanel({
  promos: original,
  canManage,
  onSaved,
  initialArchive = false,
}: {
  promos: Promo[];
  canManage: boolean;
  onSaved: () => void;
  initialArchive?: boolean;
}) {
  const [promos, setPromos] = useState(original);
  const [includeArchived, setIncludeArchived] = useState(initialArchive);
  const [pending, setPending] = useState(false);
  const writeInFlight = useRef(false);
  const [writeUnknown, setWriteUnknown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [edit, setEdit] = useState<Promo | null>(null);
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState("10");
  const [active, setActive] = useState(true);
  const [history, setHistory] = useState<string | null>(null);
  const execute = async (url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => {
    if (writeInFlight.current || writeUnknown) return;
    writeInFlight.current = true;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await requestAdmin(url, { method, body });
      setMessage("Изменение сохранено");
      setEdit(null);
      onSaved();
    } catch (cause) {
      if (explicitlyRejected(cause)) {
        setError(cause.message);
      } else {
        setWriteUnknown(true);
        setError(
          "Результат изменения промокода неизвестен. Перед повтором загрузите список с сервера.",
        );
      }
    } finally {
      writeInFlight.current = false;
      setPending(false);
    }
  };
  const editPromo = (promo: Promo) => {
    setEdit(promo);
    setDiscount(String(promo.discountPercent));
    setActive(promo.isActive);
  };
  const create = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (writeInFlight.current || writeUnknown) return;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(code) || !(Number(discount) >= 1 && Number(discount) <= 50)) {
      setError("Код или скидка указаны некорректно");
      return;
    }
    void execute("/api/v1/admin/app-subscriptions/promo-codes", "POST", {
      code,
      discountPercent: Number(discount),
      isActive: active,
    });
  };
  const update = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!edit || !idValid(edit.id) || writeInFlight.current || writeUnknown) return;
    void execute(`/api/v1/admin/app-subscriptions/promo-codes/${edit.id}`, "PATCH", {
      discountPercent: Number(discount),
      isActive: active,
    });
  };
  async function toggleArchive() {
    setPending(true);
    setError(null);
    try {
      const response = await requestAdmin<SubscriptionPage>(
        `/api/v1/admin/app-subscriptions?tab=promo-codes${!includeArchived ? "&includeArchived=1" : ""}`,
      );
      if (!Array.isArray(response.promoCodes)) throw Error("Некорректный ответ промокодов");
      setPromos(response.promoCodes);
      setIncludeArchived(!includeArchived);
      if (toAdminInternalPath(window.location.pathname) === "/main-panel/app-subscriptions") {
        const query = !includeArchived ? "?tab=promo-codes&includeArchived=1" : "?tab=promo-codes";
        window.history.replaceState(null, "", toAdminBrowserHref(`/main-panel/app-subscriptions${query}`));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить архив");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="content-card">
      <h2>Промокоды подписки</h2>
      {!canManage && <p className="note">Модератор может просматривать промокоды и историю.</p>}
      <label className="check">
        <input
          type="checkbox"
          checked={includeArchived}
          disabled={pending}
          onChange={() => void toggleArchive()}
        />
        Показать архивные
      </label>
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
      {writeUnknown && (
        <button type="button" className="secondary" onClick={onSaved}>
          Сверить промокоды с сервером
        </button>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Код</th>
              <th>Скидка</th>
              <th>Статус</th>
              <th>Ревизия</th>
              <th>Создан</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {promos.map((promo) => (
              <tr key={promo.id}>
                <td>
                  <strong>{promo.code}</strong>
                </td>
                <td>{promo.discountPercent}%</td>
                <td>{promo.archivedAt ? "Архив" : promo.isActive ? "Активен" : "Выключен"}</td>
                <td>{promo.revision}</td>
                <td>{date(promo.createdAt)}</td>
                <td>
                  <div className="action-row">
                    <button
                      className="secondary"
                      onClick={() => setHistory(history === promo.id ? null : promo.id)}
                    >
                      История
                    </button>
                    {canManage && !promo.archivedAt && (
                      <>
                        <button disabled={pending || writeUnknown}
                          onClick={() => editPromo(promo)}>Изменить</button>
                        <button
                          className="danger"
                          disabled={pending || writeUnknown}
                          onClick={() => {
                            if (writeInFlight.current || writeUnknown) return;
                            if (!window.confirm(`Архивировать промокод ${promo.code}?`)) return;
                            void execute(
                              `/api/v1/admin/app-subscriptions/promo-codes/${promo.id}`,
                              "DELETE",
                            );
                          }}
                        >
                          В архив
                        </button>
                      </>
                    )}
                  </div>
                  {history === promo.id && (
                    <div className="promo-history">
                      {promo.events.map((event) => (
                        <p key={event.id}>
                          {date(event.createdAt)} · {event.type}·{" "}
                          {event.actor?.username ?? "Система"} · {event.discountPercent}%
                        </p>
                      ))}
                      {!promo.events.length && <p>Истории изменений пока нет</p>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!promos.length && <p className="empty">Нет промокодов</p>}
      {canManage && (
        <form className="operation subscription-form" onSubmit={edit ? update : create}>
          <h3>{edit ? `Изменить ${edit.code}` : "Создать промокод"}</h3>
          {!edit && (
            <label>
              Код
              <input
                required
                maxLength={64}
                pattern="[A-Za-z0-9_-]+"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          )}
          <label>
            Скидка %
            <input
              required
              type="number"
              min="1"
              max="50"
              step="1"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Активен
          </label>
          <div className="action-row">
            <button type="submit" disabled={pending || writeUnknown}>
              {pending ? "Сохраняем…" : edit ? "Сохранить изменения" : "Создать"}
            </button>
            {edit && (
              <button type="button" className="secondary" onClick={() => setEdit(null)}>
                Отмена
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
function NpdPanel({ initial, canManage, initialSearch = "" }: {
  initial: NpdPage; canManage: boolean; initialSearch?: string;
}) {
  const [data, setData] = useState(initial);
  const [pending, setPending] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const actionInFlight = useRef(false);
  const [actionUnknown, setActionUnknown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialFilters = new URLSearchParams(initialSearch);
  const [search, setSearch] = useState(initialFilters.get("npdSearch") ?? "");
  const [status, setStatus] = useState(initialFilters.get("npdStatus") ?? "");
  const [from, setFrom] = useState(initialFilters.get("npdFrom") ?? "");
  const [to, setTo] = useState(initialFilters.get("npdTo") ?? "");
  const [pageSize, setPageSize] = useState(Number(initialFilters.get("npdPageSize")) || 25);
  const buildUrl = (page: number) => {
    const params = new URLSearchParams({
      tab: "npd",
      npdPage: String(page),
      npdPageSize: String(pageSize),
    });
    if (search.trim()) params.set("npdSearch", search.trim());
    if (status) params.set("npdStatus", status);
    if (from) params.set("npdFrom", from);
    if (to) params.set("npdTo", to);
    return `/api/v1/admin/app-subscriptions?${params}`;
  };
  async function load(page: number) {
    if (pending || page < 1 || page > 10000) return;
    setPending(true);
    setError(null);
    try {
      const result = await requestAdmin<SubscriptionPage>(buildUrl(page));
      if (!result.npd) throw Error("Нет данных о чеках");
      setData(result.npd);
      setActionUnknown(false);
      if (toAdminInternalPath(window.location.pathname) === "/main-panel/app-subscriptions" &&
          new URLSearchParams(window.location.search).get("tab") === "npd") {
        window.history.replaceState(null, "", toAdminBrowserHref(`/main-panel/app-subscriptions?${buildUrl(page).split("?")[1]}`));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка загрузки НПД");
    } finally {
      setPending(false);
    }
  }
  async function act(id: string, kind: "retry" | "reconcile") {
    if (!idValid(id) || actionInFlight.current || actionUnknown) return;
    if (
      !window.confirm(kind === "retry" ? "Повторить операцию НПД?" : "Запросить сверку чека НПД?")
    )
      return;
    actionInFlight.current = true;
    setActing(id);
    // A successful mutation ACK still needs a successful GET to verify receipt state.
    setActionUnknown(true);
    setError(null);
    try {
      await requestAdmin(`/api/v1/admin/app-subscriptions/npd/${id}/${kind}`, { method: "POST" });
      await load(data.page);
    } catch (cause) {
      if (explicitlyRejected(cause)) {
        setActionUnknown(false);
        setError(cause.message);
      } else {
        setActionUnknown(true);
        setError("Результат операции НПД неизвестен. Сначала перечитайте чеки с сервера.");
      }
    } finally {
      actionInFlight.current = false;
      setActing(null);
    }
  }
  return (
    <section className="content-card">
      <h2>Чеки НПД</h2>
      <p className="note">
        В очереди: {data.backlog} · Подключение: {data.connection?.status || "не настроено"}
      </p>
      {!!data.connection?.lastErrorRedacted && (
        <p className="error">{data.connection.lastErrorRedacted}</p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {actionUnknown && (
        <button type="button" className="secondary" disabled={pending}
          onClick={() => void load(data.page)}>
          Сверить чеки с сервером
        </button>
      )}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void load(1);
        }}
      >
        <label>
          Платёж или пользователь
          <input maxLength={128} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          Статус
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Все</option>
            {[
              "PENDING",
              "ISSUED",
              "CANCEL_PENDING",
              "CANCELED",
              "RECONCILIATION_REQUIRED",
              "FAILED",
            ].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          От
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          До
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="submit" disabled={pending}>
          Найти
        </button>
      </form>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Платёж</th>
              <th>Пользователь</th>
              <th>Тариф / сумма</th>
              <th>Статус</th>
              <th>Email</th>
              <th>Чек / операция</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id}>
                <td>{item.paymentId}</td>
                <td>{item.user.fullName || item.user.username}</td>
                <td>
                  {item.planCode} · {money(item.amountRub)} {item.currency}
                </td>
                <td>
                  {item.status}
                  {item.lastErrorRedacted && <small>{item.lastErrorRedacted}</small>}
                </td>
                <td>{item.emailDelivery || "—"}</td>
                <td>
                  <div className="action-row">
                    {item.printUrl?.startsWith("https://") && (
                      <a href={item.printUrl} target="_blank" rel="noopener noreferrer">
                        Открыть чек
                      </a>
                    )}
                    {canManage && item.status === "FAILED" && item.canRetry !== false && (
                      <button
                        className="secondary"
                        disabled={actionUnknown || acting !== null}
                        onClick={() => void act(item.id, "retry")}
                      >
                        Повторить
                      </button>
                    )}
                    {canManage && item.status === "RECONCILIATION_REQUIRED" && item.canReconcile !== false && (
                      <button
                        className="secondary"
                        disabled={actionUnknown || acting !== null}
                        onClick={() => void act(item.id, "reconcile")}
                      >
                        Сверка
                      </button>
                    )}
                  </div>
                  {item.status === "FAILED" && item.canRetry === false &&
                    <small>Повтор уже запланирован или обрабатывается</small>}
                  {item.status === "RECONCILIATION_REQUIRED" && item.canReconcile === false &&
                    <small>Сверка уже запрошена</small>}
                  <small>{date(item.operationAt)}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.items.length && <p className="empty">Чеки не найдены</p>}
      <div className="pagination">
        <label>
          Строк на странице
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary"
          disabled={pending || data.page <= 1}
          onClick={() => void load(data.page - 1)}
        >
          Назад
        </button>
        <span>
          Страница {data.page} · всего {data.total}
        </span>
        <button
          className="secondary"
          disabled={pending || data.page * data.pageSize >= data.total}
          onClick={() => void load(data.page + 1)}
        >
          Дальше
        </button>
      </div>
    </section>
  );
}
export function SubscriptionPanel({
  source,
  tab,
  initialSearch = "",
  canManage,
  onSaved,
}: {
  source: unknown;
  tab: "payments" | "promo-codes" | "npd";
  initialSearch?: string;
  canManage: boolean;
  onSaved: () => void;
}) {
  const page = asPage(source);
  if (!page) return <p role="alert">Некорректный ответ подписок</p>;
  if (tab === "promo-codes")
    return page.promoCodes ? (
      <PromoPanel promos={page.promoCodes} canManage={canManage} onSaved={onSaved}
        initialArchive={new URLSearchParams(initialSearch).has("includeArchived")} />
    ) : (
      <p role="alert">Промокоды не загружены</p>
    );
  if (tab === "npd")
    return page.npd ? (
      <NpdPanel initial={page.npd} canManage={canManage} initialSearch={initialSearch} />
    ) : (
      <p role="alert">Нет данных НПД</p>
    );
  return <PaymentHistory dashboard={page.dashboard} source={page.paymentHistory}
    initialSearch={initialSearch} />;
}
