import { useEffect, useMemo, useRef, useState } from "react";
import { getCDNUrl } from "@gafus/cdn-upload/utils";
import { AdminHttpError, requestAdmin } from "./api";
import {
  formatConsultationConfirmSlotMsk,
  formatConsultationListDateTimeMsk,
} from "@gafus/consultation-shared/consultation-msk-format";
import {
  plainConsultationAboutHtml,
  cynologistDisplayInitials,
} from "@gafus/consultation-shared/consultation-catalog-presentation";

type Trainer = {
  userId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  about: string | null;
  isListed: boolean;
  cynologistId: string | null;
};
type Booking = {
  id: string;
  status: string;
  cynologistUserId: string;
  cynologistDisplayName: string | null;
  clientUsername?: string | null;
  clientOwnerName: string | null;
  confirmationDeadlineAt: string;
  createdAt: string;
  petName: string | null;
  slot: { startAtUtc: string; endAtUtc: string };
};
const statusLabel: Record<string, string> = {
  PENDING_TRAINER_CONFIRMATION: "Ожидает подтверждения",
  CONFIRMED: "Подтверждена",
  CANCELLED_BY_TRAINER: "Отменена тренером",
  CANCELLED_BY_USER: "Отменена пользователем",
  CANCELLED_BY_SLA: "Отменена по SLA",
  CANCELLED_BY_SYSTEM: "Отменена системой",
  COMPLETED: "Завершена",
  NO_SHOW: "Неявка",
};

function validTrainers(source: unknown): Trainer[] | null {
  if (
    !Array.isArray(source) ||
    source.some(
      (x) =>
        !x ||
        typeof x !== "object" ||
        typeof x.userId !== "string" ||
        typeof x.username !== "string" ||
        typeof x.isListed !== "boolean",
    )
  ) {
    return null;
  }
  return source as Trainer[];
}
/** Matches the former Next catalog: already absolute URLs or original CDN-backed relative media keys. */
export function cynologistAvatarSrc(value: string | null | undefined): string | null {
  const path = value?.trim();
  if (
    !path ||
    [...path].some((char) => {
      const code = char.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  )
    return null;
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      return url.username || url.password ? null : path;
    } catch {
      return null;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//") || path.includes("\\")) {
    return null;
  }
  return getCDNUrl(path);
}

function TrainerAvatar({ trainer }: { trainer: Trainer }) {
  const [failed, setFailed] = useState(false);
  const src = cynologistAvatarSrc(trainer.avatarUrl);
  const label = cynologistDisplayInitials(trainer.fullName || trainer.username);
  return (
    <div className="trainer-avatar" aria-hidden="true">
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span>{label}</span>
      )}
    </div>
  );
}

export function Cynologists({ source, onSaved }: { source: unknown; onSaved: () => void }) {
  const trainers = useMemo(() => validTrainers(source), [source]);
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(trainers?.map((t) => [t.userId, t.isListed]) ?? []),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReadback, setNeedsReadback] = useState(false);
  const inFlight = useRef(false);
  const lastAppliedSource = useRef(source);
  const [query, setQuery] = useState("");
  // Unlike Next's fresh server render, this SPA component survives an API refresh.
  // Treat the latest authorized GET as the baseline (including newly added trainers),
  // never carry a previous operator's selection into a newly fetched catalog.
  useEffect(() => {
    if (!trainers || lastAppliedSource.current === source || inFlight.current) return;
    lastAppliedSource.current = source;
    setSelected(Object.fromEntries(trainers.map((trainer) => [trainer.userId, trainer.isListed])));
    setNeedsReadback(false);
    setError(null);
  }, [trainers, source, pending]);
  const visible = useMemo(
    () =>
      (trainers ?? []).filter((t) =>
        `${t.username} ${t.fullName ?? ""} ${t.about ?? ""}`
          .toLocaleLowerCase("ru-RU")
          .includes(query.toLocaleLowerCase("ru-RU")),
      ),
    [trainers, query],
  );
  if (!trainers) return <p role="alert">Некорректный формат каталога кинологов</p>;
  const changed = trainers.some((t) => (selected[t.userId] ?? false) !== t.isListed);
  async function save() {
    if (!trainers || !changed || inFlight.current || needsReadback) return;
    const cynologistUserIds = trainers.filter((t) => selected[t.userId]).map((t) => t.userId);
    if (
      !window.confirm(
        `Изменить видимость каталога? В каталоге будет ${cynologistUserIds.length} кинологов.`,
      )
    )
      return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await requestAdmin("/api/v1/consultations/admin/cynologists/listed", {
        method: "PUT",
        body: { cynologistUserIds },
      });
      onSaved();
    } catch (cause) {
      const explicitlyRejected =
        cause instanceof AdminHttpError &&
        !["INVALID_RESPONSE", "STATUS_MISMATCH"].includes(cause.code) &&
        [400, 401, 403, 404, 409, 422, 429].includes(cause.status);
      if (explicitlyRejected) {
        setError(cause instanceof Error ? cause.message : "Сервер отклонил изменение каталога");
      } else {
        // A timeout/5xx/malformed ACK does not establish that the PUT failed.
        // A blind retry could overwrite a concurrently updated catalog.
        setNeedsReadback(true);
        setError("Результат сохранения неизвестен. Сначала повторно получите каталог с сервера.");
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <section className="content-card">
      <div className="data-head">
        <h2>Каталог кинологов</h2>
        <label>
          Поиск
          <input
            placeholder="Имя или логин"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <p className="note">
        Отметьте тренеров, которых видят пользователи на странице консультаций. Расписание и слоты
        настраивает тренер в своей панели; администратор может править любое расписание в разделе
        «Расписания тренеров».
      </p>
      <p className="note">
        <a href="/consultations/bookings">Все брони</a>
      </p>
      <div className="trainer-list">
        {visible.map((t) => (
          <article key={t.userId} className="trainer-row">
            <label className="check">
              <input
                type="checkbox"
                checked={selected[t.userId] ?? false}
                disabled={pending || needsReadback}
                onChange={(e) => setSelected((old) => ({ ...old, [t.userId]: e.target.checked }))}
                aria-label={`Показывать в каталоге: ${t.fullName ?? t.username}`}
              />
            </label>
            <TrainerAvatar trainer={t} />
            <div className="trainer-details">
              <strong>{t.fullName || t.username}</strong>
              <span>@{t.username}</span>
              {t.about && <p>{plainConsultationAboutHtml(t.about).slice(0, 360)}</p>}
              <small>ID: {t.userId}</small>
            </div>
            <span className={`status-pill ${selected[t.userId] ? "active" : ""}`}>
              {selected[t.userId] ? "В каталоге" : "Скрыт"}
            </span>
          </article>
        ))}
      </div>
      {visible.length === 0 && <p className="empty">Кинологи не найдены</p>}
      <button disabled={!changed || pending || needsReadback} onClick={save}>
        {pending ? "Сохраняем…" : "Сохранить изменения каталога"}
      </button>
      {needsReadback && (
        <button className="secondary" disabled={pending} onClick={onSaved}>
          Сверить каталог с сервером
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
function validBookingRows(value: unknown): value is Booking[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => {
      if (!item || typeof item !== "object") return false;
      const row = item as Partial<Booking>;
      return (
        typeof row.id === "string" &&
        typeof row.status === "string" &&
        typeof row.createdAt === "string" &&
        typeof row.confirmationDeadlineAt === "string" &&
        !!row.slot &&
        typeof row.slot.startAtUtc === "string" &&
        typeof row.slot.endAtUtc === "string"
      );
    })
  );
}

export function Bookings({ source }: { source: unknown }) {
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  if (!validBookingRows(source)) return <p role="alert">Некорректный ответ списка бронирований</p>;
  const bookings = source;
  const rows = bookings.filter(
    (booking) =>
      (status === "ALL" || booking.status === status) &&
      `${booking.cynologistDisplayName ?? ""} ${booking.clientUsername ?? ""} ${booking.petName ?? ""}`
        .toLocaleLowerCase("ru-RU")
        .includes(search.toLocaleLowerCase("ru-RU")),
  );
  return (
    <section className="content-card">
      <p className="note">
        <a href="/consultations">← К каталогу кинологов</a>
      </p>
      <div className="data-head">
        <h2>Все брони консультаций</h2>
        <label>
          Статус
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ALL">Все</option>
            {Object.entries(statusLabel).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Поиск
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Кинолог, клиент, питомец"
          />
        </label>
      </div>
      <p className="note">
        Последние бронирования (до 500), время — МСК. Подтверждение и отмена — в сценариях тренера и
        пользователя.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Статус</th>
              <th>Кинолог</th>
              <th>Клиент</th>
              <th>Питомец</th>
              <th>Начало и конец</th>
              <th>Срок подтверждения</th>
              <th>Создана</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((booking) => (
              <tr key={booking.id}>
                <td>
                  <span className="status-pill">
                    {statusLabel[booking.status] ?? booking.status}
                  </span>
                </td>
                <td>{booking.cynologistDisplayName || booking.cynologistUserId}</td>
                <td>{booking.clientUsername || booking.clientOwnerName || "—"}</td>
                <td>{booking.petName || "—"}</td>
                <td>
                  {formatConsultationConfirmSlotMsk(booking.slot.startAtUtc, booking.slot.endAtUtc)}
                </td>
                <td>{formatConsultationListDateTimeMsk(booking.confirmationDeadlineAt)}</td>
                <td>{formatConsultationListDateTimeMsk(booking.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="empty">Бронирований нет</p>}
      <p className="note">
        Показано: {rows.length} из {bookings.length}
      </p>
    </section>
  );
}
