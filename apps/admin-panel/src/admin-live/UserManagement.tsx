import { useMemo, useRef, useState, type FormEvent } from "react";
import { AdminHttpError, requestAdmin } from "./api";
import "./UsersParity.css";
import {
  filterAndSortUsers,
  type UserSortField,
  type SortDirection,
} from "./support/usersListUtils";

type User = {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: string;
  registrationChannel: string;
  createdAt: string;
  profile?: { fullName?: string | null; avatarUrl?: string | null } | null;
  _count: { pushSubscriptions: number };
  savedRegistrationPromoCode: { code: string } | null;
  partnerProfile?: {
    promoCodeId: string | null;
    promoCode: { id: string; code: string } | null;
  } | null;
};
type Promo = { id: string; code: string; discountPercent: number };
type UserPage = { users: User[]; freePartnerPromoCodes: Promo[] };
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
function parseUsers(value: unknown): UserPage | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.users) ||
    !Array.isArray(value.freePartnerPromoCodes)
  )
    return null;
  if (
    value.users.some(
      (user) =>
        !isRecord(user) ||
        typeof user.id !== "string" ||
        typeof user.username !== "string" ||
        typeof user.role !== "string",
    )
  )
    return null;
  return value as UserPage;
}
const roles = ["USER", "TRAINER", "PARTNER", "MODERATOR", "ADMIN"] as const;
const registrationChannelLabels: Record<string, string> = {
  WEB: "Веб", IOS: "iOS", ANDROID: "Android", UNKNOWN: "Не указано",
};
function avatarUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    // Keep media URLs as received, without rewriting signed query strings.
    const url = new URL(value, "http://gafus.local");
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (value.startsWith("//")) return null;
    return value;
  } catch {
    return null;
  }
}
const label: Record<string, string> = {
  USER: "Пользователь",
  TRAINER: "Тренер",
  PARTNER: "Партнёр",
  MODERATOR: "Модератор",
  ADMIN: "Администратор",
};
function format(value: string) {
  return new Date(value).toLocaleDateString("ru-RU");
}

function UserEditor({
  user,
  actorRole,
  promos,
  onSaved,
  onClose,
}: {
  user: User;
  actorRole: "ADMIN" | "MODERATOR";
  promos: Promo[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [role, setRole] = useState(user.role);
  const [newPassword, setNewPassword] = useState("");
  const [promoId, setPromoId] = useState(user.partnerProfile?.promoCodeId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReadback, setNeedsReadback] = useState(false);
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || needsReadback) return;
    const changes: Record<string, string | null> = {};
    if (username !== user.username) changes.username = username;
    if (email.trim().toLowerCase() !== (user.email ?? "").toLowerCase()) {
      changes.email = email.trim().toLowerCase() || null;
    }
    if (phone !== (user.phone ?? "")) changes.phone = phone;
    if (actorRole === "ADMIN") {
      if (role !== user.role) changes.role = role;
      if (role === "PARTNER" && promoId && promoId !== user.partnerProfile?.promoCodeId) {
        changes.partnerPromoCodeId = promoId;
      }
    }
    if (newPassword.trim()) changes.newPassword = newPassword;
    if (!Object.keys(changes).length) return setError("Нет изменений для сохранения");
    if (!window.confirm(`Сохранить изменения пользователя ${user.username}?`)) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      await requestAdmin(`/api/v1/admin/users/${user.id}`, { method: "PATCH", body: changes });
      onSaved();
      onClose();
    } catch (cause) {
      const rejected = cause instanceof AdminHttpError &&
        !["INVALID_RESPONSE", "STATUS_MISMATCH"].includes(cause.code) &&
        [400, 401, 403, 404, 409, 422, 429].includes(cause.status);
      if (rejected) {
        setError(cause.message);
      } else {
        setNeedsReadback(true);
        setError("Ответ на изменение пользователя неизвестен. Перед повтором проверьте данные на сервере.");
      }
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return (
    <div className="content-card user-editor">
      <h2>Редактировать {user.username}</h2>
      <p className="note">ID: {user.id}</p>
      <form className="operation-grid" onSubmit={submit}>
        <label>
          Имя пользователя
          <input
            required
            minLength={1}
            maxLength={80}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            maxLength={320}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Телефон
          <input maxLength={64} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        {actorRole === "ADMIN" && (
          <label>
            Роль
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((value) => (
                <option value={value} key={value}>
                  {label[value]}
                </option>
              ))}
            </select>
          </label>
        )}
        {role === "PARTNER" && actorRole === "ADMIN" && (
          <label>
            Промокод партнёра
            <select value={promoId} onChange={(e) => setPromoId(e.target.value)}>
              <option value="">Не назначен</option>
              {promos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.discountPercent}%
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Новый пароль (необязательно)
          <input
            type="password"
            autoComplete="new-password"
            minLength={6}
            maxLength={256}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        <div className="action-row">
          <button type="submit" disabled={pending || needsReadback}>
            {pending ? "Сохраняем…" : "Сохранить"}
          </button>
          {needsReadback && (
            <button type="button" className="secondary" onClick={() => { onSaved(); onClose(); }}>
              Проверить пользователя на сервере
            </button>
          )}
          <button className="secondary" type="button" onClick={onClose}>
            Отмена
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

export function UsersPanel({
  source,
  actorRole,
  actorId,
  onSaved,
  onNavigate,
}: {
  source: unknown;
  actorRole: "ADMIN" | "MODERATOR";
  actorId: string;
  onSaved: () => void;
  onNavigate?: (path: string) => void;
}) {
  const data = parseUsers(source);
  // Next UsersClient restores ?search= on direct links. The deep detail user
  // route is separate and must not inherit arbitrary search state.
  const [search, setSearch] = useState(() =>
    typeof window !== "undefined" && window.location.pathname === "/main-panel/users"
      ? (new URLSearchParams(window.location.search).get("search") ?? "").slice(0, 128)
      : "",
  );
  const [sortField, setSortField] = useState<UserSortField>("createdAt");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [edit, setEdit] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const deletingLock = useRef(false);
  const [deleteUnknown, setDeleteUnknown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      filterAndSortUsers(
        (data?.users ?? []).map((user) => ({
          ...user,
          createdAt: new Date(user.createdAt),
          savedRegistrationPromoCode: user.savedRegistrationPromoCode ?? null,
          _count: user._count ?? { pushSubscriptions: 0 },
        })),
        search,
        sortField,
        direction,
      ),
    [data, search, sortField, direction],
  );
  if (!data) return <p role="alert">Некорректный ответ списка пользователей</p>;
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const currentPage = Math.min(page, totalPages);
  function sort(next: UserSortField) {
    setPage(1);
    if (next === sortField) setDirection((x) => (x === "asc" ? "desc" : "asc"));
    else {
      setSortField(next);
      setDirection(next === "createdAt" ? "desc" : "asc");
    }
  }
  async function remove(user: User) {
    const allowed = actorRole === "ADMIN" || user.role === "USER";
    if (!allowed || user.id === actorId || deletingLock.current || deleteUnknown) return;
    if (!window.confirm(`Удалить пользователя ${user.username}? Действие необратимо.`)) return;
    const text = window.prompt(`Для удаления введите логин «${user.username}»`);
    if (text !== user.username) return;
    deletingLock.current = true;
    setDeleting(user.id);
    setError(null);
    try {
      await requestAdmin(`/api/v1/admin/users/${user.id}`, { method: "DELETE" });
      onSaved();
    } catch (cause) {
      const rejected = cause instanceof AdminHttpError &&
        !["INVALID_RESPONSE", "STATUS_MISMATCH"].includes(cause.code) &&
        [400, 401, 403, 404, 409, 422, 429].includes(cause.status);
      if (rejected) setError(cause.message);
      else {
        setDeleteUnknown(user.id);
        setError("Удаление могло выполниться. Сначала перечитайте список пользователей с сервера.");
      }
    } finally {
      deletingLock.current = false;
      setDeleting(null);
    }
  }
  return (
    <section className="content-card">
      <h2>Пользователи платформы · {rows.length}</h2>
      <p className="note">
        Все зарегистрированные пользователи. Поиск, фильтры и сортировка по данным API.
      </p>
      <div className="data-head">
        <label>
          Поиск
          <input
            placeholder="Имя, почта, ID, промокод"
            maxLength={128}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Сортировка
          <select
            value={sortField ?? "createdAt"}
            onChange={(e) => sort(e.target.value as UserSortField)}
          >
            <option value="createdAt">Дата регистрации</option>
            <option value="username">Имя</option>
            <option value="role">Роль</option>
            <option value="email">Email</option>
            <option value="registrationChannel">Платформа</option>
            <option value="promoCode">Промокод</option>
            <option value="notifications">Push</option>
          </select>
        </label>
        <button
          className="secondary"
          onClick={() => setDirection((x) => (x === "asc" ? "desc" : "asc"))}
        >
          {direction === "asc" ? "По возрастанию" : "По убыванию"}
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {deleteUnknown && (
        <button type="button" className="secondary" onClick={onSaved}>
          Перечитать список пользователей
        </button>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Пользователь</th>
              <th>ID</th>
              <th>Роль</th>
              <th>Email / телефон</th>
              <th>Платформа</th>
              <th>Промокод</th>
              <th>Уведомления</th>
              <th>Дата регистрации</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
              .map((user) => (
              <tr key={user.id}>
                <td>
                  <div className="admin-user-identity">
                    <span className="admin-user-avatar" aria-hidden="true">
                      {avatarUrl(user.profile?.avatarUrl) ? (
                        <img src={avatarUrl(user.profile?.avatarUrl) ?? undefined} alt="" />
                      ) : (user.profile?.fullName || user.username).charAt(0).toUpperCase()}
                    </span>
                    <span>
                      <strong>{user.profile?.fullName || user.username}</strong>
                      <small>@{user.username}</small>
                    </span>
                  </div>
                </td>
                <td><code>{user.id}</code></td>
                <td>
                  <span className={`admin-user-role admin-user-role-${user.role.toLowerCase()}`}>
                    {label[user.role] || user.role}
                  </span>
                </td>
                <td>
                  {user.email || "Нет email"}
                  <small>{user.phone || ""}</small>
                </td>
                <td>
                  {registrationChannelLabels[user.registrationChannel] ?? user.registrationChannel}
                </td>
                <td>{user.savedRegistrationPromoCode?.code || "—"}</td>
                <td>{user._count.pushSubscriptions}</td>
                <td>{format(String(user.createdAt))}</td>
                <td>
                  <div className="action-row">
                    {(actorRole === "ADMIN" || user.role === "USER") && (
                      <button
                        className="secondary"
                        onClick={() =>
                          setEdit({ ...user, createdAt: user.createdAt.toISOString() })
                        }
                      >
                        Изменить
                      </button>
                    )}
                    <a
                      className="button-link"
                      href={`/main-panel/users/${user.id}/app-subscription`}
                      onClick={(event) => {
                        if (!onNavigate) return;
                        event.preventDefault();
                        onNavigate(`/main-panel/users/${user.id}/app-subscription`);
                      }}
                    >
                      Подписка
                    </a>
                    {(actorRole === "ADMIN" || user.role === "USER") && user.id !== actorId && (
                      <button
                        className="danger"
                        disabled={deleting !== null || deleteUnknown !== null}
                        onClick={() =>
                          void remove({ ...user, createdAt: user.createdAt.toISOString() })
                        }
                      >
                        {deleting === user.id ? "Удаляем…" : "Удалить"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="empty">Пользователи не найдены</p>}
      <div className="pagination">
        <label className="admin-user-pagination-size">
          Показывать
          <select
            aria-label="Пользователей на странице"
            value={rowsPerPage}
            onChange={(event) => {
              setRowsPerPage(Number(event.target.value));
              setPage(1);
            }}
          >
            {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <span>
          {rows.length ? (currentPage - 1) * rowsPerPage + 1 : 0}–
          {Math.min(currentPage * rowsPerPage, rows.length)} из {rows.length}
        </span>
        <button
          className="secondary"
          disabled={currentPage <= 1}
          onClick={() => setPage(currentPage - 1)}
        >
          Назад
        </button>
        <span>
          Страница {currentPage} из {totalPages}
        </span>
        <button
          className="secondary"
          disabled={currentPage >= totalPages}
          onClick={() => setPage(currentPage + 1)}
        >
          Дальше
        </button>
      </div>
      {edit && (
        <UserEditor
          key={edit.id}
          user={edit}
          actorRole={actorRole}
          promos={data.freePartnerPromoCodes}
          onClose={() => setEdit(null)}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}
